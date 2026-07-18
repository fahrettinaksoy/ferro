//! Otomatik güncelleme — `core/updater.ts` karşılığı (tauri-plugin-updater).
//!
//! Kontrol açılışta yapılır; güncelleme varsa indirilip kurulur. Güncelleme
//! altyapısı YALNIZCA `tauri.conf.json` içine `plugins.updater` (endpoints +
//! pubkey) eklendiğinde ETKİNDİR — anahtar `tauri signer generate` ile üretilir,
//! özel anahtar CI secret'i (TAURI_SIGNING_PRIVATE_KEY) olarak verilir. Yapılandırma
//! yoksa kontrol sessizce atlanır (dev + imzasız dağıtım kırılmaz).

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Açılışta güncelleme kontrolü (hata durumunda sessizce atlanır).
pub async fn check(app: AppHandle) {
    match run(&app).await {
        Ok(true) => crate::logger::log("info", "updater", "Güncelleme indirildi ve kuruldu"),
        Ok(false) => crate::logger::log("info", "updater", "Güncel sürüm kullanılıyor"),
        Err(e) => crate::logger::log("info", "updater", &format!("Güncelleme kontrolü atlandı: {e}")),
    }
}

async fn run(app: &AppHandle) -> Result<bool, Box<dyn std::error::Error>> {
    let updater = app.updater()?;
    if let Some(update) = updater.check().await? {
        update.download_and_install(|_downloaded, _total| {}, || {}).await?;
        return Ok(true);
    }
    Ok(false)
}
