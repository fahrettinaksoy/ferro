//! Boot-kritik IPC handler'ları (app, vault, sites, local, settings, dialog).
//! Bağlantı/transfer (Phase 3), sync/team (Phase 4) ayrı modüllerde eklenecek.

use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::error::{validation, FerroError, FerroErrorCode, FerroResult};
use crate::localfs;
use crate::state::AppState;
use crate::types::{ConnectionConfig, RuntimeSettings, SiteExportEntry, SiteInput};

/// Bloklayan bir kapanışı ayrı bir blocking-thread'de çalıştırır (tokio runtime'ını
/// bloklamamak + SFTP'nin kendi runtime `block_on`'unun panik vermemesi için).
async fn blocking<T, F>(f: F) -> FerroResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> FerroResult<T> + Send + 'static,
{
    match tokio::task::spawn_blocking(f).await {
        Ok(r) => r,
        Err(e) => Err(FerroError::with_detail(FerroErrorCode::Unknown, "İç görev hatası", e.to_string())),
    }
}

/// Yükü hedef tipe çözer; hata VALIDATION'a düşer.
fn parse<T: DeserializeOwned>(payload: Value) -> FerroResult<T> {
    Ok(serde_json::from_value(payload)?)
}

// ── app ────────────────────────────────────────────────────────────────────

pub fn app_info(app: &AppHandle) -> Value {
    let webview = tauri::webview_version().unwrap_or_default();
    json!({
        "name": "Ferro",
        "version": app.package_info().version.to_string(),
        "tauri": tauri::VERSION,
        "webview": webview,
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    })
}

/// Dizin seçici (dialog:pickDirectory).
pub fn pick_directory(app: &AppHandle, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "defaultPath")]
        default_path: Option<String>,
    }
    let req: Req = parse(payload).unwrap_or(Req { default_path: None });
    let mut builder = app.dialog().file();
    if let Some(dir) = req.default_path.filter(|d| !d.is_empty()) {
        builder = builder.set_directory(dir);
    }
    let picked = builder.blocking_pick_folder();
    let path = picked.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().to_string());
    Ok(json!({ "path": path }))
}

pub fn pick_editor(app: &AppHandle) -> FerroResult<Value> {
    let picked = app.dialog().file().blocking_pick_file();
    let path = picked.and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().to_string());
    Ok(json!({ "path": path }))
}

/// settings:apply — ayarları uygular. Yan etkiler (bant genişliği, log, updater)
/// ilgili fazlarda modüllere bağlanır.
pub fn settings_apply(state: &AppState, payload: Value) -> FerroResult<Value> {
    let settings: RuntimeSettings = parse(payload)?;
    // Yan etki: dosya loglamayı yapılandır.
    crate::logger::configure(settings.logging.to_file, settings.logging.max_size_mib);
    state.settings.set(settings);
    Ok(json!({ "ok": true }))
}

// ── vault ────────────────────────────────────────────────────────────────────

/// app:setConnState — Sunucu menüsü öğe etkinliklerini eşitler.
pub fn set_conn_state(app: &AppHandle, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Req {
        connecting: bool,
        connected: bool,
        any_connected: bool,
        paused: bool,
    }
    let req: Req = parse(payload)?;
    crate::menu::set_conn_state(app, req.connected, req.connecting, req.any_connected, req.paused);
    Ok(json!({ "ok": true }))
}

/// app:setPanelState — Görünüm menüsü onay imlerini eşitler.
pub fn set_panel_state(app: &AppHandle, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        servers: bool,
        log: bool,
        queue: bool,
    }
    let req: Req = parse(payload)?;
    crate::menu::set_panel_state(app, req.servers, req.log, req.queue);
    Ok(json!({ "ok": true }))
}

pub fn vault_status(state: &AppState) -> FerroResult<Value> {
    Ok(json!({
        "mode": state.vault.mode(),
        "locked": state.vault.is_locked(),
        "hasMaster": state.vault.has_master(),
    }))
}

