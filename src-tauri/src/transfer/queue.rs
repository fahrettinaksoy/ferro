//! Transfer yöneticisi — `TransferQueue.ts` + `SessionManager` transfer bölümü karşılığı.
//!
//! Basitleştirilmiş model: her transfer KENDİ (ayrı) bağlantısını kurar; böylece
//! transferler birbirini ve taramayı bloklamaz. Eşzamanlılık bir semafor ile,
//! duraklatma bir `Notify` ile sınırlanır. Retry + resume + dosya-var politikası +
//! iptal + ilerleme (`transfer:update`) desteklenir.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::AppHandle;
use tokio::sync::{Notify, Semaphore};

use crate::bridge::emit_event;
use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::{
    EntryType, FileExistsAction, TransferDirection, TransferJob, TransferJobStatus,
};

use super::client::{Throttle, TransferClient, TransferCtx};
use super::session::SessionManager;

const DEFAULT_CONCURRENCY: usize = 3;
const MAX_WALK_DEPTH: usize = 64;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(120);

/// Bir transferin ayarlar anlık görüntüsü (enqueue anında okunur).
#[derive(Clone)]
pub struct TransferParams {
    pub retry_max_attempts: u32,
    pub retry_delay_ms: u64,
    pub file_exists: FileExistsAction,
    /// Bant genişliği sınırı (bayt/sn); 0 = sınırsız.
    pub bandwidth_bps: u64,
}

struct JobState {
    cancel: Arc<AtomicBool>,
}

pub struct TransferManager {
    sessions: Arc<SessionManager>,
    jobs: Mutex<HashMap<String, JobState>>,
    counter: AtomicU64,
    paused: AtomicBool,
    resume_notify: Notify,
    semaphore: Arc<Semaphore>,
}

impl TransferManager {
    pub fn new(sessions: Arc<SessionManager>) -> Self {
        Self {
            sessions,
            jobs: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(0),
            paused: AtomicBool::new(false),
            resume_notify: Notify::new(),
            semaphore: Arc::new(Semaphore::new(DEFAULT_CONCURRENCY)),
        }
    }

    fn next_id(&self, session_id: &str) -> String {
        format!("{session_id}:j{}", self.counter.fetch_add(1, Ordering::Relaxed) + 1)
    }

