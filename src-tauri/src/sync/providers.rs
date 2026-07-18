//! Sync/Team uzak depo sağlayıcıları — `sync/providers.ts` karşılığı (reqwest, async).
//! Yalnızca şifreli blob taşınır. upload → (gist için) gistId döner; download → içerik.

use std::time::Duration;

use serde_json::json;

use crate::error::{FerroError, FerroErrorCode, FerroResult};

const GIST_API: &str = "https://api.github.com/gists";
const TIMEOUT: Duration = Duration::from_secs(30);

pub enum Provider {
    Gist { token: String, gist_id: String, file_name: String },
    Webdav { url: String, user: String, password: String, file_name: String },
}

fn client() -> FerroResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| FerroError::with_detail(FerroErrorCode::Unknown, "HTTP istemcisi kurulamadı", e.to_string()))
}

fn http_err(e: reqwest::Error, msg: &str) -> FerroError {
    let code = if e.is_timeout() { FerroErrorCode::Timeout } else { FerroErrorCode::ConnectionFailed };
    FerroError::with_detail(code, msg.to_string(), e.to_string())
}

impl Provider {
    /// İçeriği uzağa yazar. Gist için (yeni oluşturulduysa) gistId döner.
    pub async fn upload(&self, content: &str) -> FerroResult<Option<String>> {
        match self {
            Provider::Gist { token, gist_id, file_name } => {
                let c = client()?;
                let body = json!({
                    "description": "Ferro sync (encrypted)",
                    "public": false,
                    "files": { file_name: { "content": content } }
                });
                let req = if gist_id.is_empty() {
                    c.post(GIST_API)
                } else {
                    c.patch(format!("{GIST_API}/{gist_id}"))
                };
                let resp = req
                    .bearer_auth(token)
                    .header("Accept", "application/vnd.github+json")
                    .header("X-GitHub-Api-Version", "2022-11-28")
                    .header("User-Agent", "ferro-sync")
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| http_err(e, "Gist yüklenemedi"))?;
                check_status(resp.status(), !gist_id.is_empty())?;
                let created: serde_json::Value = resp.json().await.map_err(|e| http_err(e, "Gist yanıtı okunamadı"))?;
                Ok(created.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
            }
            Provider::Webdav { url, user, password, file_name } => {
                let c = client()?;
                let file_url = format!("{}/{}", url.trim_end_matches('/'), file_name);
                let put = |c: &reqwest::Client| {
                    let mut r = c.put(&file_url).header("Content-Type", "application/json").body(content.to_string());
                    if !user.is_empty() || !password.is_empty() {
                        r = r.basic_auth(user, Some(password));
                    }
                    r
                };
                let resp = put(&c).send().await.map_err(|e| http_err(e, "WebDAV PUT başarısız"))?;
                if resp.status().as_u16() == 409 {
                    // Koleksiyon yok — oluştur, sonra tekrar dene.
                    let mut mkcol = c.request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), url.trim_end_matches('/'));
                    if !user.is_empty() || !password.is_empty() {
                        mkcol = mkcol.basic_auth(user, Some(password));
                    }
                    let _ = mkcol.send().await;
                    let retry = put(&c).send().await.map_err(|e| http_err(e, "WebDAV PUT (retry) başarısız"))?;
                    check_status(retry.status(), false)?;
                } else {
                    check_status(resp.status(), false)?;
                }
                Ok(None)
            }
        }
    }

    /// Uzak içeriği indirir. Uzak kopya yoksa None.
    pub async fn download(&self) -> FerroResult<Option<String>> {
        match self {
            Provider::Gist { token, gist_id, file_name } => {
                if gist_id.is_empty() {
                    return Ok(None);
                }
                let c = client()?;
                let resp = c
                    .get(format!("{GIST_API}/{gist_id}"))
                    .bearer_auth(token)
                    .header("Accept", "application/vnd.github+json")
                    .header("X-GitHub-Api-Version", "2022-11-28")
                    .header("User-Agent", "ferro-sync")
                    .send()
                    .await
                    .map_err(|e| http_err(e, "Gist indirilemedi"))?;
                if resp.status().as_u16() == 404 {
                    return Ok(None);
                }
                check_status(resp.status(), true)?;
                let gist: serde_json::Value = resp.json().await.map_err(|e| http_err(e, "Gist yanıtı okunamadı"))?;
                let Some(file) = gist.get("files").and_then(|f| f.get(file_name)) else {
                    return Ok(None);
                };
                if file.get("truncated").and_then(|t| t.as_bool()).unwrap_or(false) {
                    if let Some(raw) = file.get("raw_url").and_then(|u| u.as_str()) {
                        let raw_resp = c
                            .get(raw)
                            .bearer_auth(token)
                            .header("User-Agent", "ferro-sync")
                            .send()
                            .await
                            .map_err(|e| http_err(e, "Gist ham içeriği indirilemedi"))?;
                        return Ok(Some(raw_resp.text().await.map_err(|e| http_err(e, "İçerik okunamadı"))?));
                    }
                }
                Ok(file.get("content").and_then(|v| v.as_str()).map(|s| s.to_string()))
            }
            Provider::Webdav { url, user, password, file_name } => {
                let c = client()?;
                let file_url = format!("{}/{}", url.trim_end_matches('/'), file_name);
                let mut r = c.get(&file_url);
                if !user.is_empty() || !password.is_empty() {
                    r = r.basic_auth(user, Some(password));
                }
                let resp = r.send().await.map_err(|e| http_err(e, "WebDAV GET başarısız"))?;
                if resp.status().as_u16() == 404 {
                    return Ok(None);
                }
                check_status(resp.status(), false)?;
                Ok(Some(resp.text().await.map_err(|e| http_err(e, "İçerik okunamadı"))?))
            }
        }
    }
}

fn check_status(status: reqwest::StatusCode, have_id: bool) -> FerroResult<()> {
    let code = status.as_u16();
    if status.is_success() {
        return Ok(());
    }
    if code == 401 || code == 403 {
        return Err(FerroError::new(FerroErrorCode::AuthFailed, "Depo kimlik doğrulaması başarısız (jeton/parola)"));
    }
    if code == 404 && have_id {
        return Err(FerroError::new(FerroErrorCode::NotFound, "Uzak kayıt bulunamadı"));
    }
    Err(FerroError::with_detail(FerroErrorCode::ConnectionFailed, "Depo isteği başarısız", format!("HTTP {code}")))
}