pub fn vault_set_master(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        current: Option<String>,
        next: String,
    }
    let req: Req = parse(payload)?;
    // hasMaster ise önce current ile aç (transition için sırları çözebilmek adına).
    if state.vault.has_master() {
        let ok = req.current.as_deref().map(|c| state.vault.unlock(c)).unwrap_or(false);
        if !ok {
            return Err(FerroError::new(FerroErrorCode::AuthFailed, "Mevcut master parola hatalı"));
        }
    }
    // Mevcut sırları düz metne çöz → yeni anahtar → yeniden şifrele.
    let plains = state.sites.export_secrets(&state.vault);
    state.vault.set_master(req.current.as_deref(), &req.next)?;
    state.sites.import_secrets(&state.vault, plains);
    Ok(json!({ "ok": true }))
}

pub fn vault_unlock(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        password: String,
    }
    let req: Req = parse(payload)?;
    Ok(json!({ "ok": state.vault.unlock(&req.password) }))
}

pub fn vault_use_os_keychain(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        current: String,
    }
    let req: Req = parse(payload)?;
    if !state.vault.os_encryption_available() {
        return Err(FerroError::new(FerroErrorCode::Validation, "OS anahtar zinciri kullanılamıyor"));
    }
    if !state.vault.unlock(&req.current) {
        return Err(FerroError::new(FerroErrorCode::AuthFailed, "Master parola hatalı"));
    }
    let plains = state.sites.export_secrets(&state.vault);
    state.vault.disable_master(&req.current)?;
    state.sites.import_secrets(&state.vault, plains);
    Ok(json!({ "ok": true }))
}

// ── sites ────────────────────────────────────────────────────────────────────

pub fn sites_list(state: &AppState) -> FerroResult<Value> {
    Ok(json!({
        "sites": state.sites.list(&state.vault),
        "encryptionAvailable": state.vault.encryption_available(),
    }))
}

pub fn sites_save(state: &AppState, payload: Value) -> FerroResult<Value> {
    let input: SiteInput = parse(payload)?;
    let id = state.sites.upsert(&state.vault, input);
    Ok(json!({ "id": id }))
}

pub fn sites_delete(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        id: String,
    }
    let req: Req = parse(payload)?;
    state.sites.remove(&state.vault, &req.id);
    Ok(json!({ "ok": true }))
}

pub fn sites_rename_group(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        from: String,
        to: String,
    }
    let req: Req = parse(payload)?;
    let count = state.sites.rename_group(&state.vault, &req.from, &req.to);
    Ok(json!({ "ok": true, "count": count }))
}

/// Siteleri JSON'a dışa aktarır (kaydetme diyaloğu).
pub fn sites_export(app: &AppHandle, state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "includePasswords")]
        include_passwords: bool,
    }
    let req: Req = parse(payload)?;
    let sites = state.sites.export_sites(&state.vault, req.include_passwords);
    let count = sites.len();
    let picked = app
        .dialog()
        .file()
        .set_file_name("ferro-sites.json")
        .add_filter("JSON", &["json"])
        .blocking_save_file();
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(json!({ "path": null, "count": 0 }));
    };
    let envelope = json!({
        "app": "ferro",
        "kind": "sites",
        "version": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "sites": sites,
    });
    let mut text = serde_json::to_string_pretty(&envelope)
        .map_err(|e| FerroError::with_detail(FerroErrorCode::Unknown, "JSON üretilemedi", e.to_string()))?;
    text.push('\n');
    std::fs::write(&path, text)?;
    Ok(json!({ "path": path.to_string_lossy(), "count": count }))
}

