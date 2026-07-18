//! Protokol istemcisi ortak sözleşmesi — `IFileTransferClient.ts` karşılığı.
//!
//! Metotlar **bloklayan**dır: SFTP (async russh) kendi tokio runtime'ında
//! `block_on` yapar, FTP (senkron suppaftp) doğrudan çalışır. Çağıranlar bu
//! bloklayan metotları `spawn_blocking` içinde kullanır (async runtime'ı bloklamaz).

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::error::FerroResult;
use crate::types::{ProxyConfig, RemoteEntry, TransferTypeConfig};

/// Bant genişliği sınırlayıcı (token-bucket, uyku tabanlı). bps=0 → sınırsız.
pub struct Throttle {
    bps: u64,
    capacity: f64,
    tokens: f64,
    last: Instant,
}

impl Throttle {
    pub fn new(bps: u64) -> Self {
        // Patlama penceresi 0.25s, en az 16 KiB.
        let capacity = (bps as f64 * 0.25).max(16.0 * 1024.0);
        Self {
            bps,
            capacity,
            tokens: capacity,
            last: Instant::now(),
        }
    }

    /// n bayt için gereken jetonu tüketir; yetmiyorsa açığı bekler.
    pub fn consume(&mut self, n: usize) {
        if self.bps == 0 {
            return;
        }
        let n = n as f64;
        let elapsed = self.last.elapsed().as_secs_f64();
        self.last = Instant::now();
        self.tokens = (self.tokens + elapsed * self.bps as f64).min(self.capacity);
        if self.tokens < n {
            let wait = (n - self.tokens) / self.bps as f64;
            std::thread::sleep(Duration::from_secs_f64(wait));
            self.tokens = 0.0;
        } else {
            self.tokens -= n;
        }
    }
}

/// Adaptör kurulum seçenekleri (uygulama geneli çalışma zamanı ayarlarından).
#[derive(Clone)]
pub struct AdapterOptions {
    pub connect_timeout_ms: u64,
    /// FTP keep-alive (periyodik NOOP).
    pub keep_alive: bool,
    /// Vekil sunucu (yalnızca SFTP).
    pub proxy: Option<ProxyConfig>,
    /// FTP ASCII/binary kuralları.
    pub transfer_type: TransferTypeConfig,
}

/// Transfer sırasında ilerleme + iptal + throttle.
pub struct TransferCtx {
    /// (aktarılan_bayt, toplam?) — progress için çağrılır.
    pub on_progress: Box<dyn FnMut(u64, Option<u64>) + Send>,
    /// İptal sinyali (kuyruk set eder).
    pub cancel: Arc<AtomicBool>,
    /// Kaldığı yerden devam (resume) — başlangıç offset'i.
    pub start_at: u64,
    /// Bant genişliği sınırlayıcı (opsiyonel).
    pub throttle: Option<Throttle>,
}

impl TransferCtx {
    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Bir yığın aktarıldıktan sonra bant genişliğini uygular.
    pub fn pace(&mut self, n: usize) {
        if let Some(t) = &mut self.throttle {
            t.consume(n);
        }
    }
}

/// Tüm protokollerin (FTP/FTPS/SFTP) uyduğu bloklayan sözleşme.
/// Yol parametreleri POSIX ('/') uzak yollardır.
pub trait TransferClient: Send {
    fn connected(&self) -> bool;
    fn supports_resume(&self) -> bool {
        true
    }

    fn pwd(&mut self) -> FerroResult<String>;
    fn cwd(&mut self, path: &str) -> FerroResult<String>;
    fn list(&mut self, path: Option<&str>) -> FerroResult<Vec<RemoteEntry>>;
    fn stat(&mut self, path: &str) -> FerroResult<RemoteEntry>;

    fn download(
        &mut self,
        remote_path: &str,
        dest: &Path,
        ctx: &mut TransferCtx,
    ) -> FerroResult<()>;
    fn upload(
        &mut self,
        source: &Path,
        remote_path: &str,
        ctx: &mut TransferCtx,
    ) -> FerroResult<()>;

    fn delete(&mut self, path: &str) -> FerroResult<()>;
    fn rename(&mut self, from: &str, to: &str) -> FerroResult<()>;
    fn mkdir(&mut self, path: &str) -> FerroResult<()>;
    fn rmdir(&mut self, path: &str) -> FerroResult<()>;
    fn chmod(&mut self, path: &str, mode: u32) -> FerroResult<()>;

    fn disconnect(&mut self);
}

/// Bir dosyanın ASCII modunda mı aktarılacağını belirler — `transferType.ts` karşılığı.
pub fn is_ascii_transfer(name: &str, tt: &TransferTypeConfig) -> bool {
    use crate::types::TransferTypeMode::*;
    match tt.mode {
        Binary => false,
        Ascii => true,
        Auto => {
            let base = name.rsplit('/').next().unwrap_or(name);
            if base.starts_with('.') {
                return tt.dotfiles_as_ascii;
            }
            match base.rsplit_once('.') {
                None => tt.no_ext_as_ascii,
                Some((_, ext)) => tt
                    .ascii_extensions
                    .iter()
                    .any(|e| e.eq_ignore_ascii_case(ext)),
            }
        }
    }
}

/// POSIX yol çözümü — göreli yolu `cwd`'ye göre normalize eder (SFTP resolve karşılığı).
pub fn resolve_posix(cwd: &str, path: &str) -> String {
    let joined = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("{}/{}", cwd.trim_end_matches('/'), path)
    };
    normalize_posix(&joined)
}

/// `.`/`..` sadeleştirmesiyle POSIX normalize.
pub fn normalize_posix(path: &str) -> String {
    let absolute = path.starts_with('/');
    let mut out: Vec<&str> = Vec::new();
    for seg in path.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                if matches!(out.last(), Some(&s) if s != "..") {
                    out.pop();
                } else if !absolute {
                    out.push("..");
                }
            }
            s => out.push(s),
        }
    }
    let joined = out.join("/");
    if absolute {
        format!("/{joined}")
    } else if joined.is_empty() {
        ".".to_string()
    } else {
        joined
    }
}
