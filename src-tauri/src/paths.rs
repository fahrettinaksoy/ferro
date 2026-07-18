//! Uygulama dizinleri — Tauri path API'si üzerinden çözülür.
//!
//! NOT (göç): önceki masaüstü sürümü `userData`'yı uygulama ADIYLA (`~/Library/Application
//! Support/Ferro`) tutuyordu; Tauri identifier (`com.ferro.app`) tabanlıdır.
//! Ayrıca eski `v1:` (safeStorage) parola blob'ları Rust tarafında çözülemez.
//! Bu yüzden Tauri sürümü TEMİZ bir profil ile başlar (siteler seed'den gelir,
//! kayıtlı parolalar bir kez yeniden girilir). Bilinçli bir tasarım kararıdır.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Çözülmüş uygulama dizinleri. `setup()`'ta bir kez üretilip AppState'te tutulur.
#[derive(Debug, Clone)]
pub struct Paths {
    /// Kalıcı veri kökü (sites.json, vault.json, known_hosts.json ...).
    pub config_dir: PathBuf,
    /// Rotasyonlu dosya logları.
    pub log_dir: PathBuf,
    /// Paketlenmiş kaynaklar (seed/sites.seed.json).
    pub resource_dir: PathBuf,
}

impl Paths {
    pub fn resolve(app: &AppHandle) -> Self {
        let p = app.path();
        // app_config_dir: macOS `~/Library/Application Support/com.ferro.app`,
        // Windows `%APPDATA%/com.ferro.app`, Linux `~/.config/com.ferro.app`.
        let config_dir = p.app_config_dir().unwrap_or_else(|_| PathBuf::from("."));
        let log_dir = p.app_log_dir().unwrap_or_else(|_| config_dir.join("logs"));
        let resource_dir = p.resource_dir().unwrap_or_else(|_| PathBuf::from("."));
        Self {
            config_dir,
            log_dir,
            resource_dir,
        }
    }

    /// config_dir altındaki bir depo dosyasının tam yolu.
    pub fn store_file(&self, name: &str) -> PathBuf {
        self.config_dir.join(name)
    }
}
