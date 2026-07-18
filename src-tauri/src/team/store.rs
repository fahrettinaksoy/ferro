//! Ekip deposu — `store/teams.ts` karşılığı. `teams.json` (v1). Sırlar (depo jetonu/
//! parola, ekip anahtarı) vault ile şifreli. members/sites yerel önbellektir.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::store::json_store::{read_versioned, write_versioned, ReadOutcome};
use crate::types::SiteExportEntry;
use crate::vault::Vault;

use super::crypto::TeamMember;

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
pub struct StoredTeam {
    #[serde(rename = "teamId")]
    pub team_id: String,
    pub name: String,
    pub role: String,
    #[serde(rename = "memberId")]
    pub member_id: String,
    #[serde(rename = "memberName")]
    pub member_name: String,
    pub provider: String,
    #[serde(default)]
    gist: GistCfg,
    #[serde(default)]
    webdav: WebdavCfg,
    #[serde(
        rename = "teamKeySecret",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    team_key_secret: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    members: Option<Vec<TeamMember>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sites: Option<Vec<SiteExportEntry>>,
    #[serde(
        rename = "lastSyncAt",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    last_sync_at: Option<String>,
    #[serde(
        rename = "lastRevision",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    last_revision: Option<u64>,
}

/// Ekip eklerken düz metin erişim bilgisi (store şifreler).
pub struct TeamInsert {
    pub team_id: String,
    pub name: String,
    pub role: String,
    pub member_id: String,
    pub member_name: String,
    pub provider: String,
    pub gist_id: String,
    pub token: String,
    pub url: String,
    pub user: String,
    pub password: String,
    pub team_key: String,
}

/// Çözülmüş depo erişim bilgisi.
pub enum TeamCreds {
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

pub struct TeamStore {
    file: PathBuf,
    cache: Mutex<Vec<StoredTeam>>,
}

impl TeamStore {
    pub fn new(config_dir: &Path) -> Self {
        let file = config_dir.join("teams.json");
        let cache = match read_versioned::<Vec<StoredTeam>, _>(&file, STORE_VERSION, |p| {
            p.as_array()
                .and_then(|_| serde_json::from_value(p.clone()).ok())
        }) {
            ReadOutcome::Loaded(v) => v,
            _ => Vec::new(),
        };
        Self {
            file,
            cache: Mutex::new(cache),
        }
    }

    fn save(&self, cache: &[StoredTeam]) {
        if let Err(e) = write_versioned(&self.file, STORE_VERSION, &cache.to_vec()) {
            eprintln!("[ferro] teams.json yazılamadı: {e}");
        }
    }

    fn to_public(t: &StoredTeam) -> Value {
        let has_creds = t.gist.token_secret.is_some() || t.webdav.password_secret.is_some();
        json!({
            "teamId": t.team_id,
            "name": t.name,
            "role": t.role,
            "memberName": t.member_name,
            "provider": t.provider,
            "hasCredentials": has_creds,
            "memberCount": t.members.as_ref().map(|m| m.len()).unwrap_or(0),
            "siteCount": t.sites.as_ref().map(|s| s.len()).unwrap_or(0),
            "lastSyncAt": t.last_sync_at,
            "lastRevision": t.last_revision,
        })
    }

    pub fn list_public(&self) -> Vec<Value> {
        self.cache
            .lock()
            .unwrap()
            .iter()
            .map(Self::to_public)
            .collect()
    }

    pub fn get_public(&self, team_id: &str) -> Option<Value> {
        self.cache
            .lock()
            .unwrap()
            .iter()
            .find(|t| t.team_id == team_id)
            .map(Self::to_public)
    }

    pub fn exists(&self, team_id: &str) -> bool {
        self.cache
            .lock()
            .unwrap()
            .iter()
            .any(|t| t.team_id == team_id)
    }

