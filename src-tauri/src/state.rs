//! Uygulama geneli paylaşılan durum. `setup()`'ta üretilir, Tauri `manage()` ile
//! enjekte edilir; handler'lar `State<'_, AppState>` üzerinden erişir.

use std::sync::Arc;

use crate::paths::Paths;
use crate::settings::Settings;
use crate::store::SiteStore;
use crate::sync::config::SyncConfigStore;
use crate::team::store::TeamStore;
use crate::transfer::edit::EditManager;
use crate::transfer::queue::TransferManager;
use crate::transfer::session::SessionManager;
use crate::transfer::tofu::Tofu;
use crate::vault::Vault;

pub struct AppState {
    pub paths: Paths,
    pub vault: Vault,
    pub sites: SiteStore,
    pub settings: Settings,
    pub tofu: Arc<Tofu>,
    pub sessions: Arc<SessionManager>,
    pub transfers: Arc<TransferManager>,
    pub sync: SyncConfigStore,
    pub teams: TeamStore,
    pub edits: Arc<EditManager>,
}

impl AppState {
    pub fn new(paths: Paths) -> Self {
        let vault = Vault::new(&paths.config_dir);
        let sites = SiteStore::new(&paths.config_dir, &paths.resource_dir);
        let tofu = Arc::new(Tofu::new(&paths.config_dir));
        let sessions = Arc::new(SessionManager::new(tofu.clone()));
        let transfers = Arc::new(TransferManager::new(sessions.clone()));
        let sync = SyncConfigStore::new(&paths.config_dir);
        let teams = TeamStore::new(&paths.config_dir);
        let edits = Arc::new(EditManager::new());
        Self { vault, sites, settings: Settings::default(), tofu, sessions, transfers, sync, teams, edits, paths }
    }
}
