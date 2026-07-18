//! SFTP için vekil sunucu bağlantısı — `transfer/proxy.ts` karşılığı.
//! SOCKS4/5 (tokio-socks) ve HTTP CONNECT tünelleri. Kurulan akış russh'a
//! `connect_stream` ile verilir (jenerik finisher, tip farkını monomorfizasyonla çözer).

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_socks::tcp::{Socks4Stream, Socks5Stream};

use crate::error::{FerroError, FerroErrorCode, FerroResult};
use crate::types::{ProxyConfig, ProxyType};

fn conn_err(e: impl std::fmt::Display) -> FerroError {
    FerroError::with_detail(FerroErrorCode::ConnectionFailed, "Vekil sunucuya bağlanılamadı", e.to_string())
}

pub async fn socks5(proxy: &ProxyConfig, host: &str, port: u16) -> FerroResult<Socks5Stream<TcpStream>> {
    let paddr = format!("{}:{}", proxy.host, proxy.port);
    let target = (host, port);
    match (proxy.user.as_deref(), proxy.password.as_deref()) {
        (Some(u), Some(p)) if !u.is_empty() => {
            Socks5Stream::connect_with_password(paddr.as_str(), target, u, p).await.map_err(conn_err)
        }
        _ => Socks5Stream::connect(paddr.as_str(), target).await.map_err(conn_err),
    }
}

pub async fn socks4(proxy: &ProxyConfig, host: &str, port: u16) -> FerroResult<Socks4Stream<TcpStream>> {
    let paddr = format!("{}:{}", proxy.host, proxy.port);
    let target = (host, port);
    let user = proxy.user.as_deref().unwrap_or("");
    Socks4Stream::connect_with_userid(paddr.as_str(), target, user).await.map_err(conn_err)
}

/// HTTP CONNECT tüneli kurar ve tünellenmiş TcpStream'i döner.
pub async fn http_connect(proxy: &ProxyConfig, host: &str, port: u16) -> FerroResult<TcpStream> {
    let paddr = format!("{}:{}", proxy.host, proxy.port);
    let mut stream = TcpStream::connect(&paddr).await.map_err(conn_err)?;
    let mut req = format!("CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n");
    if let (Some(u), Some(p)) = (proxy.user.as_deref(), proxy.password.as_deref()) {
        if !u.is_empty() {
            let auth = B64.encode(format!("{u}:{p}"));
            req.push_str(&format!("Proxy-Authorization: Basic {auth}\r\n"));
        }
    }
    req.push_str("\r\n");
    stream.write_all(req.as_bytes()).await.map_err(conn_err)?;

    // Yanıt başlığını oku (\r\n\r\n'e kadar).
    let mut buf = Vec::with_capacity(256);
    let mut byte = [0u8; 1];
    loop {
        let n = stream.read(&mut byte).await.map_err(conn_err)?;
        if n == 0 {
            break;
        }
        buf.push(byte[0]);
        if buf.ends_with(b"\r\n\r\n") || buf.len() > 8192 {
            break;
        }
    }
    let head = String::from_utf8_lossy(&buf);
    let status_ok = head
        .lines()
        .next()
        .map(|l| l.contains(" 200") || l.contains(" 2"))
        .unwrap_or(false);
    if !status_ok {
        return Err(FerroError::with_detail(
            FerroErrorCode::ConnectionFailed,
            "HTTP vekil CONNECT reddedildi",
            head.lines().next().unwrap_or("").to_string(),
        ));
    }
    Ok(stream)
}

/// Proxy türünün SFTP tarafından desteklenip desteklenmediği (none dışı + host dolu).
pub fn is_active(proxy: &ProxyConfig) -> bool {
    proxy.proxy_type != ProxyType::None && !proxy.host.is_empty()
}
