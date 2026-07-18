//! Ferro — Tauri v2 uygulama giriş noktası (masaüstü + mobil ortak `run`).
//!
//! Uygulama mimarisi:
//!   • renderer (Vue) tek köprüden konuşur: `window.ferro.invoke` → `bridge_invoke`
//!   • main → renderer olayları Tauri'nin adlandırılmış olay sistemiyle yayınlanır
//!   • tüm yerel çekirdek (FTP/SFTP/kripto/sync) Rust'ta — Node.js yok.

// Göç sürüyor: bazı yardımcılar/alanlar (log dizini, ayar getter'ları, hata kodları)
// yaklaşan fazlarda (Phase 5 loglama/menü, Phase 3b throttle/proxy) bağlanacak.
// O zamana dek dead_code uyarısı üretmemeleri için bilinçli olarak susturulur.
#![allow(dead_code)]

mod bridge;
mod crypto;
mod error;
mod handlers;
mod localfs;
mod logger;
mod menu;
mod paths;
mod settings;
mod state;
mod store;
mod sync;
mod team;
mod transfer;
mod types;
mod updater;
mod vault;

use paths::Paths;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;
            // Uygulama dizinlerini çöz ve paylaşılan durumu kur.
            let paths = Paths::resolve(app.handle());
            logger::init(paths.log_dir.clone());
            app.manage(AppState::new(paths));

            // Uygulama menüsü.
            if let Ok(menu) = menu::build(app.handle()) {
                let _ = app.set_menu(menu);
            }

            // Pencere hazır olunca göster.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
            }

            // Açılışta güncelleme kontrolü (yapılandırılmışsa; değilse sessizce atlanır).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                updater::check(handle).await;
            });
            Ok(())
        })
        .on_menu_event(|app, event| menu::on_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![bridge::bridge_invoke])
        .build(tauri::generate_context!())
        .expect("Ferro başlatılamadı")
        .run(|app, event| {
            use tauri::{Manager, RunEvent};
            // Çıkışta tüm oturumları düzgünce kapat.
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = app.try_state::<AppState>() {
                    state.edits.stop_all();
                    state.sessions.disconnect_all();
                }
            }
        });
}
