//! Sync blob şifrelemesi — `sync/crypto.ts` karşılığı (byte-uyumlu).
//! scrypt(N=16384,r=8,p=1) + AES-256-GCM, `data = base64(ct ‖ tag)`, `iv` ayrı.

use serde::{Deserialize, Serialize};

use crate::crypto::{b64, derive_key, gcm_decrypt, gcm_encrypt, random_bytes, unb64, KDF_N, KDF_P, KDF_R, SALT_LEN};
use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::SiteExportEntry;

pub const SYNC_FILE_NAME: &str = "ferro-sync.json";

/// Ayarlar anlık görüntüsü: anahtar → değer.
pub type SettingsSnapshot = std::collections::BTreeMap<String, String>;

/// Şifrelenen düz yük.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPayload {
    pub kind: String, // 'ferro-sync-payload'
    pub version: u32,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sites: Option<Vec<SiteExportEntry>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<SettingsSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncKdf {
    pub algo: String, // 'scrypt'
    pub salt: String,
    #[serde(rename = "N")]
    pub n: u32,
    pub r: u32,
    pub p: u32,
}

/// Uzak depoya yazılan şifreli zarf.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncBlobFile {
    pub app: String,
    pub kind: String,
    pub version: u32,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub kdf: SyncKdf,
    pub cipher: String,
    pub iv: String,
    pub data: String,
}

/// Yükü sync parolasıyla şifreleyip zarfı üretir.
pub fn encrypt_sync_payload(payload: &SyncPayload, password: &str) -> FerroResult<SyncBlobFile> {
    let salt = random_bytes(SALT_LEN);
    let key = derive_key(password, &salt, KDF_N, KDF_R, KDF_P)?;
    let plain = serde_json::to_vec(payload)?;
    let (iv, data) = gcm_encrypt(&key, &plain)?;
    Ok(SyncBlobFile {
        app: "ferro".into(),
        kind: "ferro-sync".into(),
        version: 1,
        updated_at: payload.updated_at.clone(),
        kdf: SyncKdf { algo: "scrypt".into(), salt: b64(&salt), n: KDF_N, r: KDF_R, p: KDF_P },
        cipher: "aes-256-gcm".into(),
        iv: b64(&iv),
        data: b64(&data),
    })
}

/// Zarfı çözer. Yanlış parola/bozuk veri → AUTH_FAILED; tanınmayan format → VALIDATION.
pub fn decrypt_sync_payload(file: &SyncBlobFile, password: &str) -> FerroResult<SyncPayload> {
    if file.kind != "ferro-sync" || file.version != 1 || file.cipher != "aes-256-gcm" {
        return Err(FerroError::new(FerroErrorCode::Validation, "Tanınmayan sync dosyası formatı"));
    }
    let salt = unb64(&file.kdf.salt)?;
    let key = derive_key(password, &salt, file.kdf.n, file.kdf.r, file.kdf.p)?;
    let iv = unb64(&file.iv)?;
    let data = unb64(&file.data)?;
    let plain = gcm_decrypt(&key, &iv, &data)?;
    let payload: SyncPayload = serde_json::from_slice(&plain)
        .map_err(|e| FerroError::with_detail(FerroErrorCode::Validation, "Sync yükü çözümlenemedi", e.to_string()))?;
    if payload.kind != "ferro-sync-payload" {
        return Err(FerroError::new(FerroErrorCode::Validation, "Sync yükü türü uyuşmuyor"));
    }
    Ok(payload)
}