/// JSON'dan site içe aktarır (açma diyaloğu). Yinelenenler atlanır.
pub fn sites_import(app: &AppHandle, state: &AppState) -> FerroResult<Value> {
    let picked = app.dialog().file().add_filter("JSON", &["json"]).blocking_pick_file();
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(json!({ "path": null, "imported": 0, "skipped": 0, "total": 0 }));
    };
    let meta = std::fs::metadata(&path)?;
    if meta.len() > 10 * 1024 * 1024 {
        return Err(validation("Dosya çok büyük (>10 MiB)"));
    }
    let raw = std::fs::read_to_string(&path)?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|_| validation("Geçersiz JSON"))?;
    // { kind:'sites', version:1, sites:[...] } veya çıplak dizi.
    let arr = if let Some(a) = parsed.as_array() {
        a.clone()
    } else if let Some(a) = parsed.get("sites").and_then(Value::as_array) {
        a.clone()
    } else {
        return Err(validation("Tanınmayan site dosyası biçimi"));
    };
    if arr.len() > 5000 {
        return Err(validation("Çok fazla kayıt (>5000)"));
    }
    let entries: Vec<SiteExportEntry> = serde_json::from_value(Value::Array(arr))
        .map_err(|e| FerroError::with_detail(FerroErrorCode::Validation, "Geçersiz site kaydı", e.to_string()))?;
    let total = entries.len();
    let (imported, skipped) = state.sites.import_sites(&state.vault, entries);
    Ok(json!({
        "path": path.to_string_lossy(),
        "imported": imported,
        "skipped": skipped,
        "total": total,
    }))
}

// ── local fs ─────────────────────────────────────────────────────────────────

pub fn local_home() -> FerroResult<Value> {
    Ok(json!({ "path": localfs::home() }))
}

pub fn local_list(payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        path: String,
    }
    let req: Req = parse(payload)?;
    let (path, entries) = localfs::list(&req.path)?;
    Ok(json!({ "path": path, "entries": entries }))
}

pub fn local_mkdir(payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        path: String,
    }
    let req: Req = parse(payload)?;
    localfs::mkdir(&req.path)?;
    Ok(json!({ "ok": true }))
}

pub fn local_delete(payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        path: String,
    }
    let req: Req = parse(payload)?;
    localfs::delete(&req.path)?;
    Ok(json!({ "ok": true }))
}

pub fn local_rename(payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        from: String,
        to: String,
    }
    let req: Req = parse(payload)?;
    localfs::rename(&req.from, &req.to)?;
    Ok(json!({ "ok": true }))
}

// ── bağlantı ─────────────────────────────────────────────────────────────────

pub async fn connection_connect(app: &AppHandle, state: &AppState, payload: Value) -> FerroResult<Value> {
    let config: ConnectionConfig = parse(payload)?;
    let opts = adapter_options(state);
    let sessions = state.sessions.clone();
    let app = app.clone();
    let (session_id, cwd) = blocking(move || sessions.connect(&app, config, opts)).await?;
    Ok(json!({ "sessionId": session_id, "cwd": cwd }))
}

pub async fn connection_disconnect(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "sessionId")]
        session_id: String,
    }
    let req: Req = parse(payload)?;
    state.sessions.disconnect(&req.session_id)?;
    Ok(json!({ "closed": true }))
}

/// Kaydedilmiş siteye bağlanır (parola çözülür / "parola sorulsun"da iletilen kullanılır).
pub async fn sites_connect(app: &AppHandle, state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        id: String,
        password: Option<String>,
    }
    let req: Req = parse(payload)?;
    let config = state
        .sites
        .build_config(&state.vault, &req.id, req.password)
        .ok_or_else(|| validation("Site bulunamadı"))?;
    let opts = adapter_options(state);
    let sessions = state.sessions.clone();
    let app = app.clone();
    let (session_id, cwd) = blocking(move || sessions.connect(&app, config, opts)).await?;
    Ok(json!({ "sessionId": session_id, "cwd": cwd }))
}

pub fn hostkey_decision(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "requestId")]
        request_id: String,
        accept: bool,
    }
    let req: Req = parse(payload)?;
    state.tofu.resolve(&req.request_id, req.accept);
    Ok(json!({ "ok": true }))
}

