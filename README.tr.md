<div align="center">

# Ferro

**Modern, güvenlik odaklı bir FTP / FTPS / SFTP masaüstü istemcisi**

Tauri (Rust) + Vue 3 + Vuetify ile geliştirilmiştir. Küçük, hızlı ve gizliliğe saygılı.

[![CI](https://github.com/fahrettinaksoy/ferro/actions/workflows/ci.yml/badge.svg)](https://github.com/fahrettinaksoy/ferro/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/fahrettinaksoy/ferro?include_prereleases&sort=semver)](https://github.com/fahrettinaksoy/ferro/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-informational)

[English](README.md) · **Türkçe**

</div>

---

## İçindekiler

- [Neden Ferro?](#neden-ferro)
- [Özellikler](#özellikler)
- [Ekran görüntüleri](#ekran-görüntüleri)
- [Kurulum](#kurulum)
- [Teknoloji yığını](#teknoloji-yığını)
- [Geliştirme](#geliştirme)
- [Proje yapısı](#proje-yapısı)
- [Mimari](#mimari)
- [Paketleme](#paketleme)
- [Otomatik güncelleme](#otomatik-güncelleme)
- [Yapılandırma ve veri konumu](#yapılandırma-ve-veri-konumu)
- [Güvenlik](#güvenlik)
- [Katkı](#katkı)
- [Lisans](#lisans)

---

## Neden Ferro?

Ferro; FTP, FTPS ve SFTP sunucularına bağlanıp dosya aktarmanız için tasarlanmış,
**yerel çekirdeği tamamen Rust'ta** yazılmış bir masaüstü uygulamasıdır. Web görünümü
(Vue 3 + Vuetify) yalnızca arayüzü çizer; tüm ağ, dosya sistemi ve kriptografi işlemleri
Rust tarafında, sıkı bir IPC sözleşmesi ardında çalışır.

- 🔒 **Güvenlik önce gelir** — kimlik bilgileri OS anahtar zincirinde ya da ana parolayla
  (scrypt + AES-256-GCM) şifrelenir; SFTP host anahtarları ve FTPS sertifikaları TOFU
  ile pinlenir.
- 🪶 **Hafif** — küçük ikili boyut, düşük bellek; Node.js runtime paketlenmez.
- 🌐 **Çok platform** — macOS, Windows ve Linux için tek kod tabanı.
- 🧩 **Zengin ama sade** — kuyruk, sürdürme, bant genişliği sınırı, yerinde düzenleme,
  uçtan uca şifreli senkronizasyon ve ekip paylaşımı.

## Özellikler

### Protokoller

- **FTP** ve **FTPS** (explicit `AUTH TLS` + implicit) — pasif mod.
- **SFTP** (SSH) — parola veya özel anahtar (passphrase destekli) ile kimlik doğrulama.

### Transfer motoru

- İndirme/yükleme **kuyruğu**: ilerleme, iptal, duraklat/sürdür, otomatik **yeniden deneme**.
- **Kaldığı yerden devam** (resume / REST offset) ve **klasör transferleri** (özyinelemeli).
- **Bant genişliği sınırlama** (throttle), FTP için **ASCII/binary** otomatik seçimi.
- **Dosya-var politikası**: sürdür / üzerine yaz / yeniden adlandır / atla.

### Güvenlik ve gizlilik

- **Kimlik kasası (vault):** OS anahtar zinciri (`keyring`) ya da kullanıcı **ana parolası**
  (scrypt + AES-256-GCM). Parola saklanamıyorsa açıkça uyarılır, düz metin yazılmaz.
- **SFTP host anahtarı TOFU** (`known_hosts`) ve **FTPS sertifika pinleme** (`trusted_certs`)
  — anahtar/sertifika değişince kullanıcı uyarılır (MITM koruması).
- **Vekil sunucu** (SFTP için SOCKS4/5 + HTTP CONNECT).

### Site yönetimi

- **Site Yöneticisi:** kayıtlı bağlantılar, klasör/grup düzeni, gelişmiş ayarlar.
- **İçe/dışa aktarma** (JSON) — parolalar isteğe bağlı ve açık onayla.

### Senkronizasyon ve ekip

- **Uçtan uca şifreli senkronizasyon** (GitHub **Gist** veya **WebDAV**) — siteler ve
  ayarlar cihazdan çıkmadan şifrelenir; sağlayıcı yalnızca şifreli blob'u görür.
- **Ekip paylaşımı** (sunucusuz) — paylaşılan şifreli bir kasa; davet kodu + PIN ile katılım.

### Düzenleme ve arayüz

- **Yerinde düzenleme:** uzak dosyayı indir → editörde aç → kaydettikçe otomatik yükle.
- **Yerel native menü**, **çok dil** (Türkçe/İngilizce), **Material 3** temalar (açık/koyu).
- **Rotasyonlu dosya loglaması** (sır maskeli) ve **otomatik güncelleme** altyapısı.

## Ekran görüntüleri

> _Buraya uygulama ekran görüntüleri eklenecek._

<!--
| Bağlan & gez | Site Yöneticisi | Ayarlar |
|---|---|---|
| ![](docs/img/browse.png) | ![](docs/img/sites.png) | ![](docs/img/settings.png) |
-->

## Kurulum

Hazır paketleri [**Releases**](https://github.com/fahrettinaksoy/ferro/releases)
sayfasından indirin:

| Platform | Paket                                   |
| -------- | --------------------------------------- |
| macOS    | `.dmg` (Apple Silicon + Intel evrensel) |
| Windows  | `.exe` (NSIS kurulum)                   |
| Linux    | `.AppImage`, `.deb`                     |

> macOS/Windows paketleri imza sertifikaları tanımlıysa kod imzalıdır. Uygulamayı
> yalnızca resmî Releases sayfasından indirin.

## Teknoloji yığını

| Katman          | Teknoloji                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Kabuk / backend | **Tauri v2**, **Rust** (tokio, russh + russh-sftp, suppaftp, rustls, aes-gcm, scrypt, keyring, reqwest) |
| Arayüz          | **Vue 3**, **Vuetify 4**, **Pinia**, **vue-i18n**, **Vite**                                             |
| Dil             | **TypeScript** (renderer), **Rust** (çekirdek)                                                          |

## Geliştirme

### Gereksinimler

- **Node.js 22+** (önerilen: **24** — `.nvmrc`)
- **Rust** (stable) — [rustup](https://rustup.rs)
- Platform bağımlılıkları:
  - **macOS:** Xcode Command Line Tools
  - **Windows:** WebView2 (Windows 11'de yerleşik)
  - **Linux:** `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `patchelf`, `libssl-dev` (Debian/Ubuntu)

### Komutlar

```bash
npm install          # bağımlılıklar + git hook'ları

npm run dev          # yalnız web önizleme (Vite) — http://localhost:1420
npm run tauri:dev    # masaüstü uygulaması (native pencere)

npm run build        # web build (typecheck + vite build)
npm run tauri:build  # masaüstü paket üret

npm run typecheck    # vue-tsc tip kontrolü
npm test             # Vue bileşen testleri (Vitest)
npm run lint         # ESLint
npm run format       # Prettier
```

Rust tarafı için (`src-tauri/`):

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml   # lint
cargo test  --manifest-path src-tauri/Cargo.toml    # birim testleri
```

### Mobil (deneysel, SDK kurulduktan sonra)

```bash
npm run tauri android init && npm run tauri android dev
npm run tauri ios init     && npm run tauri ios dev
```

## Proje yapısı

```text
ferro/
├── src-tauri/            # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── bridge.rs     # Tek IPC komutu + kanal dispatch + olay yayını
│   │   ├── handlers.rs   # IPC handler'ları
│   │   ├── transfer/     # SFTP/FTP istemcileri, oturum, kuyruk, TOFU, proxy, edit
│   │   ├── store/        # Atomik + sürümlü JSON depoları (siteler vb.)
│   │   ├── sync/ , team/ # Uçtan uca şifreli senkronizasyon ve ekip
│   │   ├── vault.rs      # Kimlik şifreleme (keyring + ana parola)
│   │   └── ...           # settings, logger, menu, updater, crypto, paths
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── renderer/         # Vue 3 arayüzü (bileşenler, store'lar, i18n, temalar)
│   └── shared/           # IPC sözleşmesi + ortak tipler (TS)
├── seed/                 # İlk açılış tohum verisi
└── .github/workflows/    # CI, Release, CodeQL, Audit, Quality
```

## Mimari

- **IPC köprüsü:** Arayüz tek bir yüzeyden konuşur — `window.ferro.invoke(channel, payload)`
  → Rust `bridge_invoke` komutu → dispatch. Her çağrı bir zarf döndürür
  (`{ ok: true, data } | { ok: false, error }`). Olaylar Tauri'nin adlandırılmış olay
  sistemiyle arayüze iletilir.
- **Transfer motoru:** Her oturum kendi çok-thread'li tokio runtime'ını sahiplenir; SFTP
  async (`russh`), FTP senkron (`suppaftp`) — ikisi de tek bir `TransferClient` arayüzü
  ardında. Transferler ayrı bağlantı kullanır, böylece tarama bloklanmaz.
- **Kripto:** scrypt (N=16384, r=8, p=1) + AES-256-GCM; senkronizasyon ve ekip verisi
  cihazdan çıkmadan şifrelenir.

## Paketleme

```bash
npm run tauri:build            # geçerli platform için tüm hedefler
npm run tauri:build:mac        # dmg
npm run tauri:build:win        # nsis
npm run tauri:build:linux      # AppImage + deb
```

Çıktılar `src-tauri/target/release/bundle/` altında üretilir. Üç platform için resmî
paketler, `v*` etiketi push'landığında **Release** iş akışı (`tauri-action`) tarafından
GitHub Releases'e yüklenir.

## Otomatik güncelleme

Ferro `tauri-plugin-updater` içerir. Etkinleştirmek için:

1. `tauri signer generate` ile bir imza anahtarı üretin.
2. `src-tauri/tauri.conf.json` içine `plugins.updater` (endpoints + `pubkey`) ekleyin.
3. Özel anahtarı CI secret'i olarak tanımlayın (`TAURI_SIGNING_PRIVATE_KEY`).

Yapılandırma yoksa açılıştaki güncelleme kontrolü sessizce atlanır.

## Yapılandırma ve veri konumu

Uygulama verileri (siteler, kasa, bilinen anahtarlar, sync/team yapılandırması) uygulama
yapılandırma dizininde tutulur:

| Platform | Konum                                         |
| -------- | --------------------------------------------- |
| macOS    | `~/Library/Application Support/com.ferro.app` |
| Windows  | `%APPDATA%\com.ferro.app`                     |
| Linux    | `~/.config/com.ferro.app`                     |

## Güvenlik

- Güvenlik açıklarını lütfen [SECURITY.md](SECURITY.md) yönergesine göre bildirin.
- Kimlik bilgileri asla düz metin saklanmaz; saklanamıyorsa kullanıcı uyarılır.
- Bağımlılık denetimi (`npm audit` + `cargo audit`) ve statik analiz (CodeQL, Clippy)
  CI'da otomatik koşar.

## Katkı

Katkılar memnuniyetle karşılanır! Başlamadan önce [CONTRIBUTING.md](CONTRIBUTING.md) ve
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) dosyalarına göz atın. Commit'ler
[Conventional Commits](https://www.conventionalcommits.org) biçimini izler.

## Lisans

[MIT](LICENSE) © Fahrettin Aksoy
