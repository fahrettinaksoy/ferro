//! Tek seviye dizin karşılaştırması — `SessionManager.compareDirs` karşılığı.
//! Yerel dizin ile uzak listeyi ada göre birleştirip `SyncEntry[]` üretir.

use std::collections::BTreeMap;
use std::time::UNIX_EPOCH;

use crate::types::{EntryType, RemoteEntry, SyncEntry};

struct LocalInfo {
    is_dir: bool,
    size: u64,
    mtime: Option<i64>,
}

pub fn compare_dirs(local_path: &str, remote: &[RemoteEntry]) -> Vec<SyncEntry> {
    // Yerel girdiler.
    let mut locals: BTreeMap<String, LocalInfo> = BTreeMap::new();
    if let Ok(read) = std::fs::read_dir(local_path) {
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Ok(meta) = entry.metadata() {
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64);
                locals.insert(name, LocalInfo { is_dir: meta.is_dir(), size: meta.len(), mtime });
            }
        }
    }

    let mut out: BTreeMap<String, SyncEntry> = BTreeMap::new();

    // Uzak girdiler.
    for r in remote {
        if r.name == "." || r.name == ".." {
            continue;
        }
        let is_dir = matches!(r.entry_type, EntryType::Directory);
        out.insert(
            r.name.clone(),
            SyncEntry {
                name: r.name.clone(),
                is_directory: is_dir,
                in_local: false,
                in_remote: true,
                local_size: None,
                local_mtime: None,
                remote_size: Some(r.size),
                remote_mtime: r.modified_at,
            },
        );
    }

    // Yerelle birleştir.
    for (name, li) in locals {
        out.entry(name.clone())
            .and_modify(|e| {
                e.in_local = true;
                e.local_size = Some(li.size);
                e.local_mtime = li.mtime;
                e.is_directory = e.is_directory || li.is_dir;
            })
            .or_insert(SyncEntry {
                name,
                is_directory: li.is_dir,
                in_local: true,
                in_remote: false,
                local_size: Some(li.size),
                local_mtime: li.mtime,
                remote_size: None,
                remote_mtime: None,
            });
    }

    out.into_values().collect()
}
