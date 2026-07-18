//! SFTP istemcisi — `adapters/SftpAdapter.ts` karşılığı, russh + russh-sftp ile.
//!
//! Bağlantı kendi çok-thread'li tokio runtime'ını sahiplenir; bloklayan
//! `TransferClient` metotları içeride `block_on` yapar. Host anahtarı TOFU,
//! russh `check_server_key` içinde (renderer'a olay + karar beklemesi) doğrulanır.

use std::path::Path;
use std::sync::Arc;

use russh::client::{self, Handle};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileType, OpenFlags};
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::runtime::Runtime;

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::{ConnectionConfig, EntryType, ProxyType, RemoteEntry};

use super::client::{normalize_posix, resolve_posix, AdapterOptions, TransferClient, TransferCtx};
use super::proxy;
use super::tofu::Tofu;

const CHUNK: usize = 32 * 1024;

/// russh istemci handler'ı — yalnızca host anahtarı TOFU doğrulaması yapar.
struct ClientHandler {
    app: AppHandle,
    tofu: Arc<Tofu>,
    host: String,
    port: u16,
}

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // fingerprint() base64(sha256) döndürür — OpenSSH 'SHA256:...' biçimiyle uyumlu.
        let fp = format!("SHA256:{}", server_public_key.fingerprint());
        Ok(self.tofu.verify_host_key(&self.app, &self.host, self.port, &fp))
    }
}

pub struct SftpConnection {
    runtime: Runtime,
    _handle: Handle<ClientHandler>,
    sftp: SftpSession,
    cwd: String,
    connected: bool,
}

fn map_type(t: FileType) -> EntryType {
    match t {
        FileType::Dir => EntryType::Directory,
        FileType::File => EntryType::File,
        FileType::Symlink => EntryType::Symlink,
        FileType::Other => EntryType::Unknown,
    }
}

fn mtime_ms(mtime: Option<u32>) -> Option<i64> {
    mtime.map(|s| s as i64 * 1000)
}

/// russh-sftp/russh hatalarını FerroError'a sınıflandırır.
fn translate(e: impl std::fmt::Display, code: FerroErrorCode, message: &str) -> FerroError {
    let detail = e.to_string();
    let low = detail.to_lowercase();
    let mapped = if low.contains("no such file") || low.contains("not found") || low.contains("nosuchfile") {
        FerroErrorCode::NotFound
    } else if low.contains("permission") {
        FerroErrorCode::PermissionDenied
    } else if low.contains("auth") || low.contains("password") {
        FerroErrorCode::AuthFailed
    } else if low.contains("timeout") || low.contains("timed out") {
        FerroErrorCode::Timeout
    } else {
        code
    };
    FerroError::with_detail(mapped, message.to_string(), detail)
}

impl SftpConnection {
    pub fn connect(
        config: &ConnectionConfig,
        opts: &AdapterOptions,
        tofu: Arc<Tofu>,
        app: AppHandle,
    ) -> FerroResult<Self> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .map_err(|e| FerroError::with_detail(FerroErrorCode::Unknown, "runtime kurulamadı", e.to_string()))?;

        let host = config.host.clone();
        let port = config.port;
        let user = config.user.clone();
        let password = config.password.clone();
        let private_key = config.private_key.clone();
        let passphrase = config.passphrase.clone();
        let timeout = if opts.connect_timeout_ms == 0 { 30_000 } else { opts.connect_timeout_ms };
        let proxy = opts.proxy.clone().filter(proxy::is_active);

