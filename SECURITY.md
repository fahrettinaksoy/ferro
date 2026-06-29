# Güvenlik — Ferro

Bu belge, analiz raporu §9 güvenlik kontrol listesini uygulama durumuyla eşler ve denetim bulgularını kaydeder.

## Kontrol Listesi (rapor §9)

| # | Madde | Durum | Uygulama |
|---|-------|-------|----------|
| 1 | Kimlik bilgileri düz metin saklanmaz | ✅ | `safeStorage` (OS keychain) — [vault.ts](src/main/store/vault.ts). `safeStorage` yoksa base64 fallback + kullanıcı uyarısı |
| 2 | FTPS/SFTP önerilir, düz FTP'de uyarı | ⚠️ Kısmi | Protokol seçilebilir; bağlantı log'unda protokol gösterilir. (Açık "güvensiz" rozeti eklenebilir) |
| 3 | SFTP host key doğrulama (TOFU) | ✅ | Parmak izi onayı + `known_hosts.json` + değişiklik uyarısı — [HostKeyVerifier.ts](src/main/transfer/HostKeyVerifier.ts) |
| 4 | Self-signed TLS'te açık onay | ✅ | Önce katı doğrula (parola sızmaz), hata→onay diyaloğu, `trusted_certs.json` — [TlsVerifier.ts](src/main/transfer/TlsVerifier.ts) |
| 5 | Electron sertleştirme | ✅ | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, sıkı CSP, `window.open` → deny |
| 6 | FTP bounce koruması (`allowSeparateTransferHost`) | ✅ | Set edilmedi → basic-ftp güvenli varsayılanı (kapalı) |
| 7 | Üretimde kod imzalama | ⚙️ Hazır | mac (`CSC_LINK`/notarization) + win (`WIN_CSC_LINK`) env ile — [electron-builder.yml](electron-builder.yml). İmzalama sertifikası gerektirir |

## Sertleştirme ayrıntıları

- **Süreç izolasyonu:** Tüm Node/FTP erişimi yalnızca Main process'te. Renderer ham sokete erişemez; IPC tip güvenli `contextBridge` köprüsünden geçer ([preload](src/preload/index.ts)).
- **CSP:** `default-src 'self'`; script yalnızca `'self'`; bağlantı `'self'` ([index.html](src/renderer/index.html)).
- **IPC:** Beyaz listeli kanallar; handler hataları yapısal `FerroError` olarak serileştirilir (stack renderer'a sızmaz).

## npm audit bulguları (denetim)

`npm audit` çalıştırıldı:

- **devDependencies (build araçları):** 10 yüksek açık — tümü `electron-builder` zincirinde (`tar`, `cacache`, `node-gyp`). **Paketlenen uygulamaya dahil DEĞİL** (yalnızca build zamanı). Runtime riski yok.
- **dependencies (runtime):** `basic-ftp`, `ssh2`, `ssh2-sftp-client`, `electron-updater` **temiz**.
- **Electron (runtime, 1 yüksek):** Electron 33.x için Chromium kaynaklı CVE'ler. CVE'lerin çoğu kullanılmayan özelliklere ait (USB seçimi, offscreen render, özel protokol handler'ları, `setAsDefaultProtocolClient`) ve mevcut sertleştirmeyle (sandbox + contextIsolation + nodeIntegration:false + window.open deny) önemli ölçüde azaltılmış.
  - **Önerilen takip (yüksek öncelik):** Electron'u en güncel sürüme yükselt (`npm i -D electron@latest`), ardından tüm test + smoke döngüsünü tekrarla. Major atlama olduğundan ayrı bir doğrulama turunda yapılmalıdır.

## İmzalama / notarization (yayın)

- **macOS:** `CSC_LINK` (.p12), `CSC_KEY_PASSWORD`; notarization için `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- **Windows:** `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
- İmzasız derleme için: `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:unpack`.