pub fn tls_decision(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "requestId")]
        request_id: String,
        accept: bool,
    }
    let req: Req = parse(payload)?;
    state.tofu.resolve(&req.request_id, req.accept);
    Ok(json!({ "ok": true }))
}

// ── uzak dosya sistemi ───────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct SessionPath {
    #[serde(rename = "sessionId")]
    session_id: String,
    path: Option<String>,
}

pub async fn fs_list(state: &AppState, payload: Value) -> FerroResult<Value> {
    let req: SessionPath = parse(payload)?;
    let session = state.sessions.require(&req.session_id)?;
    let entries = blocking(move || session.list(req.path.as_deref())).await?;
    Ok(serde_json::to_value(entries)?)
}

pub async fn fs_pwd(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "sessionId")]
        session_id: String,
    }
    let req: Req = parse(payload)?;
    let session = state.sessions.require(&req.session_id)?;
    let cwd = blocking(move || session.pwd()).await?;
    Ok(json!({ "cwd": cwd }))
}

pub async fn fs_cwd(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "sessionId")]
        session_id: String,
        path: String,
    }
    let req: Req = parse(payload)?;
    let session = state.sessions.require(&req.session_id)?;
    let cwd = blocking(move || {
        session.cwd(&req.path)?;
        session.pwd()
    })
    .await?;
    Ok(json!({ "cwd": cwd }))
}

/// sessionId + tek yol alan fs işlemleri (mkdir/delete/rmdir) için ortak.
async fn fs_single<F>(state: &AppState, payload: Value, op: F) -> FerroResult<Value>
where
    F: FnOnce(&crate::transfer::session::Session, &str) -> FerroResult<()> + Send + 'static,
{
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "sessionId")]
        session_id: String,
        path: String,
    }
    let req: Req = parse(payload)?;
    let session = state.sessions.require(&req.session_id)?;
    blocking(move || op(&session, &req.path)).await?;
    Ok(json!({ "ok": true }))
}

pub async fn fs_mkdir(state: &AppState, payload: Value) -> FerroResult<Value> {
    fs_single(state, payload, |s, p| s.mkdir(p)).await
}
pub async fn fs_delete(state: &AppState, payload: Value) -> FerroResult<Value> {
    fs_single(state, payload, |s, p| s.delete(p)).await
}
pub async fn fs_rmdir(state: &AppState, payload: Value) -> FerroResult<Value> {
    fs_single(state, payload, |s, p| s.rmdir(p)).await
}

pub async fn fs_rename(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "sessionId")]
        session_id: String,
        from: String,
        to: String,
    }
    let req: Req = parse(payload)?;
    let session = state.sessions.require(&req.session_id)?;
    blocking(move || session.rename(&req.from, &req.to)).await?;
    Ok(json!({ "ok": true }))
}

pub async fn fs_chmod(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "sessionId")]
        session_id: String,
        path: String,
        mode: u32,
    }
    let req: Req = parse(payload)?;
    let session = state.sessions.require(&req.session_id)?;
    blocking(move || session.chmod(&req.path, req.mode)).await?;
    Ok(json!({ "ok": true }))
}

// ── transfer kuyruğu ─────────────────────────────────────────────────────────

fn transfer_params(state: &AppState) -> crate::transfer::queue::TransferParams {
    let s = state.settings.get();
    crate::transfer::queue::TransferParams {
        retry_max_attempts: s.retry_max_attempts,
        retry_delay_ms: s.retry_delay_ms,
        file_exists: s.file_exists_download,
        bandwidth_bps: s.bandwidth_bytes_per_sec,
    }
}

/// Ayarlardan adaptör opsiyonları (timeout, keep-alive, proxy, aktarım türü).
fn adapter_options(state: &AppState) -> crate::transfer::client::AdapterOptions {
    let s = state.settings.get();
    crate::transfer::client::AdapterOptions {
        connect_timeout_ms: s.connect_timeout_ms,
        keep_alive: s.keep_alive,
        proxy: state.settings.active_proxy(),
        transfer_type: s.transfer_type,
    }
}