    /// Ekip ekler/günceller (düz sırlar şifrelenir).
    pub fn add(&self, vault: &Vault, input: TeamInsert) {
        let mut cache = self.cache.lock().unwrap();
        let (gist, webdav) = match input.provider.as_str() {
            "webdav" => (
                GistCfg::default(),
                WebdavCfg {
                    url: input.url,
                    user: input.user,
                    password_secret: if input.password.is_empty() {
                        None
                    } else {
                        vault.encrypt_secret(&input.password)
                    },
                },
            ),
            _ => (
                GistCfg {
                    gist_id: input.gist_id,
                    token_secret: if input.token.is_empty() {
                        None
                    } else {
                        vault.encrypt_secret(&input.token)
                    },
                },
                WebdavCfg::default(),
            ),
        };
        let team = StoredTeam {
            team_id: input.team_id.clone(),
            name: input.name,
            role: input.role,
            member_id: input.member_id,
            member_name: input.member_name,
            provider: input.provider,
            gist,
            webdav,
            team_key_secret: vault.encrypt_secret(&input.team_key),
            members: None,
            sites: None,
            last_sync_at: None,
            last_revision: None,
        };
        match cache.iter().position(|t| t.team_id == input.team_id) {
            Some(i) => cache[i] = team,
            None => cache.push(team),
        }
        self.save(&cache);
    }

    pub fn remove(&self, team_id: &str) {
        let mut cache = self.cache.lock().unwrap();
        cache.retain(|t| t.team_id != team_id);
        self.save(&cache);
    }

    pub fn team_key(&self, vault: &Vault, team_id: &str) -> Option<String> {
        let cache = self.cache.lock().unwrap();
        let t = cache.iter().find(|t| t.team_id == team_id)?;
        t.team_key_secret
            .as_ref()
            .map(|s| vault.decrypt_secret(s))
            .filter(|k| !k.is_empty())
    }

    pub fn credentials(&self, vault: &Vault, team_id: &str) -> Option<TeamCreds> {
        let cache = self.cache.lock().unwrap();
        let t = cache.iter().find(|t| t.team_id == team_id)?;
        Some(match t.provider.as_str() {
            "webdav" => TeamCreds::Webdav {
                url: t.webdav.url.clone(),
                user: t.webdav.user.clone(),
                password: t
                    .webdav
                    .password_secret
                    .as_ref()
                    .map(|s| vault.decrypt_secret(s))
                    .unwrap_or_default(),
            },
            _ => TeamCreds::Gist {
                token: t
                    .gist
                    .token_secret
                    .as_ref()
                    .map(|s| vault.decrypt_secret(s))
                    .unwrap_or_default(),
                gist_id: t.gist.gist_id.clone(),
            },
        })
    }

    pub fn member_id(&self, team_id: &str) -> Option<String> {
        self.cache
            .lock()
            .unwrap()
            .iter()
            .find(|t| t.team_id == team_id)
            .map(|t| t.member_id.clone())
    }

    pub fn role(&self, team_id: &str) -> Option<String> {
        self.cache
            .lock()
            .unwrap()
            .iter()
            .find(|t| t.team_id == team_id)
            .map(|t| t.role.clone())
    }

    pub fn cached_sites(&self, team_id: &str) -> Vec<SiteExportEntry> {
        self.cache
            .lock()
            .unwrap()
            .iter()
            .find(|t| t.team_id == team_id)
            .and_then(|t| t.sites.clone())
            .unwrap_or_default()
    }

    pub fn cached_members(&self, team_id: &str) -> Vec<TeamMember> {
        self.cache
            .lock()
            .unwrap()
            .iter()
            .find(|t| t.team_id == team_id)
            .and_then(|t| t.members.clone())
            .unwrap_or_default()
    }

    pub fn set_gist_id(&self, team_id: &str, id: &str) {
        let mut cache = self.cache.lock().unwrap();
        if let Some(t) = cache.iter_mut().find(|t| t.team_id == team_id) {
            if t.gist.gist_id != id {
                t.gist.gist_id = id.to_string();
                self.save(&cache);
            }
        }
    }

    /// Çekiş sonrası yerel önbelleği günceller.
    pub fn mark_synced(
        &self,
        team_id: &str,
        members: Vec<TeamMember>,
        sites: Vec<SiteExportEntry>,
        revision: u64,
        my_role: Option<String>,
        now: String,
    ) {
        let mut cache = self.cache.lock().unwrap();
        if let Some(t) = cache.iter_mut().find(|t| t.team_id == team_id) {
            t.members = Some(members);
            t.sites = Some(sites);
            t.last_revision = Some(revision);
            t.last_sync_at = Some(now);
            if let Some(r) = my_role {
                t.role = r;
            }
            self.save(&cache);
        }
    }
}
