//! Uygulama menüsü — `main/index.ts` buildAppMenu karşılığı (Tauri v2 menü API).
//! Menü tıklamaları renderer'a olay yayınlar (`app:menuAction`/`app:togglePanel`/
//! `app:showAbout`). Durum eşitleme (`app:setConnState`/`app:setPanelState`) menü
//! öğelerini id üzerinden günceller.

use serde_json::json;
use tauri::menu::{
    CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Wry};

use crate::error::FerroResult;

// Menü öğe kimlikleri (durum eşitlemede kullanılır).
pub const ID_DISCONNECT: &str = "srv-disconnect";
pub const ID_RECONNECT: &str = "srv-reconnect";
pub const ID_SYNC: &str = "srv-sync";
pub const ID_TRANSFERS: &str = "srv-transfers";
pub const ID_PANEL_SERVERS: &str = "panel-servers";
pub const ID_PANEL_LOG: &str = "panel-log";
pub const ID_PANEL_QUEUE: &str = "panel-queue";

/// Uygulama menüsünü kurar.
pub fn build(app: &AppHandle) -> FerroResult<Menu<Wry>> {
    let is_mac = cfg!(target_os = "macos");

    // Dosya
    let file = SubmenuBuilder::new(app, "Dosya")
        .item(&MenuItemBuilder::with_id("act-siteManager", "Site Yöneticisi").accelerator("CmdOrCtrl+S").build(app)?)
        .item(&MenuItemBuilder::with_id("act-teams", "Ekipler…").accelerator("CmdOrCtrl+Shift+T").build(app)?)
        .item(&MenuItemBuilder::with_id("act-cloudSync", "Senkronizasyon…").accelerator("CmdOrCtrl+Shift+Y").build(app)?)
        .item(&MenuItemBuilder::with_id("act-settings", "Ayarlar…").accelerator("CmdOrCtrl+,").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Kapat"))?)
        .build()?;

    // Sunucu (bağlantı denetimleri — enabled/checked durumları renderer'dan eşitlenir)
    let server = SubmenuBuilder::new(app, "Sunucu")
        .item(&MenuItemBuilder::with_id("act-connect", "Bağlan…").build(app)?)
        .item(&MenuItemBuilder::with_id(ID_DISCONNECT, "Bağlantıyı Kes").enabled(false).build(app)?)
        .item(&MenuItemBuilder::with_id(ID_RECONNECT, "Yeniden Bağlan").enabled(false).build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id(ID_SYNC, "Eşitle…").enabled(false).build(app)?)
        .item(&CheckMenuItemBuilder::with_id(ID_TRANSFERS, "Aktarımları Duraklat").checked(false).enabled(false).build(app)?)
        .build()?;

    // Görünüm (panel görünürlükleri + zoom/tam ekran)
    let view = SubmenuBuilder::new(app, "Görünüm")
        .item(&CheckMenuItemBuilder::with_id(ID_PANEL_SERVERS, "Sunucular").checked(true).build(app)?)
        .item(&CheckMenuItemBuilder::with_id(ID_PANEL_LOG, "Günlük").checked(true).build(app)?)
        .item(&CheckMenuItemBuilder::with_id(ID_PANEL_QUEUE, "Transferler").checked(true).build(app)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some("Tam Ekran"))?)
        .build()?;

    // Düzen (kopyala/yapıştır vb.)
    let edit = SubmenuBuilder::new(app, "Düzen")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // Yardım
    let help = SubmenuBuilder::new(app, "Yardım")
        .item(&MenuItemBuilder::with_id("act-hotkeys", "Klavye Kısayolları").accelerator("CmdOrCtrl+/").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("about", "Ferro Hakkında").build(app)?)
        .build()?;

    let mut builder = MenuBuilder::new(app);
    if is_mac {
        // macOS uygulama menüsü (ilk sıra).
        let about = MenuItemBuilder::with_id("about", "Ferro Hakkında").build(app)?;
        let app_menu = SubmenuBuilder::new(app, "Ferro")
            .item(&about)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        builder = builder.item(&app_menu);
    }
    let menu = builder.item(&file).item(&server).item(&edit).item(&view).item(&help).build()?;
    Ok(menu)
}

/// Menü olaylarını renderer olaylarına çevirir.
pub fn on_event(app: &AppHandle, id: &str) {
    match id {
        "about" => {
            let _ = app.emit("app:showAbout", ());
        }
        ID_PANEL_SERVERS => emit_panel(app, "servers"),
        ID_PANEL_LOG => emit_panel(app, "log"),
        ID_PANEL_QUEUE => emit_panel(app, "queue"),
        ID_TRANSFERS => emit_action(app, "toggleTransfers"),
        other => {
            if let Some(action) = other.strip_prefix("act-") {
                emit_action(app, action);
            }
        }
    }
}

fn emit_panel(app: &AppHandle, panel: &str) {
    let _ = app.emit("app:togglePanel", json!({ "panel": panel }));
}

fn emit_action(app: &AppHandle, action: &str) {
    let _ = app.emit("app:menuAction", json!({ "action": action }));
}

/// Sunucu menüsü öğe durumlarını eşitler (`app:setConnState`).
pub fn set_conn_state(app: &AppHandle, connected: bool, connecting: bool, any_connected: bool, paused: bool) {
    let Some(menu) = app.menu() else { return };
    if let Some(item) = menu.get(ID_DISCONNECT).and_then(|i| i.as_menuitem().cloned()) {
        let _ = item.set_enabled(connected || connecting);
    }
    if let Some(item) = menu.get(ID_RECONNECT).and_then(|i| i.as_menuitem().cloned()) {
        let _ = item.set_enabled(connected);
    }
    if let Some(item) = menu.get(ID_SYNC).and_then(|i| i.as_menuitem().cloned()) {
        let _ = item.set_enabled(connected);
    }
    if let Some(item) = menu.get(ID_TRANSFERS).and_then(|i| i.as_check_menuitem().cloned()) {
        let _ = item.set_enabled(any_connected);
        let _ = item.set_checked(paused);
    }
}

/// Panel görünürlük onay imlerini eşitler (`app:setPanelState`).
pub fn set_panel_state(app: &AppHandle, servers: bool, log: bool, queue: bool) {
    let Some(menu) = app.menu() else { return };
    for (id, on) in [(ID_PANEL_SERVERS, servers), (ID_PANEL_LOG, log), (ID_PANEL_QUEUE, queue)] {
        if let Some(item) = menu.get(id).and_then(|i| i.as_check_menuitem().cloned()) {
            let _ = item.set_checked(on);
        }
    }
}
