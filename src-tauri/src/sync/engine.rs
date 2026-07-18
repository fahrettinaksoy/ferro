//! Sync motoru — `sync/engine.ts` karşılığı. push/pull/peek akışları.

use serde_json::{json, Value};

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::state::AppState;

use super::config::ProviderCreds;
use super::crypto::{
    decrypt_sync_payload, encrypt_sync_payload, SettingsSnapshot, SyncBlobFile, SyncPayload,
};
use super::providers::Provider;

const SYNC_FILE_NAME: &str = "ferro-sync.json";

/// Yapılandırmadan sağlayıcı kurar.
fn build_provider(state: &AppState) -> FerroResult<Provider> {
    let creds = state.sync.credentials(&state.vault).ok_or_else(|| {
        FerroError::new(
            FerroErrorCode::Validation,
            "Senkronizasyon yapılandırılmamış",
        )
    })?;
    Ok(match creds {
        ProviderCreds::Gist { token, gist_id } => {
            if token.is_empty() {
                return Err(FerroError::new(
                    FerroErrorCode::Validation,
                    "Gist jetonu ayarlanmamış",
                ));
            }
            Provider::Gist {
                token,
                gist_id,
                file_name: SYNC_FILE_NAME.into(),
            }
        }
        ProviderCreds::Webdav {
            url,
            user,
            password,
        } => {
            if url.is_empty() {
                return Err(FerroError::new(
                    FerroErrorCode::Validation,
                    "WebDAV adresi ayarlanmamış",
                ));
            }
            Provider::Webdav {
                url,
                user,
                password,
                file_name: SYNC_FILE_NAME.into(),
            }
        }
    })
}

fn require_password(state: &AppState) -> FerroResult<String> {
    state.sync.sync_password(&state.vault).ok_or_else(|| {
        FerroError::new(
            FerroErrorCode::Validation,
            "Senkronizasyon parolası ayarlanmamış",
        )
    })
}

/// Yalnızca `ferro.*` anahtarlarını, string değerleri (≤200000), en çok 100 öğe.
fn sanitize_settings(raw: Value) -> SettingsSnapshot {
    let mut out = SettingsSnapshot::new();
    if let Some(obj) = raw.as_object() {
        for (k, v) in obj {
            if out.len() >= 100 {
                break;
            }
            if !k.starts_with("ferro.") || k.len() > 64 {
                continue;
            }
            if let Some(s) = v.as_str() {
                if s.len() <= 200_000 {
                    out.insert(k.clone(), s.to_string());
                }
            }
        }
    }
    out
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub async fn push(state: &AppState, settings: Option<Value>) -> FerroResult<Value> {
    let password = require_password(state)?;
    let provider = build_provider(state)?;
    let updated_at = now_iso();

    let sites = if state.sync.include_sites() {
        Some(state.sites.export_sites(&state.vault, true))
    } else {
        None
    };
    let settings_snap = if state.sync.include_settings() {
        settings.map(sanitize_settings).filter(|s| !s.is_empty())
    } else {
        None
    };
    if sites.is_none() && settings_snap.is_none() {
        return Err(FerroError::new(
            FerroErrorCode::Validation,
            "Eşitlenecek veri seçilmedi",
        ));
    }
    let site_count = sites.as_ref().map(|s| s.len()).unwrap_or(0);
    let has_settings = settings_snap.is_some();

    let payload = SyncPayload {
        kind: "ferro-sync-payload".into(),
        version: 1,
        updated_at: updated_at.clone(),
        sites,
        settings: settings_snap,
    };
    let blob = encrypt_sync_payload(&payload, &password)?;
    let text = serde_json::to_string_pretty(&blob)?;
    let bytes = text.len();

    if let Some(new_id) = provider.upload(&text).await? {
        state.sync.set_gist_id(&new_id);
    }
    state
        .sync
        .mark_synced("push", Some(updated_at.clone()), now_iso());

    Ok(json!({
        "updatedAt": updated_at,
        "bytes": bytes,
        "sites": site_count,
        "settings": has_settings,
    }))
}

pub async fn pull(state: &AppState) -> FerroResult<Value> {
    let password = require_password(state)?;
    let provider = build_provider(state)?;
    let Some(text) = provider.download().await? else {
        return Ok(json!({ "found": false }));
    };
    let blob: SyncBlobFile = serde_json::from_str(&text).map_err(|e| {
        FerroError::with_detail(
            FerroErrorCode::Validation,
            "Sync dosyası çözümlenemedi",
            e.to_string(),
        )
    })?;
    let payload = decrypt_sync_payload(&blob, &password)?;

    let mut result = json!({ "found": true, "updatedAt": payload.updated_at });
    if state.sync.include_sites() {
        if let Some(sites) = payload.sites {
            let total = sites.len();
            let (imported, skipped) = state.sites.import_sites(&state.vault, sites);
            result["sites"] = json!({ "imported": imported, "skipped": skipped, "total": total });
        }
    }
    if state.sync.include_settings() {
        if let Some(settings) = payload.settings {
            result["settings"] = serde_json::to_value(settings)?;
        }
    }
    state
        .sync
        .mark_synced("pull", Some(payload.updated_at), now_iso());
    Ok(result)
}

pub async fn peek(state: &AppState) -> FerroResult<Value> {
    let password = require_password(state)?;
    let provider = build_provider(state)?;
    let Some(text) = provider.download().await? else {
        return Ok(json!({ "found": false, "updatedAt": null }));
    };
    let blob: SyncBlobFile = serde_json::from_str(&text).map_err(|e| {
        FerroError::with_detail(
            FerroErrorCode::Validation,
            "Sync dosyası çözümlenemedi",
            e.to_string(),
        )
    })?;
    let payload = decrypt_sync_payload(&blob, &password)?;
    Ok(json!({ "found": true, "updatedAt": payload.updated_at }))
}
