//! FTP / FTPS istemcisi — `adapters/FtpAdapter.ts` karşılığı (suppaftp, senkron, pasif mod).
//!
//! FTPS TOFU: rustls özel `ServerCertVerifier` sertifika parmak izini (SHA-256)
//! hesaplar ve `Tofu`'ya danışır (pinleme + kullanıcı onayı). İmza doğrulaması
//! ring sağlayıcısına devredilir — pinlenen sertifikanın özel anahtar sahipliği
//! yine doğrulanır (MITM koruması).

use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use suppaftp::list::File as FtpFile;
use suppaftp::rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use suppaftp::rustls::crypto::{ring, verify_tls12_signature, verify_tls13_signature, WebPkiSupportedAlgorithms};
use suppaftp::rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use suppaftp::rustls::{ClientConfig, DigitallySignedStruct, Error as RustlsError, SignatureScheme};
use suppaftp::types::FileType as FtpFileType;
use suppaftp::{RustlsConnector, RustlsFtpStream};
use tauri::AppHandle;

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::{ConnectionConfig, EntryType, Protocol, RemoteEntry, TransferTypeConfig};

use super::client::{is_ascii_transfer, AdapterOptions, TransferClient, TransferCtx};
use super::tofu::Tofu;

const CHUNK: usize = 32 * 1024;

/// FTPS için TOFU sertifika doğrulayıcı — parmak izi pinleme + kullanıcı onayı.
struct TofuVerifier {
    app: AppHandle,
    tofu: Arc<Tofu>,
    host: String,
    port: u16,
    algs: WebPkiSupportedAlgorithms,
}

impl std::fmt::Debug for TofuVerifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "TofuVerifier({}:{})", self.host, self.port)
    }
}

/// Sertifika DER'inden SHA-256 parmak izi (AA:BB:.. onaltılık biçim).
fn cert_fingerprint(der: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(der);
    digest.iter().map(|b| format!("{b:02X}")).collect::<Vec<_>>().join(":")
}

impl ServerCertVerifier for TofuVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        let fp = cert_fingerprint(end_entity.as_ref());
        let ok = self.tofu.verify_cert(
            &self.app,
            &self.host,
            self.port,
            "TLS sertifikası sistem kök sertifikalarıyla doğrulanamadı",
            Some(&fp),
        );
        if ok {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(RustlsError::General("Sertifika kullanıcı tarafından reddedildi".into()))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls12_signature(message, cert, dss, &self.algs)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls13_signature(message, cert, dss, &self.algs)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.algs.supported_schemes()
    }
}

/// TOFU doğrulayıcılı rustls bağlayıcısı üretir.
fn tofu_connector(app: &AppHandle, tofu: Arc<Tofu>, host: &str, port: u16) -> RustlsConnector {
    let provider = ring::default_provider();
    let algs = provider.signature_verification_algorithms;
    let verifier = Arc::new(TofuVerifier { app: app.clone(), tofu, host: host.to_string(), port, algs });
    let config = ClientConfig::builder_with_provider(Arc::new(provider))
        .with_safe_default_protocol_versions()
        .expect("rustls protokol sürümleri")
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();
    RustlsConnector::from(Arc::new(config))
}

pub struct FtpConnection {
    stream: RustlsFtpStream,
    connected: bool,
    transfer_type: TransferTypeConfig,
}

impl FtpConnection {
    /// Bir sonraki transfer için TYPE (A/I) ayarlar (ASCII kurallarına göre).
    fn set_type(&mut self, name: &str) {
        let ft = if is_ascii_transfer(name, &self.transfer_type) {
            FtpFileType::Ascii(suppaftp::types::FormatControl::Default)
        } else {
            FtpFileType::Binary
        };
        let _ = self.stream.transfer_type(ft);
    }
}

fn map_entry(f: &FtpFile) -> RemoteEntry {
    let entry_type = if f.is_directory() {
        EntryType::Directory
    } else if f.is_symlink() {
        EntryType::Symlink
    } else {
        EntryType::File
    };
    let modified_at = f
        .modified()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64);
    RemoteEntry {
        name: f.name().to_string(),
        entry_type,
        size: f.size() as u64,
        modified_at,
        permissions: None,
        owner: None,
        group: None,
        link_target: None,
    }
}

