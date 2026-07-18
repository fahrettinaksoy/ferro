//! Protokol-agnostik, IPC üzerinden serileştirilebilir hata modeli.
//! `src/shared/errors.ts` içindeki FerroError/SerializedError ile birebir uyumludur:
//! renderer köprüsü (lib/ipc.ts) bu zarfı çözüp `code` alanını korur.

use serde::Serialize;

/// `src/shared/errors.ts` FerroErrorCode birliğinin Rust karşılığı.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum FerroErrorCode {
    #[serde(rename = "UNKNOWN")]
    Unknown,
    #[serde(rename = "IPC_HANDLER_MISSING")]
    IpcHandlerMissing,
    #[serde(rename = "VALIDATION")]
    Validation,
    #[serde(rename = "CONNECTION_FAILED")]
    ConnectionFailed,
    #[serde(rename = "AUTH_FAILED")]
    AuthFailed,
    #[serde(rename = "NOT_CONNECTED")]
    NotConnected,
    #[serde(rename = "TLS_UNTRUSTED")]
    TlsUntrusted,
    #[serde(rename = "HOST_KEY_UNTRUSTED")]
    HostKeyUntrusted,
    #[serde(rename = "TRANSFER_FAILED")]
    TransferFailed,
    #[serde(rename = "FS_ERROR")]
    FsError,
    #[serde(rename = "NOT_FOUND")]
    NotFound,
    #[serde(rename = "PERMISSION_DENIED")]
    PermissionDenied,
    #[serde(rename = "TIMEOUT")]
    Timeout,
    #[serde(rename = "CANCELLED")]
    Cancelled,
}

/// Renderer'a giden serileştirilmiş hata: `{ name, code, message, detail? }`.
#[derive(Debug, Clone, Serialize)]
pub struct SerializedError {
    pub name: &'static str,
    pub code: FerroErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Uygulama genelinde taşınan hata tipi. Handler'lar `Result<T, FerroError>` döndürür;
/// köprü bunu `IpcResult::Err(SerializedError)` zarfına çevirir.
#[derive(Debug, Clone, thiserror::Error)]
#[error("{code:?}: {message}")]
pub struct FerroError {
    pub code: FerroErrorCode,
    pub message: String,
    pub detail: Option<String>,
}

impl FerroError {
    pub fn new(code: FerroErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(
        code: FerroErrorCode,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            detail: Some(detail.into()),
        }
    }

    pub fn serialize(&self) -> SerializedError {
        SerializedError {
            name: "FerroError",
            code: self.code,
            message: self.message.clone(),
            detail: self.detail.clone(),
        }
    }
}

/// Kısayol yapıcılar — handler kodunu okunur tutar.
pub fn validation(msg: impl Into<String>) -> FerroError {
    FerroError::new(FerroErrorCode::Validation, msg)
}
pub fn not_found(msg: impl Into<String>) -> FerroError {
    FerroError::new(FerroErrorCode::NotFound, msg)
}
pub fn not_connected(msg: impl Into<String>) -> FerroError {
    FerroError::new(FerroErrorCode::NotConnected, msg)
}
pub fn fs_error(msg: impl Into<String>) -> FerroError {
    FerroError::new(FerroErrorCode::FsError, msg)
}

/// serde_json hataları düz VALIDATION'a düşer (geçersiz yük şekli).
impl From<serde_json::Error> for FerroError {
    fn from(e: serde_json::Error) -> Self {
        FerroError::with_detail(
            FerroErrorCode::Validation,
            "Geçersiz IPC yükü",
            e.to_string(),
        )
    }
}

/// Tauri iç hataları (menü kurulumu vb.) UNKNOWN'a düşer.
impl From<tauri::Error> for FerroError {
    fn from(e: tauri::Error) -> Self {
        FerroError::with_detail(FerroErrorCode::Unknown, "Tauri hatası", e.to_string())
    }
}

/// io hataları FS_ERROR/NOT_FOUND/PERMISSION_DENIED'e eşlenir.
impl From<std::io::Error> for FerroError {
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind::*;
        let code = match e.kind() {
            NotFound => FerroErrorCode::NotFound,
            PermissionDenied => FerroErrorCode::PermissionDenied,
            TimedOut => FerroErrorCode::Timeout,
            _ => FerroErrorCode::FsError,
        };
        FerroError::with_detail(code, "Dosya sistemi hatası", e.to_string())
    }
}

pub type FerroResult<T> = Result<T, FerroError>;
