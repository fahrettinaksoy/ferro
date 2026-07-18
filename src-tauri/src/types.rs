//! Protokolden bağımsız transfer/alan tipleri — `src/shared/transfer.ts` karşılığı.
//! Alan adları renderer sözleşmesiyle birebir (camelCase). Bunlar hem köprü
//! yükleri hem disk (sites.json vb.) için serde ile (de)serileştirilir.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Protocol {
    #[serde(rename = "ftp")]
    Ftp,
    #[serde(rename = "ftps")]
    Ftps,
    #[serde(rename = "ftps-implicit")]
    FtpsImplicit,
    #[serde(rename = "sftp")]
    Sftp,
}

impl Protocol {
    /// Bir protokol için varsayılan port (`defaultPort` karşılığı).
    pub fn default_port(self) -> u16 {
        match self {
            Protocol::FtpsImplicit => 990,
            Protocol::Sftp => 22,
            _ => 21,
        }
    }
    pub fn is_ftp_family(self) -> bool {
        !matches!(self, Protocol::Sftp)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryType {
    File,
    Directory,
    Symlink,
    Unknown,
}

/// Uzak dizin girdisi (protokol-agnostik normalize edilmiş).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub entry_type: EntryType,
    pub size: u64,
    /// Değişiklik zamanı (epoch ms). Sunucu vermezse null.
    #[serde(rename = "modifiedAt")]
    pub modified_at: Option<i64>,
    /// Unix izinleri (örn. 0o755) — biliniyorsa.
    pub permissions: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(
        rename = "linkTarget",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub link_target: Option<String>,
}

/// Kullanıcı tarafından girilen/saklanan bağlantı yapılandırması.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    /// SFTP için özel anahtar (PEM).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub private_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anonymous: Option<bool>,
    /// Kontrol bağlantısı karakter kodlaması (FTP). Varsayılan utf8.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    /// Self-signed TLS sertifikalarını kabul et (FTPS).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reject_unauthorized: Option<bool>,
    /// Paralel transfer için en fazla bağlantı (varsayılan 3, 1-10).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_connections: Option<u8>,
}

/// Transfer ilerleme bildirimi (main → renderer).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TransferProgress {
    pub bytes: u64,
    pub total: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferDirection {
    Download,
    Upload,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferJobStatus {
    Queued,
    Active,
    Completed,
    Failed,
    Cancelled,
}

/// Transfer kuyruğundaki bir iş (main ↔ renderer ortak durumu).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferJob {
    pub id: String,
    pub session_id: String,
    pub direction: TransferDirection,
    pub name: String,
    pub remote_path: String,
    pub local_path: String,
    pub status: TransferJobStatus,
    pub bytes: u64,
    pub total: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferMode {
    Default,
    Active,
    Passive,
}

/// Site Yöneticisi gelişmiş sekme alanları — tümü opsiyonel, site başına saklanır.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteAdvanced {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bypass_proxy: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sync_browsing: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dir_comparison: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone_hours: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone_minutes: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transfer_mode: Option<TransferMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit_connections: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_connections: Option<u8>,
}

/// Kaydedilmiş bir bağlantı (Site Yöneticisi). Parola İÇERMEZ — yalnızca var/yok.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSite {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anonymous: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ask_password: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reject_unauthorized: Option<bool>,
    pub has_password: bool,
    #[serde(flatten)]
    pub advanced: SiteAdvanced,
}

/// Site kaydetme/güncelleme girdisi (renderer → main).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anonymous: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ask_password: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reject_unauthorized: Option<bool>,
    #[serde(flatten)]
    pub advanced: SiteAdvanced,
}

/// Dışa aktarma kaydı: SiteInput'un id'siz hâli (`password` yalnızca istenirse).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteExportEntry {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anonymous: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ask_password: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reject_unauthorized: Option<bool>,
    #[serde(flatten)]
    pub advanced: SiteAdvanced,
}

/// Hedef dosya zaten varsa uygulanacak politika.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileExistsAction {
    Ask,
    Overwrite,
    OverwriteNewer,
    OverwriteSize,
    Resume,
    Rename,
    Skip,
}

/// FTP aktarım türü (ASCII/binary).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferTypeMode {
    Auto,
    Ascii,
    Binary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProxyType {
    None,
    Http,
    Socks4,
    Socks5,
}

/// SFTP için vekil sunucu yapılandırması.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    #[serde(rename = "type")]
    pub proxy_type: ProxyType,
    pub host: String,
    pub port: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
}

/// FTP ASCII/binary sınıflandırma kuralları.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferTypeConfig {
    pub mode: TransferTypeMode,
    pub ascii_extensions: Vec<String>,
    pub no_ext_as_ascii: bool,
    pub dotfiles_as_ascii: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EditorMode {
    None,
    System,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorConfig {
    pub mode: EditorMode,
    pub custom_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    #[serde(rename = "toFile")]
    pub to_file: bool,
    #[serde(rename = "maxSizeMiB")]
    pub max_size_mib: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatesConfig {
    pub frequency: String,
    pub channel: String,
}

/// Renderer'ın main sürece ittiği çalışma zamanı ayarları (`RuntimeSettings`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSettings {
    pub bandwidth_bytes_per_sec: u64,
    pub max_connections: u8,
    pub connect_timeout_ms: u64,
    pub keep_alive: bool,
    pub retry_max_attempts: u32,
    pub retry_delay_ms: u64,
    pub file_exists_download: FileExistsAction,
    pub file_exists_upload: FileExistsAction,
    pub transfer_type: TransferTypeConfig,
    pub editor: EditorConfig,
    pub proxy: ProxyConfig,
    pub logging: LoggingConfig,
    pub updates: UpdatesConfig,
}

/// İki dizin karşılaştırması (senkronizasyon) için tek girdi.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncEntry {
    pub name: String,
    pub is_directory: bool,
    pub in_local: bool,
    pub in_remote: bool,
    pub local_size: Option<u64>,
    pub local_mtime: Option<i64>,
    pub remote_size: Option<u64>,
    pub remote_mtime: Option<i64>,
}

/// Yerel dosya sistemi girdisi (renderer'da yerel panel için).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub entry_type: EntryType,
    pub size: u64,
    pub modified_at: Option<i64>,
    pub path: String,
}
