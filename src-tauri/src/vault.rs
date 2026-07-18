//! Kimlik bilgisi şifreleme — `src/main/store/vault.ts` karşılığı, iki mod:
//!  • `os`     : OS keychain (keyring). Rust'ta rastgele bir veri anahtarı keychain'de
//!               tutulur; sırlar AES-256-GCM ile şifrelenir — önek `k1:`.
//!  • `master` : Kullanıcı ana parolası; scrypt(N=16384,r=8,p=1) + AES-256-GCM — önek
//!               `m1:`. Bu format mevcut şifreli verilerle BYTE-UYUMLUDUR (iv‖tag‖ct, base64).
//!
//! Yalnızca okunur geri uyumluluk:
//!  • `p0:` base64 düz metin (demo seed) — çözülür.
//!  • `v1:` eski OS anahtar zinciri (safeStorage) — Rust ÇÖZEMEZ; boş string döner (parola yeniden girilir).

use std::path::PathBuf;
use std::sync::Mutex;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::store::json_store::{read_versioned, write_versioned, ReadOutcome};

const VAULT_META_VERSION: u32 = 1;
const SCRYPT_LOG_N: u8 = 14; // N = 16384
const SCRYPT_R: u32 = 8;
const SCRYPT_P: u32 = 1;
const KEY_LEN: usize = 32;
const IV_LEN: usize = 12;
const TAG_LEN: usize = 16;
const VERIFY_PLAINTEXT: &[u8] = b"ferro-vault-verify-v1";
const KEYRING_SERVICE: &str = "com.ferro.app";
const KEYRING_ACCOUNT: &str = "vault-data-key";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MasterParams {
    /// scrypt tuzu (base64).
    salt: String,
    /// Doğrulayıcı: VERIFY_PLAINTEXT'in şifreli hâli (base64 iv‖tag‖ct).
    verifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VaultMeta {
    mode: String, // "os" | "master"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    master: Option<MasterParams>,
}

impl Default for VaultMeta {
    fn default() -> Self {
        Self { mode: "os".into(), master: None }
    }
}

struct VaultState {
    meta: VaultMeta,
    /// Master modda kilit açıkken bellekteki türetilmiş anahtar.
    master_key: Option<[u8; KEY_LEN]>,
    /// OS modu veri anahtarı önbelleği (keyring'den bir kez okunur).
    os_key: Option<[u8; KEY_LEN]>,
}

pub struct Vault {
    file: PathBuf,
    state: Mutex<VaultState>,
}

// ── scrypt + AES-256-GCM yardımcıları ──────────────────────────────────────

fn scrypt_key(password: &str, salt: &[u8]) -> FerroResult<[u8; KEY_LEN]> {
    let params = scrypt::Params::new(SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, KEY_LEN)
        .map_err(|e| FerroError::with_detail(FerroErrorCode::Unknown, "scrypt parametresi", e.to_string()))?;
    let mut out = [0u8; KEY_LEN];
    scrypt::scrypt(password.as_bytes(), salt, &params, &mut out)
        .map_err(|e| FerroError::with_detail(FerroErrorCode::Unknown, "anahtar türetilemedi", e.to_string()))?;
    Ok(out)
}

/// Vault düzeni: base64(iv[12] ‖ tag[16] ‖ ct). aes-gcm çıktısı ct‖tag
/// olduğundan tag başa alınır.
fn aes_encrypt(key: &[u8; KEY_LEN], plain: &[u8]) -> FerroResult<String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut iv = [0u8; IV_LEN];
    rand::thread_rng().fill_bytes(&mut iv);
    let ct_tag = cipher
        .encrypt(Nonce::from_slice(&iv), plain)
        .map_err(|_| FerroError::new(FerroErrorCode::Unknown, "şifreleme başarısız"))?;
    let (ct, tag) = ct_tag.split_at(ct_tag.len() - TAG_LEN);
    let mut out = Vec::with_capacity(IV_LEN + TAG_LEN + ct.len());
    out.extend_from_slice(&iv);
    out.extend_from_slice(tag);
    out.extend_from_slice(ct);
    Ok(B64.encode(out))
}

