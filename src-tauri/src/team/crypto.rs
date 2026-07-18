//! Ekip kasası + davet şifrelemesi — `team/crypto.ts` karşılığı (byte-uyumlu).
//!
//! İki sınır: (1) Kasa, tam entropili 32B ekip anahtarıyla (TK) şifrelenir — KDF yok.
//! (2) Davet, PIN'den scrypt ile türetilen anahtarla şifrelenir. Her ikisi de
//! AES-256-GCM, `data = base64(ct ‖ tag)`, `iv` ayrı.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::crypto::{
    b64, derive_key, gcm_decrypt, gcm_encrypt, key_from_b64, random_bytes, unb64, KDF_N, KDF_P,
    KDF_R, SALT_LEN,
};
use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::SiteExportEntry;

pub const TEAM_FILE_NAME: &str = "ferro-team.json";
pub const INVITE_CODE_PREFIX: &str = "ferro-invite-1.";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub id: String,
    pub name: String,
    pub role: String, // admin | member | readonly
    #[serde(rename = "addedAt")]
    pub added_at: String,
    #[serde(rename = "addedBy", default, skip_serializing_if = "Option::is_none")]
    pub added_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamPayload {
    pub kind: String, // 'ferro-team-payload'
    pub version: u32,
    #[serde(rename = "teamId")]
    pub team_id: String,
    pub name: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub revision: u64,
    pub members: Vec<TeamMember>,
    pub sites: Vec<SiteExportEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamBlobFile {
    pub app: String,
    pub kind: String,
    pub version: u32,
    #[serde(rename = "teamId")]
    pub team_id: String,
    pub name: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub revision: u64,
    pub cipher: String,
    pub iv: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteGist {
    #[serde(rename = "gistId")]
    pub gist_id: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteWebdav {
    pub url: String,
    pub user: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamInvitePayload {
    #[serde(rename = "teamKey")]
    pub team_key: String,
    pub provider: String, // gist | webdav
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gist: Option<InviteGist>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub webdav: Option<InviteWebdav>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteKdf {
    pub algo: String,
    pub salt: String,
    #[serde(rename = "N")]
    pub n: u32,
    pub r: u32,
    pub p: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamInviteFile {
    pub app: String,
    pub kind: String,
    pub version: u32,
    #[serde(rename = "teamId")]
    pub team_id: String,
    #[serde(rename = "teamName")]
    pub team_name: String,
    pub role: String,
    pub kdf: InviteKdf,
    pub cipher: String,
    pub iv: String,
    pub data: String,
}

/// Yeni bir ekip anahtarı üretir (base64, 32 bayt tam entropi).
pub fn generate_team_key() -> String {
    b64(&random_bytes(32))
}

// ── Kasa (TK ile) ──

pub fn encrypt_team_payload(
    payload: &TeamPayload,
    team_key_b64: &str,
) -> FerroResult<TeamBlobFile> {
    let key = key_from_b64(team_key_b64)?;
    let plain = serde_json::to_vec(payload)?;
    let (iv, data) = gcm_encrypt(&key, &plain)?;
    Ok(TeamBlobFile {
        app: "ferro".into(),
        kind: "ferro-team".into(),
        version: 1,
        team_id: payload.team_id.clone(),
        name: payload.name.clone(),
        updated_at: payload.updated_at.clone(),
        revision: payload.revision,
        cipher: "aes-256-gcm".into(),
        iv: b64(&iv),
        data: b64(&data),
    })
}

pub fn decrypt_team_payload(file: &TeamBlobFile, team_key_b64: &str) -> FerroResult<TeamPayload> {
    if file.kind != "ferro-team" || file.version != 1 || file.cipher != "aes-256-gcm" {
        return Err(FerroError::new(
            FerroErrorCode::Validation,
            "Tanınmayan ekip dosyası formatı",
        ));
    }
    let key = key_from_b64(team_key_b64)?;
    let plain = gcm_decrypt(&key, &unb64(&file.iv)?, &unb64(&file.data)?)?;
    let payload: TeamPayload = serde_json::from_slice(&plain).map_err(|e| {
        FerroError::with_detail(
            FerroErrorCode::Validation,
            "Ekip yükü çözümlenemedi",
            e.to_string(),
        )
    })?;
    if payload.kind != "ferro-team-payload" {
        return Err(FerroError::new(
            FerroErrorCode::Validation,
            "Ekip yükü türü uyuşmuyor",
        ));
    }
    Ok(payload)
}

// ── Davet (PIN ile) ──

pub fn encrypt_invite(
    payload: &TeamInvitePayload,
    pin: &str,
    team_id: &str,
    team_name: &str,
    role: &str,
) -> FerroResult<TeamInviteFile> {
    let salt = random_bytes(SALT_LEN);
    let key = derive_key(pin, &salt, KDF_N, KDF_R, KDF_P)?;
    let plain = serde_json::to_vec(payload)?;
    let (iv, data) = gcm_encrypt(&key, &plain)?;
    Ok(TeamInviteFile {
        app: "ferro".into(),
        kind: "ferro-invite".into(),
        version: 1,
        team_id: team_id.into(),
        team_name: team_name.into(),
        role: role.into(),
        kdf: InviteKdf {
            algo: "scrypt".into(),
            salt: b64(&salt),
            n: KDF_N,
            r: KDF_R,
            p: KDF_P,
        },
        cipher: "aes-256-gcm".into(),
        iv: b64(&iv),
        data: b64(&data),
    })
}

pub fn decrypt_invite(file: &TeamInviteFile, pin: &str) -> FerroResult<TeamInvitePayload> {
    if file.kind != "ferro-invite" || file.version != 1 || file.cipher != "aes-256-gcm" {
        return Err(FerroError::new(
            FerroErrorCode::Validation,
            "Tanınmayan davet formatı",
        ));
    }
    let salt = unb64(&file.kdf.salt)?;
    let key = derive_key(pin, &salt, file.kdf.n, file.kdf.r, file.kdf.p)?;
    let plain = gcm_decrypt(&key, &unb64(&file.iv)?, &unb64(&file.data)?)?;
    serde_json::from_slice(&plain).map_err(|e| {
        FerroError::with_detail(
            FerroErrorCode::Validation,
            "Davet yükü çözümlenemedi",
            e.to_string(),
        )
    })
}

// ── Davet kodu (taşınabilir string) ──

pub fn encode_invite_code(file: &TeamInviteFile) -> FerroResult<String> {
    let json = serde_json::to_vec(file)?;
    Ok(format!(
        "{INVITE_CODE_PREFIX}{}",
        URL_SAFE_NO_PAD.encode(json)
    ))
}

pub fn decode_invite_code(code: &str) -> FerroResult<TeamInviteFile> {
    let rest = code
        .strip_prefix(INVITE_CODE_PREFIX)
        .ok_or_else(|| FerroError::new(FerroErrorCode::Validation, "Geçersiz davet kodu öneki"))?;
    let bytes = URL_SAFE_NO_PAD
        .decode(rest.trim())
        .map_err(|_| FerroError::new(FerroErrorCode::Validation, "Davet kodu çözülemedi"))?;
    let file: TeamInviteFile = serde_json::from_slice(&bytes).map_err(|e| {
        FerroError::with_detail(
            FerroErrorCode::Validation,
            "Davet kodu biçimi geçersiz",
            e.to_string(),
        )
    })?;
    if file.app != "ferro" || file.kind != "ferro-invite" {
        return Err(FerroError::new(
            FerroErrorCode::Validation,
            "Tanınmayan davet kodu",
        ));
    }
    Ok(file)
}
