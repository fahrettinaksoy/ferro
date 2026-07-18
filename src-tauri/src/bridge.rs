//! IPC köprüsü: renderer `window.ferro.invoke(channel, payload)` çağrısı buraya düşer.
//!
//! Tek köprü mimarisi: tek bir `bridge_invoke` komutu tüm kanalları
//! dispatch eder ve HER ZAMAN bir zarf (`IpcResult`) döndürür — hata durumunda bile
//! promise reject edilmez; renderer (lib/ipc.ts) zarfı açıp FerroError fırlatır.
//! Böylece `code` alanı renderer bağlamında korunur.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::handlers;
use crate::state::AppState;

/// Handler sonucunu renderer zarfına çevirir: `{ ok: true, data }` / `{ ok: false, error }`.
fn envelope(result: FerroResult<Value>) -> Value {
    match result {
        Ok(data) => json!({ "ok": true, "data": data }),
        Err(err) => json!({ "ok": false, "error": err.serialize() }),
    }
}

/// Bilinmeyen kanal (IPC_HANDLER_MISSING).
fn unknown_channel(channel: &str) -> FerroError {
    FerroError::new(
        FerroErrorCode::IpcHandlerMissing,
        format!("Bilinmeyen IPC kanalı: {channel}"),
    )
}

/// Tek köprü komutu: renderer'daki `window.ferro.invoke` bunu çağırır.
#[tauri::command]
pub async fn bridge_invoke(
    app: AppHandle,
    state: State<'_, AppState>,
    channel: String,
    payload: Value,
) -> Result<Value, ()> {
    let result = dispatch(&app, &state, &channel, payload).await;
    if let Err(e) = &result {
        crate::logger::log("error", &channel, &format!("{:?}: {}", e.code, e.message));
    }
    // Komut daima Ok(zarf) döndürür; iç hata zarfın içindedir.
    Ok(envelope(result))
}

/// Kanal → handler yönlendirmesi. Portlama ilerledikçe her faz kendi kollarını ekler.
async fn dispatch(
    app: &AppHandle,
    state: &AppState,
    channel: &str,
    payload: Value,
) -> FerroResult<Value> {
    match channel {
        // ── app ──
        "app:ping" => {
            Ok(json!({ "pong": true, "version": app.package_info().version.to_string() }))
        }
        "app:info" => Ok(handlers::app_info(app)),
        "dialog:pickDirectory" => handlers::pick_directory(app, payload),
        "settings:apply" => handlers::settings_apply(state, payload),
        "settings:pickEditor" => handlers::pick_editor(app),
        // Menü durum eşitlemeleri.
        "app:setConnState" => handlers::set_conn_state(app, payload),
        "app:setPanelState" => handlers::set_panel_state(app, payload),

        // ── vault ──
        "vault:status" => handlers::vault_status(state),
        "vault:setMaster" => handlers::vault_set_master(state, payload),
        "vault:unlock" => handlers::vault_unlock(state, payload),
        "vault:useOsKeychain" => handlers::vault_use_os_keychain(state, payload),

        // ── sites ──
        "sites:list" => handlers::sites_list(state),
        "sites:save" => handlers::sites_save(state, payload),
        "sites:delete" => handlers::sites_delete(state, payload),
        "sites:renameGroup" => handlers::sites_rename_group(state, payload),
        "sites:export" => handlers::sites_export(app, state, payload),
        "sites:import" => handlers::sites_import(app, state),
        "sites:connect" => handlers::sites_connect(app, state, payload).await,

        // ── bağlantı ──
        "connection:connect" => handlers::connection_connect(app, state, payload).await,
        "connection:disconnect" => handlers::connection_disconnect(state, payload).await,
        "hostkey:decision" => handlers::hostkey_decision(state, payload),
        "tls:decision" => handlers::tls_decision(state, payload),

        // ── uzak dosya sistemi ──
        "fs:list" => handlers::fs_list(state, payload).await,
        "fs:pwd" => handlers::fs_pwd(state, payload).await,
        "fs:cwd" => handlers::fs_cwd(state, payload).await,
        "fs:mkdir" => handlers::fs_mkdir(state, payload).await,
        "fs:delete" => handlers::fs_delete(state, payload).await,
        "fs:rmdir" => handlers::fs_rmdir(state, payload).await,
        "fs:rename" => handlers::fs_rename(state, payload).await,
        "fs:chmod" => handlers::fs_chmod(state, payload).await,

        // ── transfer kuyruğu ──
        "transfer:enqueue" => handlers::transfer_enqueue(app, state, payload),
        "transfer:cancel" => handlers::transfer_cancel(state, payload),
        "transfer:setPaused" => handlers::transfer_set_paused(state, payload),
        "sync:compare" => handlers::sync_compare(state, payload).await,

        // ── yerinde düzenleme ──
        "edit:open" => handlers::edit_open(app, state, payload).await,

        // ── senkronizasyon ──
        "sync:getConfig" => handlers::sync_get_config(state),
        "sync:setConfig" => handlers::sync_set_config(state, payload),
        "sync:push" => handlers::sync_push(state, payload).await,
        "sync:pull" => handlers::sync_pull(state).await,
        "sync:peek" => handlers::sync_peek(state).await,

        // ── ekip paylaşımı ──
        "team:list" => crate::team::engine::list(state),
        "team:create" => crate::team::engine::create(state, payload).await,
        "team:join" => crate::team::engine::join(state, payload).await,
        "team:leave" => crate::team::engine::leave(state, payload),
        "team:pull" => crate::team::engine::pull(state, payload).await,
        "team:push" => crate::team::engine::push(state, payload).await,
        "team:invite" => crate::team::engine::invite(state, payload),
        "team:members" => crate::team::engine::members(state, payload),
        "team:setRole" => crate::team::engine::set_role(state, payload).await,
        "team:removeMember" => crate::team::engine::remove_member(state, payload).await,
        "team:importSites" => crate::team::engine::import_sites(state, payload),

        // ── local fs ──
        "local:home" => handlers::local_home(),
        "local:list" => handlers::local_list(payload),
        "local:mkdir" => handlers::local_mkdir(payload),
        "local:delete" => handlers::local_delete(payload),
        "local:rename" => handlers::local_rename(payload),

        other => Err(unknown_channel(other)),
    }
}

/// Main → renderer tek yönlü olay yayını (EventMap kanalları).
/// Tauri'nin adlandırılmış olay sistemiyle yayınlanır.
pub fn emit_event<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    if let Err(e) = app.emit(event, payload) {
        eprintln!("[ferro] olay yayınlanamadı ({event}): {e}");
    }
}