    pub fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
        if !paused {
            self.resume_notify.notify_waiters();
        }
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }

    pub fn cancel(&self, job_id: &str) {
        if let Some(js) = self.jobs.lock().unwrap().get(job_id) {
            js.cancel.store(true, Ordering::Relaxed);
        }
    }

    /// Tek bir dosya transferini kuyruğa alır; jobId döner. Task arka planda çalışır.
    #[allow(clippy::too_many_arguments)]
    pub fn enqueue_file(
        self: &Arc<Self>,
        app: AppHandle,
        session_id: String,
        direction: TransferDirection,
        remote_path: String,
        local_path: String,
        name: String,
        params: TransferParams,
    ) -> String {
        let job_id = self.next_id(&session_id);
        let cancel = Arc::new(AtomicBool::new(false));
        self.jobs.lock().unwrap().insert(job_id.clone(), JobState { cancel: cancel.clone() });

        let mgr = self.clone();
        let job_id_task = job_id.clone();
        let mut job = TransferJob {
            id: job_id.clone(),
            session_id: session_id.clone(),
            direction,
            name,
            remote_path: remote_path.clone(),
            local_path: local_path.clone(),
            status: TransferJobStatus::Queued,
            bytes: 0,
            total: None,
            error: None,
            attempt: Some(0),
        };
        emit_job(&app, &job);

        tauri::async_runtime::spawn(async move {
            // Duraklatılmışsa sürdürülene kadar bekle.
            while mgr.is_paused() && !cancel.load(Ordering::Relaxed) {
                mgr.resume_notify.notified().await;
            }
            let _permit = mgr.semaphore.clone().acquire_owned().await.ok();

            let max_attempts = params.retry_max_attempts.max(1);
            for attempt in 0..max_attempts {
                if cancel.load(Ordering::Relaxed) {
                    break;
                }
                job.attempt = Some(attempt);
                job.status = TransferJobStatus::Active;
                job.error = None;
                emit_job(&app, &job);

                let app2 = app.clone();
                let mgr2 = mgr.clone();
                let cancel2 = cancel.clone();
                let params2 = params.clone();
                let (sid, rp, lp) = (session_id.clone(), remote_path.clone(), local_path.clone());
                let job_for_progress = job.clone();

                let result = tokio::task::spawn_blocking(move || {
                    run_one(&app2, &mgr2, &sid, direction, &rp, &lp, &params2, cancel2, job_for_progress)
                })
                .await
                .unwrap_or_else(|e| {
                    Err(FerroError::with_detail(FerroErrorCode::Unknown, "Transfer görevi çöktü", e.to_string()))
                });

                match result {
                    Ok(final_bytes) => {
                        job.bytes = final_bytes;
                        job.status = TransferJobStatus::Completed;
                        emit_job(&app, &job);
                        break;
                    }
                    Err(e) if e.code == FerroErrorCode::Cancelled => {
                        job.status = TransferJobStatus::Cancelled;
                        job.error = Some(e.message);
                        emit_job(&app, &job);
                        break;
                    }
                    Err(e) => {
                        let retryable = is_retryable(e.code) && attempt + 1 < max_attempts;
                        if retryable {
                            job.status = TransferJobStatus::Queued;
                            job.error = Some(e.message.clone());
                            emit_job(&app, &job);
                            let backoff = params.retry_delay_ms * (1u64 << attempt.min(6));
                            tokio::time::sleep(Duration::from_millis(backoff)).await;
                        } else {
                            job.status = TransferJobStatus::Failed;
                            job.error = Some(e.message);
                            emit_job(&app, &job);
                            break;
                        }
                    }
                }
            }
            mgr.jobs.lock().unwrap().remove(&job_id_task);
        });

        job_id
    }

    /// Bir dizin ağacını dolaşıp tek tek dosya işleri kuyruğa alır (fire-and-forget).
    #[allow(clippy::too_many_arguments)]
    pub fn enqueue_directory(
        self: &Arc<Self>,
        app: AppHandle,
        session_id: String,
        direction: TransferDirection,
        remote_path: String,
        local_path: String,
        params: TransferParams,
    ) {
        let mgr = self.clone();
        tauri::async_runtime::spawn(async move {
            let app2 = app.clone();
            let mgr2 = mgr.clone();
            let (sid, rp, lp) = (session_id.clone(), remote_path.clone(), local_path.clone());
            // Yürüyüş uzak listeleme gerektirir → ayrı istemci, spawn_blocking.
            let files = tokio::task::spawn_blocking(move || {
                walk(&app2, &mgr2, &sid, direction, &rp, &lp)
            })
            .await
            .unwrap_or_else(|_| Vec::new());

            for f in files {
                mgr.enqueue_file(app.clone(), session_id.clone(), direction, f.remote, f.local, f.name, params.clone());
            }
        });
    }
}

struct WalkFile {
    remote: String,
    local: String,
    name: String,
}

/// Dizin ağacını dolaşır ve dosya işlerinin listesini döndürür.
fn walk(
    app: &AppHandle,
    mgr: &TransferManager,
    session_id: &str,
    direction: TransferDirection,
    remote_root: &str,
    local_root: &str,
) -> Vec<WalkFile> {
    let mut out = Vec::new();
    match direction {
        TransferDirection::Download => {
            let mut client = match mgr.sessions.build_transfer_client(session_id, app) {
                Ok(c) => c,
                Err(_) => return out,
            };
            walk_download(client.as_mut(), remote_root, local_root, 0, &mut out);
            client.disconnect();
        }
        TransferDirection::Upload => {
            let mut client = match mgr.sessions.build_transfer_client(session_id, app) {
                Ok(c) => c,
                Err(_) => return out,
            };
            walk_upload(client.as_mut(), remote_root, local_root, 0, &mut out);
            client.disconnect();
        }
    }
    out
}

fn walk_download(client: &mut dyn TransferClient, remote: &str, local: &str, depth: usize, out: &mut Vec<WalkFile>) {
    if depth > MAX_WALK_DEPTH {
        return;
    }
    let _ = std::fs::create_dir_all(local);
    let entries = match client.list(Some(remote)) {
        Ok(e) => e,
        Err(_) => return,
    };
    for e in entries {
        if e.name == "." || e.name == ".." {
            continue;
        }
        let child_remote = format!("{}/{}", remote.trim_end_matches('/'), e.name);
        let child_local = Path::new(local).join(&e.name).to_string_lossy().to_string();
        match e.entry_type {
            EntryType::Directory => walk_download(client, &child_remote, &child_local, depth + 1, out),
            EntryType::Symlink | EntryType::Unknown => {} // sembolik linkler atlanır
            EntryType::File => out.push(WalkFile { remote: child_remote, local: child_local, name: e.name }),
        }
    }
}