fn translate(e: impl std::fmt::Display, code: FerroErrorCode, message: &str) -> FerroError {
    let detail = e.to_string();
    let low = detail.to_lowercase();
    let mapped = if detail.contains("550") || low.contains("not found") || low.contains("no such") {
        FerroErrorCode::NotFound
    } else if detail.contains("530") || detail.contains("331") || detail.contains("332") || low.contains("login") {
        FerroErrorCode::AuthFailed
    } else if detail.contains("553") || detail.contains("532") || low.contains("permission") {
        FerroErrorCode::PermissionDenied
    } else if detail.contains("421") {
        FerroErrorCode::ConnectionFailed
    } else if low.contains("timeout") || low.contains("timed out") {
        FerroErrorCode::Timeout
    } else {
        code
    };
    FerroError::with_detail(mapped, message.to_string(), detail)
}

impl FtpConnection {
    pub fn connect(
        config: &ConnectionConfig,
        opts: &AdapterOptions,
        tofu: Arc<Tofu>,
        app: AppHandle,
    ) -> FerroResult<Self> {
        let addr = format!("{}:{}", config.host, config.port);
        let (user, pass) = if config.anonymous.unwrap_or(false) {
            ("anonymous".to_string(), config.password.clone().unwrap_or_else(|| "anonymous@".into()))
        } else {
            (config.user.clone(), config.password.clone().unwrap_or_default())
        };

        let mut stream = match config.protocol {
            Protocol::FtpsImplicit => {
                // Implicit FTPS: bağlantı anında TLS.
                let connector = tofu_connector(&app, tofu, &config.host, config.port);
                RustlsFtpStream::connect_secure_implicit(&addr, connector, &config.host)
                    .map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "Implicit FTPS bağlanamadı"))?
            }
            Protocol::Ftps => {
                // Explicit FTPS: önce düz, sonra AUTH TLS (kimlik bilgisi TLS sonrası gider).
                let plain = RustlsFtpStream::connect(&addr)
                    .map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "FTP bağlanamadı"))?;
                let connector = tofu_connector(&app, tofu, &config.host, config.port);
                plain
                    .into_secure(connector, &config.host)
                    .map_err(|e| translate(e, FerroErrorCode::TlsUntrusted, "TLS el sıkışması başarısız / reddedildi"))?
            }
            _ => {
                // Düz FTP.
                RustlsFtpStream::connect(&addr)
                    .map_err(|e| translate(e, FerroErrorCode::ConnectionFailed, "FTP bağlanamadı"))?
            }
        };

        stream
            .login(&user, &pass)
            .map_err(|e| translate(e, FerroErrorCode::AuthFailed, "Kimlik doğrulama başarısız"))?;

        Ok(Self { stream, connected: true, transfer_type: opts.transfer_type.clone() })
    }
}

impl TransferClient for FtpConnection {
    fn connected(&self) -> bool {
        self.connected
    }

    fn pwd(&mut self) -> FerroResult<String> {
        self.stream.pwd().map_err(|e| translate(e, FerroErrorCode::FsError, "PWD başarısız"))
    }

    fn cwd(&mut self, path: &str) -> FerroResult<String> {
        self.stream.cwd(path).map_err(|e| translate(e, FerroErrorCode::FsError, "CWD başarısız"))?;
        self.pwd()
    }

    fn list(&mut self, path: Option<&str>) -> FerroResult<Vec<RemoteEntry>> {
        let lines = self
            .stream
            .list(path)
            .map_err(|e| translate(e, FerroErrorCode::FsError, "Dizin listelenemedi"))?;
        Ok(lines
            .iter()
            .filter_map(|l| FtpFile::from_str(l).ok())
            .map(|f| map_entry(&f))
            .collect())
    }

    fn stat(&mut self, path: &str) -> FerroResult<RemoteEntry> {
        // FTP'de stat yok — üst dizini listeleyip eşleşeni bul.
        let (dir, base) = match path.rsplit_once('/') {
            Some((d, b)) => (if d.is_empty() { "/" } else { d }, b),
            None => (".", path),
        };
        let entries = self.list(Some(dir))?;
        entries
            .into_iter()
            .find(|e| e.name == base)
            .ok_or_else(|| FerroError::new(FerroErrorCode::NotFound, format!("Bulunamadı: {path}")))
    }

