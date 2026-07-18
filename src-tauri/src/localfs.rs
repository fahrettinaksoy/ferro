//! Yerel dosya sistemi işlemleri — `handlers/local.ts` + `localPaths.ts` karşılığı.
//! Yerel panel için listeleme + güvenli (guard'lı) mkdir/delete/rename.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::{EntryType, LocalEntry};

/// Kullanıcı ev dizini (local:home + yıkıcı-işlem koruması için).
pub fn home_dir() -> PathBuf {
    #[cfg(windows)]
    let key = "USERPROFILE";
    #[cfg(not(windows))]
    let key = "HOME";
    std::env::var_os(key).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

/// Yol mutlak + NUL içermez olmalı (`safeLocalPath`).
fn safe_local_path(p: &str) -> FerroResult<PathBuf> {
    if p.contains('\0') {
        return Err(FerroError::new(FerroErrorCode::Validation, "Geçersiz yol"));
    }
    let path = PathBuf::from(p);
    if !path.is_absolute() {
        return Err(FerroError::new(FerroErrorCode::Validation, "Yol mutlak olmalı"));
    }
    Ok(path)
}

/// Yıkıcı işlem koruması: fs kökü / sürücü kökü / ev dizininin KENDİSİ yasak.
fn safe_destructive_path(p: &str) -> FerroResult<PathBuf> {
    let path = safe_local_path(p)?;
    let is_root = path.parent().is_none();
    let is_home = path == home_dir();
    if is_root || is_home {
        return Err(FerroError::new(
            FerroErrorCode::PermissionDenied,
            "Bu dizin silinemez/taşınamaz (kök ya da ev dizini)",
        ));
    }
    Ok(path)
}

fn mtime_ms(meta: &std::fs::Metadata) -> Option<i64> {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
}

pub fn home() -> String {
    home_dir().to_string_lossy().to_string()
}

/// Dizini listeler. Sembolik link bir dizini gösteriyorsa `directory` sayılır.
pub fn list(path: &str) -> FerroResult<(String, Vec<LocalEntry>)> {
    let dir = safe_local_path(path)?;
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let full = entry.path();
        // symlink_metadata: link'in kendisini görür.
        let link_meta = match std::fs::symlink_metadata(&full) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let is_symlink = link_meta.file_type().is_symlink();
        // İçerik metadata'sı (link ise hedefe çözülür).
        let meta = std::fs::metadata(&full).ok();
        let entry_type = if is_symlink {
            match &meta {
                Some(m) if m.is_dir() => EntryType::Directory,
                _ => EntryType::Symlink,
            }
        } else if link_meta.is_dir() {
            EntryType::Directory
        } else if link_meta.is_file() {
            EntryType::File
        } else {
            EntryType::Unknown
        };
        let (size, modified_at) = match &meta {
            Some(m) => (m.len(), mtime_ms(m)),
            None => (0, None),
        };
        entries.push(LocalEntry {
            name,
            entry_type,
            size,
            modified_at,
            path: full.to_string_lossy().to_string(),
        });
    }
    Ok((dir.to_string_lossy().to_string(), entries))
}

pub fn mkdir(path: &str) -> FerroResult<()> {
    let p = safe_local_path(path)?;
    // Recursive değil (tek dizin oluşturur).
    std::fs::create_dir(&p)?;
    Ok(())
}

pub fn delete(path: &str) -> FerroResult<()> {
    let p = safe_destructive_path(path)?;
    let meta = std::fs::symlink_metadata(&p)?;
    if meta.is_dir() {
        std::fs::remove_dir_all(&p)?;
    } else {
        std::fs::remove_file(&p)?;
    }
    Ok(())
}

pub fn rename(from: &str, to: &str) -> FerroResult<()> {
    let src = safe_destructive_path(from)?;
    let dst = safe_local_path(to)?;
    std::fs::rename(&src, &dst)?;
    Ok(())
}

/// Yerel dosya var mı + boyutu (transfer planlaması için — Phase 3).
pub fn stat_size(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok().map(|m| m.len())
}