fn walk_upload(client: &mut dyn TransferClient, remote: &str, local: &str, depth: usize, out: &mut Vec<WalkFile>) {
    if depth > MAX_WALK_DEPTH {
        return;
    }
    let _ = client.mkdir(remote); // varsa hata yok sayılır
    let read = match std::fs::read_dir(local) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in read.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let child_local = entry.path().to_string_lossy().to_string();
        let child_remote = format!("{}/{}", remote.trim_end_matches('/'), name);
        if meta.is_symlink() {
            continue;
        }
        if meta.is_dir() {
            walk_upload(client, &child_remote, &child_local, depth + 1, out);
        } else {
            out.push(WalkFile { remote: child_remote, local: child_local, name });
        }
    }
}

/// Tek transferi yürütür (bloklayan): istemci kur → planla → aktar. final bayt döner.
#[allow(clippy::too_many_arguments)]
fn run_one(
    app: &AppHandle,
    mgr: &TransferManager,
    session_id: &str,
    direction: TransferDirection,
    remote_path: &str,
    local_path: &str,
    params: &TransferParams,
    cancel: Arc<AtomicBool>,
    mut job: TransferJob,
) -> FerroResult<u64> {
    let mut client = mgr.sessions.build_transfer_client(session_id, app)?;

    // Plan: kaynak/hedef boyutları + dosya-var politikası → startAt / skip.
    let plan = plan_transfer(client.as_mut(), direction, remote_path, local_path, params.file_exists)?;
    if plan.skip {
        return Ok(plan.start_at);
    }
    job.total = plan.total;

    let app2 = app.clone();
    let mut last = Instant::now();
    let mut job_progress = job.clone();
    let mut ctx = TransferCtx {
        start_at: plan.start_at,
        cancel: cancel.clone(),
        throttle: if params.bandwidth_bps > 0 { Some(Throttle::new(params.bandwidth_bps)) } else { None },
        on_progress: Box::new(move |bytes, total| {
            if last.elapsed() >= PROGRESS_INTERVAL {
                last = Instant::now();
                job_progress.bytes = bytes;
                job_progress.total = total;
                job_progress.status = TransferJobStatus::Active;
                emit_job(&app2, &job_progress);
            }
        }),
    };

    let result = match direction {
        TransferDirection::Download => client.download(remote_path, Path::new(local_path), &mut ctx),
        TransferDirection::Upload => client.upload(Path::new(local_path), remote_path, &mut ctx),
    };
    let final_bytes = job.total.unwrap_or(0);
    client.disconnect();
    result.map(|_| final_bytes)
}

struct Plan {
    start_at: u64,
    total: Option<u64>,
    skip: bool,
}

/// Dosya-var politikasına göre başlangıç offset'i / atlama kararı.
fn plan_transfer(
    client: &mut dyn TransferClient,
    direction: TransferDirection,
    remote_path: &str,
    local_path: &str,
    policy: FileExistsAction,
) -> FerroResult<Plan> {
    let (source_size, dest_size): (Option<u64>, Option<u64>) = match direction {
        TransferDirection::Download => {
            let src = client.stat(remote_path).ok().map(|e| e.size);
            let dst = std::fs::metadata(local_path).ok().map(|m| m.len());
            (src, dst)
        }
        TransferDirection::Upload => {
            let src = std::fs::metadata(local_path).ok().map(|m| m.len());
            let dst = client.stat(remote_path).ok().map(|e| e.size);
            (src, dst)
        }
    };
    // Hedef yoksa baştan aktar.
    let Some(dest) = dest_size else {
        return Ok(Plan { start_at: 0, total: source_size, skip: false });
    };
    match policy {
        FileExistsAction::Skip => Ok(Plan { start_at: 0, total: source_size, skip: true }),
        FileExistsAction::Overwrite => Ok(Plan { start_at: 0, total: source_size, skip: false }),
        // Varsayılan resume: hedef daha küçükse kaldığı yerden, eşit/büyükse tamamlanmış say.
        _ => {
            if let Some(src) = source_size {
                if dest < src {
                    Ok(Plan { start_at: dest, total: source_size, skip: false })
                } else {
                    Ok(Plan { start_at: dest, total: source_size, skip: true })
                }
            } else {
                Ok(Plan { start_at: 0, total: source_size, skip: false })
            }
        }
    }
}

fn is_retryable(code: FerroErrorCode) -> bool {
    matches!(
        code,
        FerroErrorCode::ConnectionFailed
            | FerroErrorCode::TransferFailed
            | FerroErrorCode::NotConnected
            | FerroErrorCode::Timeout
            | FerroErrorCode::Unknown
    )
}

fn emit_job(app: &AppHandle, job: &TransferJob) {
    if let Ok(v) = serde_json::to_value(job) {
        emit_event(app, "transfer:update", v);
    } else {
        emit_event(app, "transfer:update", json!({ "id": job.id }));
    }
}
