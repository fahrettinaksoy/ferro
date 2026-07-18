//! Rotasyonlu dosya loglaması — `core/logger.ts` karşılığı.
//! Global bir örnek; serbest fonksiyonlar (session:log, köprü hataları) erişebilsin.
//! Satır biçimi: `<ISO> [LEVEL] [scope] mesaj`. Sırlar (parola vb.) maskelenir.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const LOG_NAME: &str = "ferro.log";
const MAX_ROTATED: u32 = 4;

struct Inner {
    dir: PathBuf,
    enabled: bool,
    max_bytes: u64,
    file: Option<File>,
    size: u64,
}

static INSTANCE: OnceLock<Mutex<Inner>> = OnceLock::new();

fn inst() -> &'static Mutex<Inner> {
    INSTANCE.get_or_init(|| {
        Mutex::new(Inner {
            dir: std::env::temp_dir(),
            enabled: false,
            max_bytes: 5 * 1024 * 1024,
            file: None,
            size: 0,
        })
    })
}

/// Log dizinini ayarlar (açılışta).
pub fn init(dir: PathBuf) {
    let mut i = inst().lock().unwrap();
    i.dir = dir;
}

/// Dosya loglamayı yapılandırır (settings:apply).
pub fn configure(to_file: bool, max_size_mib: u32) {
    let mut i = inst().lock().unwrap();
    i.enabled = to_file;
    i.max_bytes = (max_size_mib.max(1) as u64) * 1024 * 1024;
    if !to_file {
        i.file = None;
    }
}

/// Sır maskeleme (parola/PASS/secret satırları).
fn redact(s: &str) -> String {
    let low = s.to_lowercase();
    if low.contains("pass ")
        || low.contains("password")
        || low.contains("secret")
        || low.contains("passphrase")
    {
        // İçeriğin gövdesini gizle — tanı için yalnızca başlığı bırak.
        if let Some(idx) = low.find("pass") {
            let head = &s[..idx];
            return format!("{head}*** (redacted)");
        }
        return "*** (redacted)".to_string();
    }
    s.to_string()
}

fn rotate(i: &mut Inner) {
    let base = i.dir.join(LOG_NAME);
    i.file = None;
    let _ = std::fs::remove_file(i.dir.join(format!("{LOG_NAME}.{MAX_ROTATED}")));
    for n in (1..MAX_ROTATED).rev() {
        let from = i.dir.join(format!("{LOG_NAME}.{n}"));
        let to = i.dir.join(format!("{LOG_NAME}.{}", n + 1));
        let _ = std::fs::rename(&from, &to);
    }
    let _ = std::fs::rename(&base, i.dir.join(format!("{LOG_NAME}.1")));
    i.size = 0;
}

/// Bir log satırı yazar (dosya loglama açıksa). Her zaman stderr'e de gider.
pub fn log(level: &str, scope: &str, msg: &str) {
    let line = format!(
        "{} [{}] [{}] {}",
        now_iso(),
        level.to_uppercase(),
        scope,
        redact(msg)
    );
    eprintln!("{line}");

    let mut i = inst().lock().unwrap();
    if !i.enabled {
        return;
    }
    // Rotasyon.
    if i.size >= i.max_bytes {
        rotate(&mut i);
    }
    if i.file.is_none() {
        let _ = std::fs::create_dir_all(&i.dir);
        let path = i.dir.join(LOG_NAME);
        i.size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        i.file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ok();
    }
    if let Some(f) = i.file.as_mut() {
        let bytes = line.as_bytes();
        if writeln!(f, "{line}").is_ok() {
            i.size += bytes.len() as u64 + 1;
        }
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}
