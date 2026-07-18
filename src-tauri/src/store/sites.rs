//! Site deposu — `src/main/store/sites.ts` karşılığı. `sites.json` (v1), atomik.
//! Parolalar vault ile şifreli `secret` olarak saklanır; renderer'a yalnızca
//! `hasPassword` gider. İlk açılışta `sites.seed.json`'dan tohumlanır.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::types::{
    ConnectionConfig, Protocol, SavedSite, SiteAdvanced, SiteExportEntry, SiteInput,
};
use crate::vault::Vault;

use super::json_store::{read_versioned, write_versioned, ReadOutcome};

const STORE_VERSION: u32 = 1;

/// Diskte saklanan site kaydı (parola şifreli `secret` içerir).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSite {
    id: String,
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    folder: Option<String>,
    protocol: Protocol,
    host: String,
    port: u16,
    user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    anonymous: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ask_password: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    encoding: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reject_unauthorized: Option<bool>,
    /// Şifrelenmiş parola (vault formatı: m1:/k1:/p0:/v1:).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    secret: Option<String>,
    #[serde(flatten)]
    advanced: SiteAdvanced,
}

/// Tohum kaydı (`sites.seed.json`) — düz `password` ya da hazır `secret`.
#[derive(Debug, Clone, Deserialize)]
struct SeedSite {
    id: Option<String>,
    name: String,
    folder: Option<String>,
    protocol: Protocol,
    host: String,
    port: Option<u16>,
    user: Option<String>,
    password: Option<String>,
    secret: Option<String>,
    anonymous: Option<bool>,
    encoding: Option<String>,
    reject_unauthorized: Option<bool>,
}

pub struct SiteStore {
    file: PathBuf,
    resource_dir: PathBuf,
    cache: Mutex<Vec<StoredSite>>,
    loaded: Mutex<bool>,
}

/// Gelişmiş alanlardan boş string olanları temizler.
fn clean_advanced(mut a: SiteAdvanced) -> SiteAdvanced {
    fn blank(s: &Option<String>) -> bool {
        s.as_deref().map(|v| v.is_empty()).unwrap_or(false)
    }
    if blank(&a.comment) { a.comment = None }
    if blank(&a.color_label) { a.color_label = None }
    if blank(&a.server_type) { a.server_type = None }
    if blank(&a.local_dir) { a.local_dir = None }
    if blank(&a.remote_dir) { a.remote_dir = None }
    a
}

impl SiteStore {
    pub fn new(config_dir: &Path, resource_dir: &Path) -> Self {
        Self {
            file: config_dir.join("sites.json"),
            resource_dir: resource_dir.to_path_buf(),
            cache: Mutex::new(Vec::new()),
            loaded: Mutex::new(false),
        }
    }

    /// İlk erişimde diskten yükler (yoksa tohumlar). vault, tohumda parola
    /// şifrelemek için gerekebilir.
    fn ensure_loaded(&self, vault: &Vault) {
        let mut loaded = self.loaded.lock().unwrap();
        if *loaded {
            return;
        }
        let legacy = |parsed: &Value| -> Option<Vec<StoredSite>> {
            // Zarf öncesi format: çıplak dizi.
            parsed.as_array().and_then(|_| serde_json::from_value(parsed.clone()).ok())
        };
        let sites = match read_versioned::<Vec<StoredSite>, _>(&self.file, STORE_VERSION, legacy) {
            ReadOutcome::Loaded(v) => v,
            ReadOutcome::Missing => self.seed(vault),
            // Bozulma: kullanıcı verisinin üzerine seed YAZMA — boş başla.
            ReadOutcome::Corrupt => Vec::new(),
        };
        *self.cache.lock().unwrap() = sites;
        *loaded = true;
    }

    /// sites.seed.json'u kaynak dizinlerinde arar (yalnızca uygulama kökleri).
    fn seed_file(&self) -> Option<PathBuf> {
        let candidates = [
            self.resource_dir.join("seed/sites.seed.json"),
            self.resource_dir.join("sites.seed.json"),
        ];
        candidates.into_iter().find(|p| p.exists())
    }

    fn seed(&self, vault: &Vault) -> Vec<StoredSite> {
        let Some(path) = self.seed_file() else { return Vec::new() };
        let Ok(raw) = std::fs::read_to_string(&path) else { return Vec::new() };
        let Ok(seeds) = serde_json::from_str::<Vec<SeedSite>>(&raw) else { return Vec::new() };
        let records: Vec<StoredSite> = seeds
            .into_iter()
            .map(|s| {
                let secret = s.secret.or_else(|| {
                    s.password.as_ref().and_then(|p| vault.encrypt_secret(p))
                });
                let anon = s.anonymous.unwrap_or(false);
                StoredSite {
                    port: s.port.unwrap_or_else(|| s.protocol.default_port()),
                    user: s.user.unwrap_or_else(|| if anon { "anonymous".into() } else { String::new() }),
                    id: s.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
                    name: s.name,
                    folder: s.folder.filter(|f| !f.is_empty()),
                    protocol: s.protocol,
                    host: s.host,
                    anonymous: s.anonymous,
                    encoding: s.encoding,
                    reject_unauthorized: s.reject_unauthorized,
                    ask_password: None,
                    secret,
                    advanced: SiteAdvanced::default(),
                }
            })
            .collect();
        if let Err(e) = write_versioned(&self.file, STORE_VERSION, &records) {
            eprintln!("[ferro] tohum sites.json yazılamadı: {e}");
        }
        records
    }

