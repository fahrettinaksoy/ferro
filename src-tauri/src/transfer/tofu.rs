//! TOFU (Trust On First Use) doğrulayıcılar + kalıcı depolar.
//!  • SFTP host anahtarları  → `known_hosts.json`  (HostKeyVerifier.ts)
//!  • FTPS sertifikaları      → `trusted_certs.json` (TlsVerifier.ts)
//!
//! Doğrulama, oturum actor thread'inden çağrılır: renderer'a `hostkey:verify` /
//! `tls:verify` olayı yayınlanır, kullanıcı kararı `*:decision` handler'ından
//! bir std-kanal üzerinden gelir (5 dk zaman aşımı → reddet).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::bridge::emit_event;
use crate::store::json_store::{read_versioned, write_versioned, ReadOutcome};

const DECISION_TIMEOUT: Duration = Duration::from_secs(300);
const STORE_VERSION: u32 = 1;

/// "host:port" → sha256 parmak izi eşlemesi (her iki TOFU deposu da bunu kullanır).
type FpMap = HashMap<String, String>;

fn key(host: &str, port: u16) -> String {
    format!("{host}:{port}")
}

fn load_map(file: &Path) -> FpMap {
    let legacy = |parsed: &Value| -> Option<FpMap> {
        // Zarf öncesi: çıplak string→string nesnesi.
        parsed.as_object().and_then(|_| serde_json::from_value(parsed.clone()).ok())
    };
    match read_versioned::<FpMap, _>(file, STORE_VERSION, legacy) {
        ReadOutcome::Loaded(m) => m,
        _ => FpMap::new(),
    }
}

/// Bekleyen bir kullanıcı kararı (requestId → karar göndericisi).
struct Pending {
    senders: HashMap<String, Sender<bool>>,
    counter: u64,
}

pub struct Tofu {
    known_hosts_file: PathBuf,
    trusted_certs_file: PathBuf,
    known_hosts: Mutex<FpMap>,
    trusted_certs: Mutex<FpMap>,
    /// Parmak izsiz onaylanan FTPS sunucuları (yalnızca oturum boyu, diske yazılmaz).
    session_trusted: Mutex<HashSet<String>>,
    pending: Mutex<Pending>,
}

impl Tofu {
    pub fn new(config_dir: &Path) -> Self {
        let known_hosts_file = config_dir.join("known_hosts.json");
        let trusted_certs_file = config_dir.join("trusted_certs.json");
        let known_hosts = Mutex::new(load_map(&known_hosts_file));
        let trusted_certs = Mutex::new(load_map(&trusted_certs_file));
        Self {
            known_hosts_file,
            trusted_certs_file,
            known_hosts,
            trusted_certs,
            session_trusted: Mutex::new(HashSet::new()),
            pending: Mutex::new(Pending { senders: HashMap::new(), counter: 0 }),
        }
    }

    /// Bir requestId üretir, göndericiyi kaydeder, alıcıyı döner.
    fn register(&self, prefix: &str) -> (String, Receiver<bool>) {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut p = self.pending.lock().unwrap();
        p.counter += 1;
        let id = format!("{prefix}{}", p.counter);
        p.senders.insert(id.clone(), tx);
        (id, rx)
    }

    /// Kullanıcı kararını ilgili bekleyene iletir (`hostkey:decision`/`tls:decision`).
    pub fn resolve(&self, request_id: &str, accept: bool) {
        let sender = self.pending.lock().unwrap().senders.remove(request_id);
        if let Some(tx) = sender {
            let _ = tx.send(accept);
        }
    }

    // ── SFTP host anahtarı ───────────────────────────────────────────────────

    /// Host anahtarını doğrular. Bilinen+eşleşiyorsa true; aksi halde kullanıcıya
    /// sorar (5 dk zaman aşımı → false). Kabulde known_hosts'a yazılır.
    pub fn verify_host_key(&self, app: &AppHandle, host: &str, port: u16, fingerprint: &str) -> bool {
        let k = key(host, port);
        let known = self.known_hosts.lock().unwrap().get(&k).cloned();
        if known.as_deref() == Some(fingerprint) {
            return true;
        }
        let changed = known.as_deref().map(|f| f != fingerprint).unwrap_or(false);
        let (request_id, rx) = self.register("hk");
        emit_event(
            app,
            "hostkey:verify",
            json!({
                "requestId": request_id,
                "host": host,
                "port": port,
                "fingerprint": fingerprint,
                "changed": changed,
            }),
        );
        let accepted = rx.recv_timeout(DECISION_TIMEOUT).unwrap_or(false);
        if accepted {
            let mut kh = self.known_hosts.lock().unwrap();
            kh.insert(k, fingerprint.to_string());
            let _ = write_versioned(&self.known_hosts_file, STORE_VERSION, &*kh);
        } else {
            self.pending.lock().unwrap().senders.remove(&request_id);
        }
        accepted
    }

    // ── FTPS sertifikası ─────────────────────────────────────────────────────

    /// Sertifikayı doğrular (pinleme + TOFU). fingerprint None ise parmak izi
    /// alınamamış demektir; onaylanırsa yalnızca oturum boyu güvenilir sayılır.
    pub fn verify_cert(
        &self,
        app: &AppHandle,
        host: &str,
        port: u16,
        detail: &str,
        fingerprint: Option<&str>,
    ) -> bool {
        let k = key(host, port);
        let pinned = self.trusted_certs.lock().unwrap().get(&k).cloned();
        if let (Some(fp), Some(pin)) = (fingerprint, pinned.as_deref()) {
            if fp == pin {
                return true;
            }
        }
        if fingerprint.is_none() && self.session_trusted.lock().unwrap().contains(&k) {
            return true;
        }
        let changed = match (pinned.as_deref(), fingerprint) {
            (Some(pin), Some(fp)) => pin != fp,
            _ => false,
        };
        let (request_id, rx) = self.register("tls");
        emit_event(
            app,
            "tls:verify",
            json!({
                "requestId": request_id,
                "host": host,
                "port": port,
                "detail": detail,
                "fingerprint": fingerprint,
                "changed": changed,
            }),
        );
        let accepted = rx.recv_timeout(DECISION_TIMEOUT).unwrap_or(false);
        if accepted {
            match fingerprint {
                Some(fp) => {
                    let mut tc = self.trusted_certs.lock().unwrap();
                    tc.insert(k, fp.to_string());
                    let _ = write_versioned(&self.trusted_certs_file, STORE_VERSION, &*tc);
                }
                None => {
                    self.session_trusted.lock().unwrap().insert(k);
                }
            }
        } else {
            self.pending.lock().unwrap().senders.remove(&request_id);
        }
        accepted
    }
}
