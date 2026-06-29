# Ferro

FTP / FTPS / SFTP masaüstü istemcisi — Electron + Vue 3 + Vuetify 3 + TypeScript.

> Yol haritası: [gelistirme-plani.md](gelistirme-plani.md) · Analiz: [ftp-client-analiz-raporu.md](ftp-client-analiz-raporu.md)

## Geliştirme

```bash
npm install
npm run dev        # electron-vite dev (HMR)
npm run typecheck  # node + web tip kontrolü
npm run build      # typecheck + production paket
```

> **Not:** Bu ortamda `ELECTRON_RUN_AS_NODE=1` set ise Electron saf Node gibi başlar ve pencere açılmaz. Gerekirse `unset ELECTRON_RUN_AS_NODE && npm run dev`.

## Mimari

- **Main** (`src/main`) — Node.js süreci. FTP/SFTP motoru burada çalışır.
- **Preload** (`src/preload`) — sertleştirilmiş `contextBridge` köprüsü (CommonJS, sandbox uyumlu).
- **Renderer** (`src/renderer`) — Vue 3 + Vuetify 3 arayüzü.
- **Shared** (`src/shared`) — IPC sözleşmesi (`ipc.ts`) ve hata modeli (`errors.ts`).

IPC tip güvenlidir: kanallar `src/shared/ipc.ts` içindeki `InvokeMap`/`EventMap`'te tanımlanır.
Renderer, `@renderer/lib/ipc`'teki `invoke()` ile çağırır; hatalar `FerroError` (`code` korunur) olarak gelir.

Güvenlik: `contextIsolation`, `sandbox`, `nodeIntegration:false`, sıkı CSP.

## Test

```bash
docker compose -f test/docker-compose.yml up -d   # vsftpd + atmoz/sftp
npm test                                          # adaptör entegrasyon testleri
docker compose -f test/docker-compose.yml down    # kapat
```

## Durum

- [x] **Sprint 0** — iskelet, Vuetify/Pinia/Router, tip güvenli IPC köprüsü, logger + hata modeli
- [~] **Sprint 1** — SFTP dahil MVP
  - [x] G1.1 `IFileTransferClient` ortak arayüzü
  - [x] G1.2 FTP/FTPS adaptörü (`basic-ftp`) — gerçek vsftpd'ye karşı test geçti
  - [x] G1.9 SFTP adaptörü (`ssh2-sftp-client`) — gerçek atmoz/sftp'ye karşı test geçti
  - [x] G1.8 Docker test sunucuları + Vitest entegrasyon testleri (10/10 geçiyor)
  - [x] G1.3 Oturum yöneticisi + IPC uçları (connect/list/cwd/download/upload/local) — test edildi
  - [x] G1.4 Bağlantı formu (Quick Connect: FTP/FTPS/SFTP, anonim)
  - [x] G1.5/G1.6 Çift panel (yerel + uzak), gezinme, transfer butonları
  - [x] G1.7 Log paneli (komut/yanıt akışı) + transfer ilerleme çubuğu
  - [x] G1.10 Host key TOFU — parmak izi onay diyaloğu + known_hosts kaydı + değişiklik uyarısı
- [x] **Sprint 2** — profesyonel çekirdek
  - [x] G2.5 Dosya işlemleri: yeni klasör, yeniden adlandır, sil (uzak+yerel), chmod (uzak) — sağ tık menüsü
  - [x] G2.4 Sürükle-bırak transfer (panel ↔ panel, dosya + klasör)
  - [x] G2.2/G2.3 Transfer kuyruğu motoru + bağlantı havuzu — paralel transfer, ilerleme/iptal
  - [x] G2.7 Resume (FTP REST/offset; SFTP overwrite) — yarım transferi sürdürme
  - [x] G2.6 Recursive klasör transferi (alt ağaç) — indir + yükle
  - [x] G2.8 Keep-alive (FTP NOOP timer + SFTP ssh2 keepalive)
  - **16/16 entegrasyon testi geçiyor**
- [x] **Sprint 3** — ileri düzey
  - [x] G3.4 Site Yöneticisi (kayıtlı bağlantılar, çift tıkla bağlan)
  - [x] G3.5 Şifreli kimlik deposu (Electron `safeStorage` / OS keychain)
  - [x] G3.6 TLS sertifika onayı (FTPS self-signed TOFU diyaloğu)
  - [x] G3.7 Dizin senkronizasyonu (karşılaştır + seçili aktar, yön seçimli)
  - [x] G3.8 Edit-in-place (uzak dosyayı yerelde aç → kaydet → otomatik yükle)
  - [x] G3.9 Bant genişliği sınırı (transfer hız throttle, ayarlardan)
  - [x] G3.10 i18n (TR/EN) — dil + tema + hız limiti, localStorage'da kalıcı
  - **26/26 test geçiyor**
- [x] **Sprint 4** — yayın hazırlığı
  - [x] G4.1 electron-builder paketleme (mac/win/linux config, `--dir` doğrulandı: app açılıyor)
  - [x] G4.2 auto-update (`electron-updater` — production'da çalışır, feed yoksa zarif geçer)
  - [x] G4.4 Güvenlik denetimi — [SECURITY.md](SECURITY.md) (npm audit + sertleştirme doğrulaması)
  - [x] G4.3 Sunucu uyumluluk matrisi — [test/COMPATIBILITY.md](test/COMPATIBILITY.md)
  - **Not:** kod imzalama (sertifika gerekir) ve gerçek update feed yayın aşamasında doldurulur

> Güvenlik özeti: [SECURITY.md](SECURITY.md). Bilinen takip: Electron'u en güncel sürüme yükselt (CVE'ler büyük ölçüde sertleştirmeyle azaltıldı).

> **Denemek için:** `npm run dev` → üstteki çubuktan bir sunucuya bağlan (test için
> `docker compose -f test/docker-compose.yml up -d` sonra FTP `localhost:21 ferro/ferropass`
> veya SFTP `localhost:2222 ferro/ferropass`). Çift tıkla gez · satır sonundaki ok veya
> sürükle-bırak ile transfer et · sağ tık ile dosya işlemleri.