fn aes_decrypt(key: &[u8; KEY_LEN], blob: &str) -> FerroResult<Vec<u8>> {
    let buf = B64
        .decode(blob)
        .map_err(|_| FerroError::new(FerroErrorCode::AuthFailed, "geçersiz base64"))?;
    if buf.len() < IV_LEN + TAG_LEN {
        return Err(FerroError::new(FerroErrorCode::AuthFailed, "şifreli veri eksik"));
    }
    let iv = &buf[..IV_LEN];
    let tag = &buf[IV_LEN..IV_LEN + TAG_LEN];
    let ct = &buf[IV_LEN + TAG_LEN..];
    // aes-gcm ct‖tag bekler.
    let mut ct_tag = Vec::with_capacity(ct.len() + TAG_LEN);
    ct_tag.extend_from_slice(ct);
    ct_tag.extend_from_slice(tag);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(iv), ct_tag.as_ref())
        .map_err(|_| FerroError::new(FerroErrorCode::AuthFailed, "şifre çözülemedi (yanlış parola?)"))
}

impl Vault {
    pub fn new(config_dir: &std::path::Path) -> Self {
        let file = config_dir.join("vault.json");
        let meta = match read_versioned::<VaultMeta, _>(&file, VAULT_META_VERSION, |_| None) {
            ReadOutcome::Loaded(m) => m,
            _ => VaultMeta::default(),
        };
        Self {
            file,
            state: Mutex::new(VaultState { meta, master_key: None, os_key: None }),
        }
    }

    fn save(&self, meta: &VaultMeta) {
        if let Err(e) = write_versioned(&self.file, VAULT_META_VERSION, meta) {
            eprintln!("[ferro] vault.json yazılamadı: {e}");
        }
    }