        let (handle, sftp, cwd) = runtime.block_on(async move {
            let mut cfg = client::Config::default();
            cfg.inactivity_timeout = Some(std::time::Duration::from_secs(0)); // keepalive ssh2 tarafı
            cfg.keepalive_interval = Some(std::time::Duration::from_secs(20));
            let cfg = Arc::new(cfg);
            let handler = ClientHandler { app, tofu, host: host.clone(), port };

            // Bağlantı zaman aşımı sarmalı (vekil varsa hedefe proxy üzerinden bağlan).
            let connect_fut = async {
                match &proxy {
                    Some(p) => match p.proxy_type {
                        ProxyType::Socks5 => {
                            let s = proxy::socks5(p, &host, port).await?;
                            client::connect_stream(cfg, s, handler).await.map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "SFTP (SOCKS5) bağlanamadı"))
                        }
                        ProxyType::Socks4 => {
                            let s = proxy::socks4(p, &host, port).await?;
                            client::connect_stream(cfg, s, handler).await.map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "SFTP (SOCKS4) bağlanamadı"))
                        }
                        ProxyType::Http => {
                            let s = proxy::http_connect(p, &host, port).await?;
                            client::connect_stream(cfg, s, handler).await.map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "SFTP (HTTP proxy) bağlanamadı"))
                        }
                        ProxyType::None => {
                            client::connect(cfg, (host.as_str(), port), handler).await.map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "SFTP bağlantısı kurulamadı"))
                        }
                    },
                    None => client::connect(cfg, (host.as_str(), port), handler).await.map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "SFTP bağlantısı kurulamadı")),
                }
            };
            let mut handle = tokio::time::timeout(
                std::time::Duration::from_millis(timeout),
                connect_fut,
            )
            .await
            .map_err(|_| FerroError::new(FerroErrorCode::Timeout, "SFTP bağlantı zaman aşımı"))??;

            // Kimlik doğrulama: önce özel anahtar, yoksa parola.
            let authed = if let Some(pem) = private_key.as_ref().filter(|k| !k.is_empty()) {
                let key = russh::keys::decode_secret_key(pem, passphrase.as_deref())
                    .map_err(|e| translate(e, FerroErrorCode::AuthFailed, "Özel anahtar çözülemedi"))?;
                handle
                    .authenticate_publickey(&user, Arc::new(key))
                    .await
                    .map_err(|e| translate(e, FerroErrorCode::AuthFailed, "Kimlik doğrulama başarısız"))?
            } else {
                handle
                    .authenticate_password(&user, password.clone().unwrap_or_default())
                    .await
                    .map_err(|e| translate(e, FerroErrorCode::AuthFailed, "Kimlik doğrulama başarısız"))?
            };
            if !authed {
                return Err(FerroError::new(FerroErrorCode::AuthFailed, "Kimlik doğrulama reddedildi"));
            }

            // SFTP alt sistemi.
            let channel = handle
                .channel_open_session()
                .await
                .map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "SFTP kanalı açılamadı"))?;
            channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "SFTP alt sistemi başlatılamadı"))?;
            let sftp = SftpSession::new(channel.into_stream())
                .await
                .map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "SFTP oturumu kurulamadı"))?;

            let cwd = sftp.canonicalize(".").await.unwrap_or_else(|_| "/".to_string());
            Ok::<_, FerroError>((handle, sftp, cwd))
        })?;

        Ok(Self { runtime, _handle: handle, sftp, cwd, connected: true })
    }

    fn resolve(&self, path: &str) -> String {
        resolve_posix(&self.cwd, path)
    }
}

impl TransferClient for SftpConnection {
    fn connected(&self) -> bool {
        self.connected
    }

    fn pwd(&mut self) -> FerroResult<String> {
        Ok(self.cwd.clone())
    }

    fn cwd(&mut self, path: &str) -> FerroResult<String> {
        let target = self.resolve(path);
        let meta = self
            .runtime
            .block_on(self.sftp.metadata(target.clone()))
            .map_err(|e| translate(e, FerroErrorCode::FsError, "Dizin bulunamadı"))?;
        if !meta.is_dir() {
            return Err(FerroError::new(FerroErrorCode::FsError, format!("Dizin değil: {target}")));
        }
        self.cwd = target.clone();
        Ok(target)
    }

    fn list(&mut self, path: Option<&str>) -> FerroResult<Vec<RemoteEntry>> {
        let target = self.resolve(path.unwrap_or(&self.cwd.clone()));
        let dir = self
            .runtime
            .block_on(self.sftp.read_dir(target))
            .map_err(|e| translate(e, FerroErrorCode::FsError, "Dizin listelenemedi"))?;
        let mut out = Vec::new();
        for entry in dir {
            let meta = entry.metadata();
            out.push(RemoteEntry {
                name: entry.file_name(),
                entry_type: map_type(entry.file_type()),
                size: meta.size.unwrap_or(0),
                modified_at: mtime_ms(meta.mtime),
                permissions: meta.permissions.map(|p| p & 0o777),
                owner: meta.uid.map(|u| u.to_string()),
                group: meta.gid.map(|g| g.to_string()),
                link_target: None,
            });
        }
        Ok(out)
    }

    fn stat(&mut self, path: &str) -> FerroResult<RemoteEntry> {
        let target = self.resolve(path);
        let meta = self
            .runtime
            .block_on(self.sftp.metadata(target.clone()))
            .map_err(|e| translate(e, FerroErrorCode::FsError, "Bilgi alınamadı"))?;
        let entry_type = if meta.is_dir() {
            EntryType::Directory
        } else if meta.is_symlink() {
            EntryType::Symlink
        } else {
            EntryType::File
        };
        Ok(RemoteEntry {
            name: normalize_posix(&target).rsplit('/').next().unwrap_or("").to_string(),
            entry_type,
            size: meta.size.unwrap_or(0),
            modified_at: mtime_ms(meta.mtime),
            permissions: meta.permissions.map(|p| p & 0o777),
            owner: meta.uid.map(|u| u.to_string()),
            group: meta.gid.map(|g| g.to_string()),
            link_target: None,
        })
    }

