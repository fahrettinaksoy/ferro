//! Transfer motoru — protokol istemcileri, oturum yönetimi, kuyruk, TOFU, proxy.
//!
//! Tasarım: her oturum kendi OS thread'inde bir "actor" olarak çalışır; thread
//! protokol istemcisini (senkron suppaftp / tokio-async russh) sahiplenir ve mpsc
//! komut kanalıyla sürülür. Böylece FTP (sync) ve SFTP (async) tek arayüz ardında
//! birleşir ve istemciler (Send ama Sync değil) tek thread'de güvenle tutulur.

pub mod client;
pub mod compare;
pub mod edit;
pub mod ftp;
pub mod proxy;
pub mod queue;
pub mod session;
pub mod sftp;
pub mod tofu;
