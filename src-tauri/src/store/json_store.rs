//! Dayanıklı JSON deposu — `src/main/store/jsonStore.ts` karşılığı.
//!  1. Atomik yazma: önce `.tmp`'ye yaz, sonra rename.
//!  2. Sürümlü zarf: `{ version, data }`.
//!  3. Bozulma karantinası: parse edilemeyen dosya `.corrupt` olarak SAKLANIR,
//!     depo varsayılan/boş açılır (kullanıcı verisi silinmez).

use std::fs;
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

/// Değeri `{version, data}` zarfıyla atomik (tmp + rename) yazar.
pub fn write_versioned<T: Serialize>(
    path: &Path,
    version: u32,
    data: &T,
) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let envelope = serde_json::json!({ "version": version, "data": data });
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(&envelope)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    fs::write(&tmp, text)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/// Sürümlü/atomik okuma sonucu.
pub enum ReadOutcome<T> {
    /// Dosya yok — ilk çalıştırma.
    Missing,
    /// Güncel sürüm başarıyla okundu.
    Loaded(T),
    /// Dosya vardı ama bozuktu; `.corrupt`'a alındı.
    Corrupt,
}

/// Sürümlü depoyu okur. `legacy` verilirse zarf öncesi (çıplak) format da denenir.
///
/// - Dosya yok → `Missing`.
/// - Güncel sürüm zarfı → `Loaded`.
/// - Zarf ama farklı sürüm ya da çıplak legacy format → `legacy(parsed)` denenir.
/// - Aksi halde `.corrupt`'a kopyalanır → `Corrupt`.
pub fn read_versioned<T, F>(path: &Path, version: u32, legacy: F) -> ReadOutcome<T>
where
    T: DeserializeOwned,
    F: FnOnce(&Value) -> Option<T>,
{
    let raw = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return ReadOutcome::Missing,
    };

    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return quarantine(path),
    };

    // Zarf mı? { version: number, data: ... }
    if let Some(obj) = parsed.as_object() {
        if let (Some(v), true) = (obj.get("version").and_then(Value::as_u64), obj.contains_key("data")) {
            if v as u32 == version {
                return match serde_json::from_value::<T>(obj["data"].clone()) {
                    Ok(data) => ReadOutcome::Loaded(data),
                    Err(_) => quarantine(path),
                };
            }
            // Farklı sürüm — legacy migrasyonu dene, olmazsa karantina.
            return match legacy(&parsed) {
                Some(data) => ReadOutcome::Loaded(data),
                None => quarantine(path),
            };
        }
    }

    // Çıplak (zarfsız) eski format.
    match legacy(&parsed) {
        Some(data) => ReadOutcome::Loaded(data),
        None => quarantine(path),
    }
}

/// Bozuk dosyayı `.corrupt` kopyasına alır ve `Corrupt` döner.
fn quarantine<T>(path: &Path) -> ReadOutcome<T> {
    let dst = path.with_extension("json.corrupt");
    if let Err(e) = fs::copy(path, &dst) {
        eprintln!("[ferro] {path:?} bozuk ve karantinaya alınamadı: {e}");
    } else {
        eprintln!("[ferro] {path:?} bozuk — kopya {dst:?} olarak saklandı");
    }
    ReadOutcome::Corrupt
}
