# Ferro — Geliştirici Belgeleri

Bu belge Ferro'nun mimarisini, geliştirme ortamını, test altyapısını ve derleme/yayınlama süreçlerini kapsar. Son kullanıcı belgeleri için: [README.tr.md](../README.tr.md)

## İçindekiler

- [Mimari](#mimari)
- [Güvenlik Mimarisi](#güvenlik-mimarisi)
- [Proje Yapısı](#proje-yapısı)
- [Geliştirme Ortamı](#geliştirme-ortamı)
- [Test](#test)
- [Derleme ve Yayınlama](#derleme-ve-yayınlama)

## Mimari

```text
┌────────────────────────────────────────────────────────────┐
│  Renderer (Vue 3 + Vuetify + Pinia + vue-i18n)             │
│  sandbox · contextIsolation · sıkı CSP                     │
└──────────────────────┬─────────────────────────────────────┘
                       │  window.ferro  (invoke + on)
┌──────────────────────┴─────────────────────────────────────┐
│  Preload — sertleştirilmiş contextBridge                   │
└──────────────────────┬─────────────────────────────────────┘
                       │  tek köprü kanalı · zod doğrulaması
┌──────────────────────┴─────────────────────────────────────┐
│  Main (Node.js)                                            │
│  SessionManager · ConnectionPool · TransferQueue           │
│  FtpAdapter (basic-ftp) · SftpAdapter (ssh2-sftp-client)   │
│  Vault · HostKeyVerifier · TlsVerifier · EditManager       │
│  JSON depoları · Logger · Updater                          │
└────────────────────────────────────────────────────────────┘
```

- **Main** (`src/main`) — tüm FTP/SFTP motoru: oturum yöneticisi, bağlantı havuzu, transfer kuyruğu, güvenlik doğrulayıcıları ve kalıcı depolar. Yakalanmamış istisnalarda süreç bilinçli olarak ayakta tutulur (devam eden transferler korunur).
- **Preload** (`src/preload`) — renderer'a yalnızca tipli `window.ferro` API'sini (`invoke` + `on`) açan sertleştirilmiş `contextBridge`.
- **Renderer** (`src/renderer`) — Vue 3 + Vuetify arayüzü; Pinia depoları ve vue-i18n.
- **Shared** (`src/shared`) — IPC sözleşmesinin tek doğruluk kaynağı: `ipc.ts` (38 invoke + 8 event kanalı, `InvokeMap`/`EventMap`), `errors.ts` (14 kodlu `FerroError` modeli), `transfer.ts` (alan tipleri).

### IPC sözleşmesi

IPC uçtan uca tip güvenlidir:

- Kanal imzaları derleme zamanında `InvokeMap`/`EventMap` ile denetlenir.
- Yükler main sürecinde zod ile çalışma zamanında doğrulanır (yol uzunluğu ≤ 4096, null bayt yasağı, port aralığı 1–65535, bağlantı limiti 1–10 vb.).
- Router (`src/main/ipc/router.ts`) tek köprü kanalı üzerinden çalışır: güvenilir gönderici denetimi → kanal denetimi → zod doğrulaması → handler → `{ok:true,data}` ya da `{ok:false,error}` zarfı.
- Hatalar köprüden `code` alanı korunarak yapısal `FerroError` olarak geçer; adaptörler protokol hatalarını (FTP yanıt kodları, SFTP durum kodları, `errno`) önce yapısal olarak eşler, regex yalnızca son çaredir.

### Transfer motoru

- **Bağlantı havuzu** (`ConnectionPool.ts`): oturum başına varsayılan 3, 1–10 arası; `acquire()` zaman aşımı 60 sn. Başarısız bağlantı havuzdan atılır, yeniden deneme taze bağlantı alır.
- **Kuyruk** (`TransferQueue.ts`): duraklat/sürdür (oturumlar arası global), iş bazında/toplu iptal; ilerleme yayını 120 ms'de bir kısıtlanır.
- **Yeniden deneme**: üstel backoff (çarpan 2, jitter 0.2); yeniden denenebilir kodlar `CONNECTION_FAILED, TRANSFER_FAILED, NOT_CONNECTED, TIMEOUT, UNKNOWN`.
- **Sürdürme**: FTP `REST`/`appendFrom`; SFTP okuma offset'i + append bayrağı.
- **Hız limiti** (`throttle.ts`): token-bucket `ThrottleStream`, 0.25 sn burst penceresi, min kapasite 16 KiB.
- **Özyinelemeli transfer**: derinlik sınırı 64 (symlink döngüsü koruması); symlink'ler takip edilmez.

## Güvenlik Mimarisi

- **Vault** (`store/vault.ts`) iki mod:
  - `os` — Electron `safeStorage` (OS anahtar zinciri), kayıt öneki `v1:` (varsayılan)
  - `master` — ana parola: scrypt (N=16384, r=8, p=1) + AES-256-GCM (12 bayt IV), önek `m1:`. Mod geçişlerinde sırlar yeniden şifrelenerek taşınır.
  - `p0:` (base64) eski kayıtlar yalnızca okunur (geri uyumluluk + seed).
  - İkisi de kullanılamıyorsa parolalar **hiç kalıcılaştırılmaz** — düz metin asla diske yazılmaz.
- **SSH host anahtarı TOFU** (`HostKeyVerifier.ts`): SHA-256 parmak izi `known_hosts.json` içinde; bilinmeyen/değişen anahtar renderer'a sorulur, 5 dk yanıtsız kalırsa güvenli reddedilir.
- **FTPS sertifika pinleme** (`TlsVerifier.ts`): önce katı doğrulama — kimlik bilgileri doğrulanmamış sunucuya asla gitmez. Sertifika hatasında kimlik bilgisi içermeyen el sıkışmayla sertifika incelenir, onay istenir ve `trusted_certs.json` içinde host:port başına parmak iziyle pinlenir. Değişen sertifika = MITM uyarısı.
- **Renderer sertleştirmesi**: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, sıkı CSP, güvenilir gönderici IPC denetimi, `window.open`/gezinme kilidi.
- **Günlük maskeleme** (`core/logger.ts`): `PASS`/`ACCT` komutları ve password/passphrase/secret/privateKey kalıpları yazılmadan önce maskelenir.
- **Atomik depolar** (`store/jsonStore.ts`): tmp+rename ile atomik yazım, sürümlü şema, bozulma `.corrupt` olarak karantinaya alınır — güvenilen anahtar/sertifika verisi asla sessizce sıfırlanmaz.

## Proje Yapısı

```text
ferro/
├── src/
│   ├── main/                 # Electron main süreci
│   │   ├── core/             # logger, updater, runtime ayarları
│   │   ├── ipc/              # router + handler modülleri (zod doğrulama)
│   │   ├── store/            # sites, vault, knownHosts (atomik JSON depoları)
│   │   └── transfer/         # adaptörler, havuz, kuyruk, oturum, güvenlik
│   ├── preload/              # contextBridge (window.ferro)
│   ├── renderer/src/
│   │   ├── components/       # FilePane, SiteManager, SettingsDialog, ...
│   │   ├── components/settings/  # 20+ ayar sayfası
│   │   ├── stores/           # Pinia: connection, transfer, ui, vault, ...
│   │   ├── lib/              # ipc, theme (M3), format, logger
│   │   └── locales/          # tr.ts, en.ts
│   └── shared/               # IPC sözleşmesi, hata modeli, alan tipleri
├── test/                     # Vitest birim + entegrasyon testleri
│   └── docker-compose.yml    # vsftpd + OpenSSH sftp test sunucuları
├── seed/                     # ilk çalıştırma örnek siteleri
├── build/                    # ikonlar, macOS entitlements
└── .github/workflows/        # ci.yml, release.yml
```

## Geliştirme Ortamı

**Node.js 22** gerekir (`.nvmrc`); entegrasyon testleri için ayrıca Docker.

```bash
npm install
npm run dev        # electron-vite dev sunucusu (HMR)
npm run typecheck  # tsc (main/preload) + vue-tsc (renderer)
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # typecheck + production paket
```

> **Not:** `ELECTRON_RUN_AS_NODE=1` set ise Electron saf Node gibi başlar ve pencere açılmaz. `unset ELECTRON_RUN_AS_NODE && npm run dev` çalıştırın.

Commit'ler [Conventional Commits](https://www.conventionalcommits.org/) kuralına uyar (commitlint + husky ile denetlenir); `pre-commit` kancası lint-staged çalıştırır.

### Yerel test sunucularıyla deneme

```bash
docker compose -f test/docker-compose.yml up -d
npm run dev
# FTP  : localhost:21   kullanıcı: ferro  parola: ferropass
# SFTP : localhost:2222 kullanıcı: ferro  parola: ferropass
```

Örnek site verisi üretmek için: `node scripts/generate-seed-sites.mjs` (48 karışık bağlantılık seed üretir; `--install` ile doğrudan `userData`'ya yazar).

## Test

```bash
npm run test:unit                                  # hızlı, dış bağımlılık yok
docker compose -f test/docker-compose.yml up -d    # vsftpd + OpenSSH sftp
npm run test:integration                           # gerçek sunuculara karşı
npm run test:coverage                              # v8 coverage (src/main + src/shared)
```

- **Birim testleri (11):** kuyruk yeniden denemesi, havuz, throttle, vault (master parola + fallback), IPC doğrulaması, JSON deposu, edit manager, aktarım türü sınıflandırması, site deposu, reaktivite
- **Entegrasyon testleri (5):** FTP/SFTP adaptörleri, kuyruk, oturum ve sürdürme senaryoları — gerçek vsftpd ve OpenSSH sunucularına karşı
- Sunucu uyumluluk matrisi ve bilinen sınırlamalar için: [test/COMPATIBILITY.md](../test/COMPATIBILITY.md) (aktif FTP modu desteklenmez; `basic-ftp` yalnızca pasif mod sunar)

## Derleme ve Yayınlama

```bash
npm run build:mac    # dmg (arm64 + x64), hardened runtime + notarization
npm run build:win    # NSIS x64
npm run build:linux  # AppImage + deb
```

- **CI** (`.github/workflows/ci.yml`): her push/PR'da lint → typecheck → birim testleri; Docker'lı entegrasyon testleri; üç platformda paketleme smoke testi.
- **Yayın** (`.github/workflows/release.yml`): `v*` etiketiyle tetiklenir; üç platformda derleyip imzalayarak (secrets mevcutsa) GitHub Releases'e yükler. Otomatik güncelleme sağlayıcısı GitHub'dır.
- Ayrıntılar için: [RELEASING.md](RELEASING.md)