    /// OS modu veri anahtarını keychain'den okur; yoksa üretip saklar.
    fn os_data_key(&self, st: &mut VaultState) -> Option<[u8; KEY_LEN]> {
        if let Some(k) = st.os_key {
            return Some(k);
        }
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).ok()?;
        let key = match entry.get_password() {
            Ok(b64) => {
                let bytes = B64.decode(b64).ok()?;
                if bytes.len() != KEY_LEN {
                    return None;
                }
                let mut k = [0u8; KEY_LEN];
                k.copy_from_slice(&bytes);
                k
            }
            Err(keyring::Error::NoEntry) => {
                let mut k = [0u8; KEY_LEN];
                rand::thread_rng().fill_bytes(&mut k);
                entry.set_password(&B64.encode(k)).ok()?;
                k
            }
            Err(_) => return None,
        };
        st.os_key = Some(key);
        Some(key)
    }

    // ── Durum ──

    pub fn os_encryption_available(&self) -> bool {
        // keyring erişilebiliyor mu (veri anahtarı okunabiliyor/üretilebiliyor mu)?
        let mut st = self.state.lock().unwrap();
        self.os_data_key(&mut st).is_some()
    }

    pub fn mode(&self) -> String {
        self.state.lock().unwrap().meta.mode.clone()
    }

    pub fn has_master(&self) -> bool {
        self.state.lock().unwrap().meta.master.is_some()
    }

    pub fn is_locked(&self) -> bool {
        let st = self.state.lock().unwrap();
        st.meta.mode == "master" && st.master_key.is_none()
    }

    /// Renderer'a "parola saklanabilir mi": master ayarlıysa ya da OS keychain varsa.
    pub fn encryption_available(&self) -> bool {
        self.mode() == "master" || self.os_encryption_available()
    }

    // ── Şifrele / çöz ──

    pub fn encrypt_secret(&self, plain: &str) -> Option<String> {
        let mut st = self.state.lock().unwrap();
        if st.meta.mode == "master" {
            let key = st.master_key?;
            return aes_encrypt(&key, plain.as_bytes()).ok().map(|b| format!("m1:{b}"));
        }
        let key = self.os_data_key(&mut st)?;
        aes_encrypt(&key, plain.as_bytes()).ok().map(|b| format!("k1:{b}"))
    }

    pub fn decrypt_secret(&self, stored: &str) -> String {
        let mut st = self.state.lock().unwrap();
        let result = if let Some(rest) = stored.strip_prefix("m1:") {
            match st.master_key {
                Some(key) => aes_decrypt(&key, rest).ok(),
                None => None, // kilitli — çağıran parolayı sorar
            }
        } else if let Some(rest) = stored.strip_prefix("k1:") {
            self.os_data_key(&mut st).and_then(|key| aes_decrypt(&key, rest).ok())
        } else if let Some(rest) = stored.strip_prefix("p0:") {
            B64.decode(rest).ok()
        } else {
            // v1: (eski OS anahtar zinciri) çözülemez.
            None
        };
        result.and_then(|b| String::from_utf8(b).ok()).unwrap_or_default()
    }

    // ── Master parola yönetimi ──

    pub fn verify_master(&self, password: &str) -> bool {
        let st = self.state.lock().unwrap();
        let Some(m) = &st.meta.master else { return false };
        let Ok(salt) = B64.decode(&m.salt) else { return false };
        let Ok(key) = scrypt_key(password, &salt) else { return false };
        match aes_decrypt(&key, &m.verifier) {
            Ok(pt) => pt == VERIFY_PLAINTEXT,
            Err(_) => false,
        }
    }

    pub fn unlock(&self, password: &str) -> bool {
        if !self.verify_master(password) {
            return false;
        }
        let mut st = self.state.lock().unwrap();
        let Some(m) = &st.meta.master else { return false };
        let Ok(salt) = B64.decode(&m.salt) else { return false };
        let Ok(key) = scrypt_key(password, &salt) else { return false };
        st.master_key = Some(key);
        true
    }

    /// Master parolayı ayarlar/değiştirir. Çağıran (handler) mevcut sırları önce
    /// çözüp sonra yeniden şifrelemekten sorumludur (transitionSecrets deseni).
    pub fn set_master(&self, current: Option<&str>, next: &str) -> FerroResult<()> {
        {
            let st = self.state.lock().unwrap();
            if st.meta.master.is_some() {
                drop(st);
                let ok = current.map(|c| self.verify_master(c)).unwrap_or(false);
                if !ok {
                    return Err(FerroError::new(FerroErrorCode::AuthFailed, "Mevcut master parola hatalı"));
                }
            }
        }
        let mut salt = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut salt);
        let key = scrypt_key(next, &salt)?;
        let verifier = aes_encrypt(&key, VERIFY_PLAINTEXT)?;
        let mut st = self.state.lock().unwrap();
        st.meta.mode = "master".into();
        st.meta.master = Some(MasterParams { salt: B64.encode(salt), verifier });
        st.master_key = Some(key);
        let meta = st.meta.clone();
        drop(st);
        self.save(&meta);
        Ok(())
    }

    /// OS keychain moduna döner (master parolayı kaldırır). Mevcut parola gerekir.
    pub fn disable_master(&self, current: &str) -> FerroResult<()> {
        {
            let st = self.state.lock().unwrap();
            if st.meta.master.is_none() {
                return Ok(());
            }
        }
        if !self.verify_master(current) {
            return Err(FerroError::new(FerroErrorCode::AuthFailed, "Master parola hatalı"));
        }
        let mut st = self.state.lock().unwrap();
        st.meta.mode = "os".into();
        st.meta.master = None;
        st.master_key = None;
        let meta = st.meta.clone();
        drop(st);
        self.save(&meta);
        Ok(())
    }
}
