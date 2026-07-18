//! Oturum yöneticisi — `SessionManager.ts` karşılığı (bağlantı yaşam döngüsü).
//!
//! Her oturum bir "browsing" istemcisi tutar (fs gezinme). Transferler ayrı havuz
//! istemcileri kullanır (Phase 3 devamı) — böylece uzun transfer taramayı bloklamaz.
//! İstemci metotları bloklayıcıdır; handler'lar bunları `spawn_blocking` ile çağırır.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::AppHandle;

use crate::bridge::emit_event;
use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::{ConnectionConfig, Protocol, RemoteEntry};

use super::client::TransferClient;
use super::client::AdapterOptions;
use super::ftp::FtpConnection;
use super::sftp::SftpConnection;
use super::tofu::Tofu;

/// Tek bir bağlı oturum: config + adaptör opsiyonları + browsing istemcisi.
pub struct Session {
    pub id: String,
    pub config: ConnectionConfig,
    opts: AdapterOptions,
    browsing: Mutex<Box<dyn TransferClient>>,
}

impl Session {
    fn with_client<T>(&self, f: impl FnOnce(&mut dyn TransferClient) -> FerroResult<T>) -> FerroResult<T> {
        let mut guard = self.browsing.lock().unwrap();
        f(guard.as_mut())
    }

    pub fn pwd(&self) -> FerroResult<String> {
        self.with_client(|c| c.pwd())
    }
    pub fn cwd(&self, path: &str) -> FerroResult<String> {
        self.with_client(|c| c.cwd(path))
    }
    pub fn list(&self, path: Option<&str>) -> FerroResult<Vec<RemoteEntry>> {
        self.with_client(|c| c.list(path))
    }
    pub fn mkdir(&self, path: &str) -> FerroResult<()> {
        self.with_client(|c| c.mkdir(path))
    }
    pub fn delete(&self, path: &str) -> FerroResult<()> {
        self.with_client(|c| c.delete(path))
    }
    pub fn rmdir(&self, path: &str) -> FerroResult<()> {
        self.with_client(|c| c.rmdir(path))
    }
    pub fn rename(&self, from: &str, to: &str) -> FerroResult<()> {
        self.with_client(|c| c.rename(from, to))
    }
    pub fn chmod(&self, path: &str, mode: u32) -> FerroResult<()> {
        self.with_client(|c| c.chmod(path, mode))
    }

    fn disconnect(&self) {
        if let Ok(mut c) = self.browsing.lock() {
            c.disconnect();
        }
    }
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    counter: AtomicU64,
    tofu: Arc<Tofu>,
}

impl SessionManager {
    pub fn new(tofu: Arc<Tofu>) -> Self {
        Self { sessions: Mutex::new(HashMap::new()), counter: AtomicU64::new(0), tofu }
    }

    /// Verilen config için istemci kurar (protokole göre). Bloklayıcıdır.
    fn build_client(
        &self,
        config: &ConnectionConfig,
        opts: &AdapterOptions,
        app: &AppHandle,
    ) -> FerroResult<Box<dyn TransferClient>> {
        match config.protocol {
            Protocol::Sftp => {
                let c = SftpConnection::connect(config, opts, self.tofu.clone(), app.clone())?;
                Ok(Box::new(c))
            }
            _ => {
                let c = FtpConnection::connect(config, opts, self.tofu.clone(), app.clone())?;
                Ok(Box::new(c))
            }
        }
    }

    /// Bağlanır (bloklayıcı). Oturum kimliği + cwd döner. `session:connecting`
    /// olayı bağlantı denemesi başında yayınlanır.
    pub fn connect(
        &self,
        app: &AppHandle,
        config: ConnectionConfig,
        opts: AdapterOptions,
    ) -> FerroResult<(String, String)> {
        let id = format!("s{}", self.counter.fetch_add(1, Ordering::Relaxed) + 1);
        emit_event(
            app,
            "session:connecting",
            serde_json::json!({ "sessionId": id, "host": config.host, "port": config.port }),
        );
        emit_log(app, &id, "info", &format!("Bağlanılıyor: {}:{}", config.host, config.port));

        let mut client = self.build_client(&config, &opts, app).inspect_err(|e| {
            emit_log(app, &id, "error", &format!("Bağlantı hatası: {}", e.message));
        })?;
        let cwd = client.pwd().unwrap_or_else(|_| "/".to_string());

        let session = Arc::new(Session { id: id.clone(), config, opts, browsing: Mutex::new(client) });
        self.sessions.lock().unwrap().insert(id.clone(), session);
        emit_log(app, &id, "info", "Bağlandı");
        Ok((id, cwd))
    }

    /// Transfer için o oturumun config + opsiyonlarıyla YENİ (ayrı) bir istemci kurar.
    /// Böylece transfer, browsing istemcisini (dolayısıyla taramayı) bloklamaz.
    pub fn build_transfer_client(
        &self,
        session_id: &str,
        app: &AppHandle,
    ) -> FerroResult<Box<dyn TransferClient>> {
        let session = self.require(session_id)?;
        self.build_client(&session.config, &session.opts, app)
    }

    pub fn require(&self, id: &str) -> FerroResult<Arc<Session>> {
        self.sessions
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| FerroError::new(FerroErrorCode::NotConnected, "Oturum bulunamadı ya da bağlantı kapalı"))
    }

    pub fn disconnect(&self, id: &str) -> FerroResult<()> {
        if let Some(session) = self.sessions.lock().unwrap().remove(id) {
            session.disconnect();
        }
        Ok(())
    }

    pub fn disconnect_all(&self) {
        let sessions: Vec<Arc<Session>> = self.sessions.lock().unwrap().drain().map(|(_, s)| s).collect();
        for s in sessions {
            s.disconnect();
        }
    }
}

/// `session:log` olayını yayınlar (log paneli için) + dosya loguna yazar.
pub fn emit_log(app: &AppHandle, session_id: &str, level: &str, text: &str) {
    crate::logger::log(level, session_id, text);
    emit_event(
        app,
        "session:log",
        serde_json::json!({ "sessionId": session_id, "level": level, "text": text }),
    );
}