    fn download(&mut self, remote_path: &str, dest: &Path, ctx: &mut TransferCtx) -> FerroResult<()> {
        let total = self.stream.size(remote_path).ok().map(|s| s as u64);
        self.set_type(remote_path);
        if ctx.start_at > 0 {
            self.stream
                .resume_transfer(ctx.start_at as usize)
                .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Resume başarısız"))?;
        }
        let mut data = self
            .stream
            .retr_as_stream(remote_path)
            .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "İndirme başlatılamadı"))?;
        let mut local = if ctx.start_at > 0 {
            std::fs::OpenOptions::new().create(true).append(true).open(dest)?
        } else {
            std::fs::File::create(dest)?
        };
        let mut buf = vec![0u8; CHUNK];
        let mut done = ctx.start_at;
        loop {
            if ctx.is_cancelled() {
                self.connected = false; // veri kanalı yarıda — bağlantı atılmalı
                return Err(FerroError::new(FerroErrorCode::Cancelled, "İndirme iptal edildi"));
            }
            let n = data.read(&mut buf).map_err(|e| translate(e, FerroErrorCode::TransferFailed, "İndirme hatası"))?;
            if n == 0 {
                break;
            }
            local.write_all(&buf[..n])?;
            done += n as u64;
            (ctx.on_progress)(done, total);
            ctx.pace(n);
        }
        local.flush()?;
        self.stream
            .finalize_retr_stream(data)
            .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "İndirme tamamlanamadı"))
    }

    fn upload(&mut self, source: &Path, remote_path: &str, ctx: &mut TransferCtx) -> FerroResult<()> {
        let mut local = std::fs::File::open(source)?;
        let total = local.metadata().ok().map(|m| m.len());
        self.set_type(remote_path);
        if ctx.start_at > 0 {
            local.seek(SeekFrom::Start(ctx.start_at))?;
        }
        let mut data = if ctx.start_at > 0 {
            self.stream
                .append_with_stream(remote_path)
                .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Yükleme (append) başlatılamadı"))?
        } else {
            self.stream
                .put_with_stream(remote_path)
                .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Yükleme başlatılamadı"))?
        };
        let mut buf = vec![0u8; CHUNK];
        let mut done = ctx.start_at;
        loop {
            if ctx.is_cancelled() {
                self.connected = false;
                return Err(FerroError::new(FerroErrorCode::Cancelled, "Yükleme iptal edildi"));
            }
            let n = local.read(&mut buf)?;
            if n == 0 {
                break;
            }
            data.write_all(&buf[..n]).map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Yükleme hatası"))?;
            done += n as u64;
            (ctx.on_progress)(done, total);
            ctx.pace(n);
        }
        self.stream
            .finalize_put_stream(data)
            .map_err(|e| translate(e, FerroErrorCode::TransferFailed, "Yükleme tamamlanamadı"))
    }

    fn delete(&mut self, path: &str) -> FerroResult<()> {
        self.stream.rm(path).map_err(|e| translate(e, FerroErrorCode::FsError, "Dosya silinemedi"))
    }

    fn rename(&mut self, from: &str, to: &str) -> FerroResult<()> {
        self.stream.rename(from, to).map_err(|e| translate(e, FerroErrorCode::FsError, "Yeniden adlandırılamadı"))
    }

    fn mkdir(&mut self, path: &str) -> FerroResult<()> {
        self.stream.mkdir(path).map_err(|e| translate(e, FerroErrorCode::FsError, "Dizin oluşturulamadı"))
    }

    fn rmdir(&mut self, path: &str) -> FerroResult<()> {
        self.stream.rmdir(path).map_err(|e| translate(e, FerroErrorCode::FsError, "Dizin silinemedi"))
    }

    fn chmod(&mut self, path: &str, mode: u32) -> FerroResult<()> {
        self.stream
            .site(format!("CHMOD {:03o} {}", mode & 0o777, path))
            .map(|_| ())
            .map_err(|e| translate(e, FerroErrorCode::FsError, "İzin değiştirilemedi (SITE CHMOD desteklenmiyor olabilir)"))
    }

    fn disconnect(&mut self) {
        let _ = self.stream.quit();
        self.connected = false;
    }
}
