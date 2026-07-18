//! Çalışma zamanı ayarları — `src/main/core/runtimeSettings.ts` karşılığı.
//! Renderer `settings:apply` ile iter; transfer/log/updater bunu okur.

use std::sync::Mutex;

use crate::types::{
    EditorConfig, EditorMode, FileExistsAction, LoggingConfig, ProxyConfig, ProxyType,
    RuntimeSettings, TransferTypeConfig, TransferTypeMode, UpdatesConfig,
};

/// runtimeSettings.ts DEFAULTS ile birebir.
fn defaults() -> RuntimeSettings {
    RuntimeSettings {
        bandwidth_bytes_per_sec: 0,
        max_connections: 3,
        connect_timeout_ms: 20_000,
        keep_alive: false,
        retry_max_attempts: 3,
        retry_delay_ms: 5_000,
        file_exists_download: FileExistsAction::Resume,
        file_exists_upload: FileExistsAction::Resume,
        transfer_type: TransferTypeConfig {
            mode: TransferTypeMode::Auto,
            ascii_extensions: Vec::new(),
            no_ext_as_ascii: true,
            dotfiles_as_ascii: true,
        },
        editor: EditorConfig {
            mode: EditorMode::System,
            custom_path: String::new(),
        },
        proxy: ProxyConfig {
            proxy_type: ProxyType::None,
            host: String::new(),
            port: 0,
            user: None,
            password: None,
        },
        logging: LoggingConfig {
            to_file: true,
            max_size_mib: 5,
        },
        updates: UpdatesConfig {
            frequency: "weekly".into(),
            channel: "stable".into(),
        },
    }
}

pub struct Settings {
    current: Mutex<RuntimeSettings>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            current: Mutex::new(defaults()),
        }
    }
}

#[derive(Clone, Copy)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
}

impl Settings {
    pub fn set(&self, next: RuntimeSettings) {
        *self.current.lock().unwrap() = next;
    }

    pub fn get(&self) -> RuntimeSettings {
        self.current.lock().unwrap().clone()
    }

    pub fn connect_timeout_ms(&self) -> u64 {
        self.current.lock().unwrap().connect_timeout_ms
    }

    pub fn keep_alive(&self) -> bool {
        self.current.lock().unwrap().keep_alive
    }

    pub fn bandwidth_bps(&self) -> u64 {
        self.current.lock().unwrap().bandwidth_bytes_per_sec
    }

    pub fn retry_policy(&self) -> RetryPolicy {
        let s = self.current.lock().unwrap();
        RetryPolicy {
            max_attempts: s.retry_max_attempts,
            base_delay_ms: s.retry_delay_ms,
        }
    }

    pub fn file_exists_policy(&self, upload: bool) -> FileExistsAction {
        let s = self.current.lock().unwrap();
        if upload {
            s.file_exists_upload
        } else {
            s.file_exists_download
        }
    }

    pub fn transfer_type(&self) -> TransferTypeConfig {
        self.current.lock().unwrap().transfer_type.clone()
    }

    pub fn editor(&self) -> EditorConfig {
        self.current.lock().unwrap().editor.clone()
    }

    /// Etkin vekil sunucu — type none ya da boş host ise None.
    pub fn active_proxy(&self) -> Option<ProxyConfig> {
        let s = self.current.lock().unwrap();
        if s.proxy.proxy_type == ProxyType::None || s.proxy.host.is_empty() {
            None
        } else {
            Some(s.proxy.clone())
        }
    }

    pub fn max_connections(&self) -> u8 {
        self.current.lock().unwrap().max_connections
    }
}
