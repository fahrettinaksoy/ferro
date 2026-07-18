//! Sync + Team için paylaşılan kripto primitifleri — `sync/crypto.ts` & `team/crypto.ts`.
//!
//! DİKKAT — düzen vault'tan FARKLIDIR: burada `data = ct ‖ tag` (tag SONA eklenir)
//! ve `iv` ayrı bir zarf alanıdır. (Vault ise `iv ‖ tag ‖ ct`.) Mevcut şifreli
//! byte-uyumluluk için birebir korunur. KDF: scrypt(N,r,p) + AES-256-GCM.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::RngCore;

use crate::error::{FerroError, FerroErrorCode, FerroResult};

pub const KEY_LEN: usize = 32;
pub const IV_LEN: usize = 12;
pub const TAG_LEN: usize = 16;
pub const SALT_LEN: usize = 16;

/// Varsayılan KDF parametreleri (etkileşimli kullanım).
pub const KDF_N: u32 = 16_384;
pub const KDF_R: u32 = 8;
pub const KDF_P: u32 = 1;

/// Güvensiz dosyalardan gelen KDF parametrelerini sınırlar (bellek bombası koruması).
pub fn validate_kdf(n: u32, r: u32, p: u32) -> FerroResult<u8> {
    if n > (1 << 20) || r > 16 || p > 4 || !n.is_power_of_two() || n < 2 {
        return Err(FerroError::new(
            FerroErrorCode::Validation,
            "Desteklenmeyen KDF parametreleri",
        ));
    }
    Ok(n.trailing_zeros() as u8)
}

/// scrypt anahtar türetimi (32 bayt).
pub fn derive_key(
    password: &str,
    salt: &[u8],
    n: u32,
    r: u32,
    p: u32,
) -> FerroResult<[u8; KEY_LEN]> {
    let log_n = validate_kdf(n, r, p)?;
    let params = scrypt::Params::new(log_n, r, p, KEY_LEN).map_err(|e| {
        FerroError::with_detail(FerroErrorCode::Unknown, "scrypt parametresi", e.to_string())
    })?;
    let mut out = [0u8; KEY_LEN];
    scrypt::scrypt(password.as_bytes(), salt, &params, &mut out).map_err(|e| {
        FerroError::with_detail(
            FerroErrorCode::Unknown,
            "anahtar türetilemedi",
            e.to_string(),
        )
    })?;
    Ok(out)
}

/// Rastgele bayt üretir.
pub fn random_bytes(len: usize) -> Vec<u8> {
    let mut v = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut v);
    v
}

/// AES-256-GCM şifreler → (iv, data) burada `data = ct ‖ tag`.
pub fn gcm_encrypt(key: &[u8; KEY_LEN], plain: &[u8]) -> FerroResult<(Vec<u8>, Vec<u8>)> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut iv = [0u8; IV_LEN];
    rand::thread_rng().fill_bytes(&mut iv);
    // aes-gcm çıktısı zaten ct ‖ tag biçimindedir — düzen doğrudan uyumlu.
    let data = cipher
        .encrypt(Nonce::from_slice(&iv), plain)
        .map_err(|_| FerroError::new(FerroErrorCode::Unknown, "şifreleme başarısız"))?;
    Ok((iv.to_vec(), data))
}

/// AES-256-GCM çözer (`data = ct ‖ tag`). Yanlış anahtar → AUTH_FAILED.
pub fn gcm_decrypt(key: &[u8; KEY_LEN], iv: &[u8], data: &[u8]) -> FerroResult<Vec<u8>> {
    if iv.len() != IV_LEN || data.len() < TAG_LEN {
        return Err(FerroError::new(
            FerroErrorCode::Validation,
            "Şifreli veri eksik/bozuk",
        ));
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher.decrypt(Nonce::from_slice(iv), data).map_err(|_| {
        FerroError::new(
            FerroErrorCode::AuthFailed,
            "Parola hatalı ya da veri bozulmuş",
        )
    })
}

// Base64 yardımcıları (zarf alanları için).
pub fn b64(bytes: &[u8]) -> String {
    B64.encode(bytes)
}
pub fn unb64(s: &str) -> FerroResult<Vec<u8>> {
    B64.decode(s)
        .map_err(|_| FerroError::new(FerroErrorCode::Validation, "Geçersiz base64"))
}
pub fn key_from_b64(s: &str) -> FerroResult<[u8; KEY_LEN]> {
    let bytes = unb64(s)?;
    if bytes.len() != KEY_LEN {
        return Err(FerroError::new(
            FerroErrorCode::Validation,
            "Anahtar 32 bayt olmalı",
        ));
    }
    let mut k = [0u8; KEY_LEN];
    k.copy_from_slice(&bytes);
    Ok(k)
}
