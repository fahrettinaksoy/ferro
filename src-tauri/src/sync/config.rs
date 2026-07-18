//! Sync yapılandırma deposu — `store/syncConfig.ts` karşılığı. `sync.json` (v1).
//! Sırlar (Gist token, WebDAV parola, sync parolası) vault ile şifreli saklanır;
//! renderer'a yalnızca var/yok (`has*`) döner.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::store::json_store::{read_versioned, write_versioned, ReadOutcome};
use crate::vault::Vault;

const STORE_VERSION: u32 = 1;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct GistCfg {
    #[serde(rename = "gistId", default)]
    gist_id: String,
    #[serde(
        rename = "tokenSecret",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    token_secret: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct WebdavCfg {
    #[serde(default)]
    url: String,
    #[serde(default)]
    user: String,
    #[serde(
        rename = "passwordSecret",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    password_secret: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Include {
    sites: bool,
    settings: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredSyncConfig {
    provider: String, // gist | webdav
    include: Include,
    #[serde(default)]
    gist: GistCfg,
    #[serde(default)]
    webdav: WebdavCfg,
    #[serde(
        rename = "syncPasswordSecret",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    sync_password_secret: Option<String>,
    #[serde(default)]
    #[serde(rename = "autoSync")]
    auto_sync: bool,
    #[serde(default)]
    #[serde(rename = "autoPush")]
    auto_push: bool,
    #[serde(
        rename = "lastSyncAt",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    last_sync_at: Option<String>,
    #[serde(
        rename = "lastDirection",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    last_direction: Option<String>,
    #[serde(
        rename = "lastRemoteUpdatedAt",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    last_remote_updated_at: Option<String>,
}

impl Default for StoredSyncConfig {
    fn default() -> Self {
        Self {
            provider: "gist".into(),
            include: Include {
                sites: true,
                settings: true,
            },
            gist: GistCfg::default(),
            webdav: WebdavCfg::default(),
            sync_password_secret: None,
            auto_sync: false,
            auto_push: false,
            last_sync_at: None,
            last_direction: None,
            last_remote_updated_at: None,
        }
    }
}

pub struct SyncConfigStore {
    file: PathBuf,
    cache: Mutex<StoredSyncConfig>,
}

/// Çözülmüş sağlayıcı erişim bilgisi (engine kullanır).
pub enum ProviderCreds {
    Gist {
        token: String,
        gist_id: String,
    },
    Webdav {
        url: String,
        user: String,
        password: String,
    },
}

impl SyncConfigStore {
    pub fn new(config_dir: &Path) -> Self {
        let file = config_dir.join("sync.json");
        let cache = match read_versioned::<StoredSyncConfig, _>(&file, STORE_VERSION, |_| None) {
            ReadOutcome::Loaded(c) => c,
            _ => StoredSyncConfig::default(),
        };
        Self {
            file,
            cache: Mutex::new(cache),
        }
    }

    fn save(&self, cfg: &StoredSyncConfig) {
        if let Err(e) = write_versioned(&self.file, STORE_VERSION, cfg) {
            eprintln!("[ferro] sync.json yazılamadı: {e}");
        }
    }

    /// Renderer görünümü (sırlar → has*).
    pub fn to_public(&self) -> Value {
        let c = self.cache.lock().unwrap();
        json!({
            "provider": c.provider,
            "include": { "sites": c.include.sites, "settings": c.include.settings },
            "gist": { "gistId": c.gist.gist_id, "hasToken": c.gist.token_secret.is_some() },
            "webdav": { "url": c.webdav.url, "user": c.webdav.user, "hasPassword": c.webdav.password_secret.is_some() },
            "hasSyncPassword": c.sync_password_secret.is_some(),
            "autoSync": c.auto_sync,
            "autoPush": c.auto_push,
            "lastSyncAt": c.last_sync_at,
            "lastDirection": c.last_direction,
            "lastRemoteUpdatedAt": c.last_remote_updated_at,
        })
    }

    /// Yapılandırmayı günceller. Sır alanları: None/boş = korunur, doluysa yeniden şifrelenir.
    pub fn update(&self, vault: &Vault, input: Value) {
        let mut c = self.cache.lock().unwrap();
        let enc = |v: &Vault, s: Option<&str>, existing: &Option<String>| -> Option<String> {
            match s {
                Some(x) if !x.is_empty() => v.encrypt_secret(x),
                _ => existing.clone(),
            }
        };
        if let Some(p) = input.get("provider").and_then(Value::as_str) {
            c.provider = p.to_string();
        }
        if let Some(inc) = input.get("include") {
            if let Some(b) = inc.get("sites").and_then(Value::as_bool) {
                c.include.sites = b;
            }
            if let Some(b) = inc.get("settings").and_then(Value::as_bool) {
                c.include.settings = b;
            }
        }
        if let Some(g) = input.get("gist") {
            if let Some(id) = g.get("gistId").and_then(Value::as_str) {
                c.gist.gist_id = id.to_string();
            }
            c.gist.token_secret = enc(
                vault,
                g.get("token").and_then(Value::as_str),
                &c.gist.token_secret,
            );
        }
        if let Some(w) = input.get("webdav") {
            if let Some(u) = w.get("url").and_then(Value::as_str) {
                c.webdav.url = u.to_string();
            }
            if let Some(u) = w.get("user").and_then(Value::as_str) {
                c.webdav.user = u.to_string();
            }
            c.webdav.password_secret = enc(
                vault,
                w.get("password").and_then(Value::as_str),
                &c.webdav.password_secret,
            );
        }
        c.sync_password_secret = enc(
            vault,
            input.get("syncPassword").and_then(Value::as_str),
            &c.sync_password_secret,
        );
        if let Some(b) = input.get("autoSync").and_then(Value::as_bool) {
            c.auto_sync = b;
        }
        if let Some(b) = input.get("autoPush").and_then(Value::as_bool) {
            c.auto_push = b;
        }
        self.save(&c);
    }

    pub fn provider_kind(&self) -> String {
        self.cache.lock().unwrap().provider.clone()
    }

    pub fn include_sites(&self) -> bool {
        self.cache.lock().unwrap().include.sites
    }
    pub fn include_settings(&self) -> bool {
        self.cache.lock().unwrap().include.settings
    }

    pub fn sync_password(&self, vault: &Vault) -> Option<String> {
        let c = self.cache.lock().unwrap();
        c.sync_password_secret
            .as_ref()
            .map(|s| vault.decrypt_secret(s))
            .filter(|p| !p.is_empty())
    }

    /// Çözülmüş sağlayıcı erişim bilgisi.
    pub fn credentials(&self, vault: &Vault) -> Option<ProviderCreds> {
        let c = self.cache.lock().unwrap();
        match c.provider.as_str() {
            "webdav" => {
                let password = c
                    .webdav
                    .password_secret
                    .as_ref()
                    .map(|s| vault.decrypt_secret(s))
                    .unwrap_or_default();
                Some(ProviderCreds::Webdav {
                    url: c.webdav.url.clone(),
                    user: c.webdav.user.clone(),
                    password,
                })
            }
            _ => {
                let token = c
                    .gist
                    .token_secret
                    .as_ref()
                    .map(|s| vault.decrypt_secret(s))
                    .unwrap_or_default();
                Some(ProviderCreds::Gist {
                    token,
                    gist_id: c.gist.gist_id.clone(),
                })
            }
        }
    }

    pub fn set_gist_id(&self, id: &str) {
        let mut c = self.cache.lock().unwrap();
        if c.gist.gist_id != id {
            c.gist.gist_id = id.to_string();
            self.save(&c);
        }
    }

    pub fn mark_synced(&self, direction: &str, remote_updated_at: Option<String>, now: String) {
        let mut c = self.cache.lock().unwrap();
        c.last_sync_at = Some(now);
        c.last_direction = Some(direction.to_string());
        if let Some(r) = remote_updated_at {
            c.last_remote_updated_at = Some(r);
        }
        self.save(&c);
    }
}