    fn download(&mut self, remote_path: &str, dest: &Path, ctx: &mut TransferCtx) -> FerroResult<()> {
        let target = self.resolve(remote_path);
        let start_at = ctx.start_at;
        let dest = dest.to_path_buf();
        // total (progress için).
        let total = self
            .runtime
            .block_on(self.sftp.metadata(target.clone()))
            .ok()
            .and_then(|m| m.size);
        let sftp = &self.sftp;
        self.runtime.block_on(async {
            let mut remote = sftp
                .open(target.clone())
                .await
                .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Uzak dosya açılamadı"))?;
            if start_at > 0 {
                remote
                    .seek(std::io::SeekFrom::Start(start_at))
                    .await
                    .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Offset ayarlanamadı"))?;
            }
            let mut local = if start_at > 0 {
                tokio::fs::OpenOptions::new().create(true).append(true).open(&dest).await?
            } else {
                tokio::fs::File::create(&dest).await?
            };
            let mut buf = vec![0u8; CHUNK];
            let mut done = start_at;
            loop {
                if ctx.is_cancelled() {
                    return Err(FerroError::new(FerroErrorCode::Cancelled, "İndirme iptal edildi"));
                }
                let n = remote
                    .read(&mut buf)
                    .await
                    .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "İndirme başarısız"))?;
                if n == 0 {
                    break;
                }
                local.write_all(&buf[..n]).await?;
                done += n as u64;
                (ctx.on_progress)(done, total);
                ctx.pace(n);
            }
            local.flush().await?;
            Ok::<(), FerroError>(())
        })
    }

    fn upload(&mut self, source: &Path, remote_path: &str, ctx: &mut TransferCtx) -> FerroResult<()> {
        let target = self.resolve(remote_path);
        let start_at = ctx.start_at;
        let source = source.to_path_buf();
        let sftp = &self.sftp;
        self.runtime.block_on(async {
            let mut local = tokio::fs::File::open(&source).await?;
            let total = local.metadata().await.ok().map(|m| m.len());
            if start_at > 0 {
                local.seek(std::io::SeekFrom::Start(start_at)).await?;
            }
            let flags = if start_at > 0 {
                OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::APPEND
            } else {
                OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE
            };
            let mut remote = sftp
                .open_with_flags(target.clone(), flags)
                .await
                .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Uzak dosya açılamadı"))?;
            let mut buf = vec![0u8; CHUNK];
            let mut done = start_at;
            loop {
                if ctx.is_cancelled() {
                    return Err(FerroError::new(FerroErrorCode::Cancelled, "Yükleme iptal edildi"));
                }
                let n = local.read(&mut buf).await?;
                if n == 0 {
                    break;
                }
                remote
                    .write_all(&buf[..n])
                    .await
                    .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Yükleme başarısız"))?;
                done += n as u64;
                (ctx.on_progress)(done, total);
                ctx.pace(n);
            }
            remote
                .flush()
                .await
                .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Yükleme tamamlanamadı"))?;
            remote
                .shutdown()
                .await
                .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Uzak dosya kapatılamadı"))?;
            Ok::<(), FerroError>(())
        })
    }

    fn delete(&mut self, path: &str) -> FerroResult<()> {
        let target = self.resolve(path);
        self.runtime
            .block_on(self.sftp.remove_file(target))
            .map_err(|e| translate(e, FerroErrorCode::FsError, "Dosya silinemedi"))
    }

    fn rename(&mut self, from: &str, to: &str) -> FerroResult<()> {
        let (a, b) = (self.resolve(from), self.resolve(to));
        self.runtime
            .block_on(self.sftp.rename(a, b))
            .map_err(|e| translate(e, FerroErrorCode::FsError, "Yeniden adlandırılamadı"))
    }

    fn mkdir(&mut self, path: &str) -> FerroResult<()> {
        let target = self.resolve(path);
        self.runtime
            .block_on(self.sftp.create_dir(target))
            .map_err(|e| translate(e, FerroErrorCode::FsError, "Dizin oluşturulamadı"))
    }

    fn rmdir(&mut self, path: &str) -> FerroResult<()> {
        let target = self.resolve(path);
        self.runtime
            .block_on(self.sftp.remove_dir(target))
            .map_err(|e| translate(e, FerroErrorCode::FsError, "Dizin silinemedi"))
    }

    fn chmod(&mut self, path: &str, mode: u32) -> FerroResult<()> {
        let target = self.resolve(path);
        let mut meta = russh_sftp::protocol::FileAttributes::default();
        meta.permissions = Some(mode & 0o777);
        self.runtime
            .block_on(self.sftp.set_metadata(target, meta))
            .map_err(|e| translate(e, FerroErrorCode::FsError, "İzin değiştirilemedi"))
    }

    fn disconnect(&mut self) {
        self.connected = false;
        // Handle + runtime drop olduğunda SSH oturumu kapanır.
    }
}