    fn save(&self, cache: &[StoredSite]) {
        if let Err(e) = write_versioned(&self.file, STORE_VERSION, &cache.to_vec()) {
            eprintln!("[ferro] sites.json yazılamadı: {e}");
        }
    }

    fn to_public(s: &StoredSite) -> SavedSite {
        SavedSite {
            id: s.id.clone(),
            name: s.name.clone(),
            folder: s.folder.clone(),
            protocol: s.protocol,
            host: s.host.clone(),
            port: s.port,
            user: s.user.clone(),
            anonymous: s.anonymous,
            ask_password: s.ask_password,
            encoding: s.encoding.clone(),
            reject_unauthorized: s.reject_unauthorized,
            has_password: s.secret.is_some(),
            advanced: clean_advanced(s.advanced.clone()),
        }
    }

    pub fn list(&self, vault: &Vault) -> Vec<SavedSite> {
        self.ensure_loaded(vault);
        let cache = self.cache.lock().unwrap();
        let mut out: Vec<SavedSite> = cache.iter().map(Self::to_public).collect();
        out.sort_by(|a, b| {
            let fa = a.folder.clone().unwrap_or_default();
            let fb = b.folder.clone().unwrap_or_default();
            fa.cmp(&fb).then_with(|| a.name.cmp(&b.name))
        });
        out
    }

