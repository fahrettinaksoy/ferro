//! Yerinde düzenleme — `EditManager.ts` karşılığı. Uzak dosya geçici dizine
//! indirilir, editörde açılır, değişiklikler izlenip (debounce) yeniden yüklenir.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use tauri::AppHandle;
use uuid::Uuid;

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::{EditorConfig, EditorMode, TransferDirection};

use super::queue::{TransferManager, TransferParams};
use super::session::SessionManager;

const DEBOUNCE: Duration = Duration::from_millis(800);

/// Aktif bir düzenleme oturumu (watcher + geçici dizin canlı tutulur).
struct EditSession {
    _debouncer: Debouncer<notify::RecommendedWatcher>,
    temp_dir: PathBuf,
}

#[derive(Default)]
pub struct EditManager {
    sessions: Mutex<Vec<EditSession>>,
}

impl EditManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Uzak dosyayı indirir, editörde açar ve değişiklikleri izlemeye başlar.
    #[allow(clippy::too_many_arguments)]
    pub fn open(
        self: &Arc<Self>,
        app: &AppHandle,
        sessions: &Arc<SessionManager>,
        transfers: &Arc<TransferManager>,
        session_id: &str,
        remote_path: &str,
        name: &str,
        editor: EditorConfig,
        params: TransferParams,
    ) -> FerroResult<()> {
        // Geçici dizin + yerel dosya.
        let temp_dir = std::env::temp_dir().join(format!("ferro-edit-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir)?;
        let local = temp_dir.join(name);

        // İndir (bloklayan — ayrı transfer istemcisi).
        let mut client = sessions.build_transfer_client(session_id, app)?;
        let mut ctx = super::client::TransferCtx {
            start_at: 0,
            cancel: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            throttle: None,
            on_progress: Box::new(|_, _| {}),
        };
        let dl = client.download(remote_path, &local, &mut ctx);
        client.disconnect();
        dl?;

        // Editörde aç.
        open_in_editor(&editor, &local)?;

        // Değişiklikleri izle → debounce → yükle.
        let app2 = app.clone();
        let transfers2 = transfers.clone();
        let sid = session_id.to_string();
        let rp = remote_path.to_string();
        let lp = local.to_string_lossy().to_string();
        let nm = name.to_string();
        let params2 = params.clone();

        let mut debouncer = new_debouncer(DEBOUNCE, move |res: DebounceEventResult| {
            if let Ok(events) = res {
                if events.is_empty() {
                    return;
                }
                // Değişiklik: güncel içeriği uzağa geri yükle.
                transfers2.enqueue_file(
                    app2.clone(),
                    sid.clone(),
                    TransferDirection::Upload,
                    rp.clone(),
                    lp.clone(),
                    nm.clone(),
                    params2.clone(),
                );
            }
        })
        .map_err(|e| FerroError::with_detail(FerroErrorCode::Unknown, "Dosya izleyici kurulamadı", e.to_string()))?;
        debouncer
            .watcher()
            .watch(&temp_dir, RecursiveMode::NonRecursive)
            .map_err(|e| FerroError::with_detail(FerroErrorCode::Unknown, "Dosya izlenemedi", e.to_string()))?;

        self.sessions.lock().unwrap().push(EditSession { _debouncer: debouncer, temp_dir });
        Ok(())
    }

    /// Tüm izleyicileri durdurur ve geçici dizinleri temizler (çıkışta).
    pub fn stop_all(&self) {
        let sessions: Vec<EditSession> = self.sessions.lock().unwrap().drain(..).collect();
        for s in sessions {
            let _ = std::fs::remove_dir_all(&s.temp_dir);
        }
    }
}

/// Yerel dosyayı yapılandırılan editörde açar.
fn open_in_editor(editor: &EditorConfig, local: &std::path::Path) -> FerroResult<()> {
    if editor.mode == EditorMode::Custom && !editor.custom_path.is_empty() {
        std::process::Command::new(&editor.custom_path)
            .arg(local)
            .spawn()
            .map_err(|e| FerroError::with_detail(FerroErrorCode::FsError, "Özel editör açılamadı", e.to_string()))?;
        return Ok(());
    }
    // Sistem varsayılanı.
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(local);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", ""]).arg(local);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(local);
        c
    };
    cmd.spawn()
        .map_err(|e| FerroError::with_detail(FerroErrorCode::FsError, "Editör açılamadı", e.to_string()))?;
    Ok(())
}