pub fn transfer_enqueue(app: &AppHandle, state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Req {
        session_id: String,
        direction: crate::types::TransferDirection,
        remote_path: String,
        local_path: String,
        name: String,
        #[serde(default)]
        is_directory: bool,
    }
    let req: Req = parse(payload)?;
    // Oturum var mı kontrolü (yoksa NOT_CONNECTED).
    state.sessions.require(&req.session_id)?;
    let mut params = transfer_params(state);
    // Yön yüklemeyse yükleme politikasını kullan.
    if matches!(req.direction, crate::types::TransferDirection::Upload) {
        params.file_exists = state.settings.get().file_exists_upload;
    }
    if req.is_directory {
        state.transfers.enqueue_directory(
            app.clone(),
            req.session_id,
            req.direction,
            req.remote_path,
            req.local_path,
            params,
        );
        Ok(json!({ "jobId": "" }))
    } else {
        let job_id = state.transfers.enqueue_file(
            app.clone(),
            req.session_id,
            req.direction,
            req.remote_path,
            req.local_path,
            req.name,
            params,
        );
        Ok(json!({ "jobId": job_id }))
    }
}

pub fn transfer_cancel(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        #[serde(rename = "jobId")]
        job_id: String,
    }
    let req: Req = parse(payload)?;
    state.transfers.cancel(&req.job_id);
    Ok(json!({ "ok": true }))
}

pub fn transfer_set_paused(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    struct Req {
        paused: bool,
    }
    let req: Req = parse(payload)?;
    state.transfers.set_paused(req.paused);
    Ok(json!({ "paused": req.paused }))
}

// ── yerinde düzenleme ────────────────────────────────────────────────────────

pub async fn edit_open(app: &AppHandle, state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Req {
        session_id: String,
        remote_path: String,
        name: String,
    }
    let req: Req = parse(payload)?;
    state.sessions.require(&req.session_id)?;
    let editor = state.settings.editor();
    let params = transfer_params(state);
    let edits = state.edits.clone();
    let sessions = state.sessions.clone();
    let transfers = state.transfers.clone();
    let app = app.clone();
    blocking(move || {
        edits.open(&app, &sessions, &transfers, &req.session_id, &req.remote_path, &req.name, editor, params)
    })
    .await?;
    Ok(json!({ "ok": true }))
}

// ── senkronizasyon (Gist / WebDAV) ──────────────────────────────────────────

pub fn sync_get_config(state: &AppState) -> FerroResult<Value> {
    Ok(json!({ "config": state.sync.to_public() }))
}

pub fn sync_set_config(state: &AppState, payload: Value) -> FerroResult<Value> {
    state.sync.update(&state.vault, payload);
    Ok(json!({ "config": state.sync.to_public() }))
}

pub async fn sync_push(state: &AppState, payload: Value) -> FerroResult<Value> {
    let settings = payload.get("settings").cloned();
    crate::sync::engine::push(state, settings).await
}

pub async fn sync_pull(state: &AppState) -> FerroResult<Value> {
    crate::sync::engine::pull(state).await
}

pub async fn sync_peek(state: &AppState) -> FerroResult<Value> {
    crate::sync::engine::peek(state).await
}

/// Tek seviye dizin karşılaştırması (senkronizasyon önizleme).
pub async fn sync_compare(state: &AppState, payload: Value) -> FerroResult<Value> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Req {
        session_id: String,
        local_path: String,
        remote_path: String,
    }
    let req: Req = parse(payload)?;
    let session = state.sessions.require(&req.session_id)?;
    let entries = blocking(move || {
        let remote = session.list(Some(&req.remote_path))?;
        Ok(crate::transfer::compare::compare_dirs(&req.local_path, &remote))
    })
    .await?;
    Ok(json!({ "entries": entries }))
}