    pub fn upsert(&self, vault: &Vault, input: SiteInput) -> String {
        self.ensure_loaded(vault);
        let mut cache = self.cache.lock().unwrap();
        let existing_idx = input
            .id
            .as_ref()
            .and_then(|id| cache.iter().position(|s| &s.id == id));
        let id = existing_idx
            .map(|i| cache[i].id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        // Parola: yeni verildiyse şifrele; boş → temizle; verilmezse mevcut korunur.
        let mut secret = existing_idx.and_then(|i| cache[i].secret.clone());
        match input.password.as_deref() {
            Some(p) if !p.is_empty() => secret = vault.encrypt_secret(p),
            Some(_) if existing_idx.is_some() => secret = None, // boş parola → temizle
            _ => {}
        }
        if input.ask_password.unwrap_or(false) {
            secret = None;
        }

        let record = StoredSite {
            id: id.clone(),
            name: input.name,
            folder: input.folder.filter(|f| !f.is_empty()),
            protocol: input.protocol,
            host: input.host,
            port: input.port,
            user: input.user,
            anonymous: input.anonymous,
            ask_password: input.ask_password,
            encoding: input.encoding,
            reject_unauthorized: input.reject_unauthorized,
            secret,
            advanced: clean_advanced(input.advanced),
        };
        match existing_idx {
            Some(i) => cache[i] = record,
            None => cache.push(record),
        }
        self.save(&cache);
        id
    }

    pub fn remove(&self, vault: &Vault, id: &str) {
        self.ensure_loaded(vault);
        let mut cache = self.cache.lock().unwrap();
        cache.retain(|s| s.id != id);
        self.save(&cache);
    }

    pub fn rename_group(&self, vault: &Vault, from: &str, to: &str) -> u32 {
        self.ensure_loaded(vault);
        let mut cache = self.cache.lock().unwrap();
        let target = from.trim();
        let next = {
            let t = to.trim();
            if t.is_empty() { None } else { Some(t.to_string()) }
        };
        let mut count = 0u32;
        for s in cache.iter_mut() {
            if s.folder.clone().unwrap_or_default().trim() == target {
                s.folder = next.clone();
                count += 1;
            }
        }
        if count > 0 {
            self.save(&cache);
        }
        count
    }

    /// Bağlanmak için tam config (parola çözülmüş). passwordOverride: "parola sorulsun".
    pub fn build_config(
        &self,
        vault: &Vault,
        id: &str,
        password_override: Option<String>,
    ) -> Option<ConnectionConfig> {
        self.ensure_loaded(vault);
        let cache = self.cache.lock().unwrap();
        let s = cache.iter().find(|x| x.id == id)?;
        let password = password_override.or_else(|| {
            s.secret.as_ref().map(|sec| vault.decrypt_secret(sec))
        });
        let max_connections = if s.advanced.limit_connections.unwrap_or(false) {
            s.advanced.max_connections
        } else {
            None
        };
        Some(ConnectionConfig {
            protocol: s.protocol,
            host: s.host.clone(),
            port: s.port,
            user: s.user.clone(),
            password,
            private_key: None,
            passphrase: None,
            anonymous: s.anonymous,
            encoding: s.encoding.clone(),
            reject_unauthorized: s.reject_unauthorized,
            max_connections,
        })
    }

    // ── Vault mod geçişi ──

    /// Tüm site parolalarını düz metin çözer (vault kilitli değilken anlamlı).
    pub fn export_secrets(&self, vault: &Vault) -> Vec<(String, String)> {
        self.ensure_loaded(vault);
        let cache = self.cache.lock().unwrap();
        cache
            .iter()
            .filter_map(|s| s.secret.as_ref().map(|sec| (s.id.clone(), vault.decrypt_secret(sec))))
            .filter(|(_, plain)| !plain.is_empty())
            .collect()
    }

    /// Düz metin parolaları güncel vault şemasıyla yeniden şifreler.
    pub fn import_secrets(&self, vault: &Vault, items: Vec<(String, String)>) {
        self.ensure_loaded(vault);
        let mut cache = self.cache.lock().unwrap();
        for (id, plain) in items {
            if let Some(s) = cache.iter_mut().find(|x| x.id == id) {
                if let Some(enc) = vault.encrypt_secret(&plain) {
                    s.secret = Some(enc);
                }
            }
        }
        self.save(&cache);
    }

    // ── Dışa/İçe aktarma ──

    fn to_export(s: &StoredSite, vault: &Vault, include_password: bool, folder_override: Option<&str>) -> SiteExportEntry {
        let folder = match folder_override {
            Some(f) => if f.is_empty() { None } else { Some(f.to_string()) },
            None => s.folder.clone(),
        };
        let password = if include_password {
            s.secret.as_ref().map(|sec| vault.decrypt_secret(sec)).filter(|p| !p.is_empty())
        } else {
            None
        };
        SiteExportEntry {
            name: s.name.clone(),
            folder,
            protocol: s.protocol,
            host: s.host.clone(),
            port: s.port,
            user: s.user.clone(),
            password,
            anonymous: s.anonymous,
            ask_password: s.ask_password,
            encoding: s.encoding.clone(),
            reject_unauthorized: s.reject_unauthorized,
            advanced: clean_advanced(s.advanced.clone()),
        }
    }

    pub fn export_sites(&self, vault: &Vault, include_passwords: bool) -> Vec<SiteExportEntry> {
        self.ensure_loaded(vault);
        let cache = self.cache.lock().unwrap();
        cache.iter().map(|s| Self::to_export(s, vault, include_passwords, None)).collect()
    }

    /// Verilen id'leri dışa aktarır (ekip paylaşımı; parolalar çözülür, folder ezilir).
    pub fn export_sites_by_ids(&self, vault: &Vault, ids: &[String], folder_override: Option<&str>) -> Vec<SiteExportEntry> {
        self.ensure_loaded(vault);
        let cache = self.cache.lock().unwrap();
        let wanted: std::collections::HashSet<&String> = ids.iter().collect();
        cache
            .iter()
            .filter(|s| wanted.contains(&s.id))
            .map(|s| Self::to_export(s, vault, true, folder_override))
            .collect()
    }

    /// Dışa aktarma kayıtlarını içe aktarır (yinelenenler atlanır).
    pub fn import_sites(&self, vault: &Vault, entries: Vec<SiteExportEntry>) -> (u32, u32) {
        self.ensure_loaded(vault);
        let mut cache = self.cache.lock().unwrap();
        let key = |protocol: Protocol, host: &str, port: u16, user: &str, name: &str| -> String {
            format!("{:?} {} {} {} {}", protocol, host.to_lowercase(), port, user, name)
        };
        let mut seen: std::collections::HashSet<String> =
            cache.iter().map(|s| key(s.protocol, &s.host, s.port, &s.user, &s.name)).collect();
        let mut imported = 0u32;
        let mut skipped = 0u32;
        for e in entries {
            let k = key(e.protocol, &e.host, e.port, &e.user, &e.name);
            if seen.contains(&k) {
                skipped += 1;
                continue;
            }
            seen.insert(k);
            let secret = if !e.ask_password.unwrap_or(false) {
                e.password.as_ref().and_then(|p| vault.encrypt_secret(p))
            } else {
                None
            };
            cache.push(StoredSite {
                id: Uuid::new_v4().to_string(),
                name: e.name,
                folder: e.folder.filter(|f| !f.is_empty()),
                protocol: e.protocol,
                host: e.host,
                port: e.port,
                user: e.user,
                anonymous: e.anonymous,
                ask_password: e.ask_password,
                encoding: e.encoding,
                reject_unauthorized: e.reject_unauthorized,
                secret,
                advanced: clean_advanced(e.advanced),
            });
            imported += 1;
        }
        if imported > 0 {
            self.save(&cache);
        }
        (imported, skipped)
    }
}
