# Ferro — FTP/FTPS/SFTP İstemcisi · Geliştirme Planı

> **Kaynak:** [ftp-client-analiz-raporu.md](ftp-client-analiz-raporu.md)
> **Stack:** Electron + electron-vite + Vue 3 + Vuetify 3 + TypeScript (strict) + Pinia
> **Motorlar:** `basic-ftp` (FTP/FTPS) · `ssh2-sftp-client` (SFTP)
> **Çalışma şekli:** Her adım (`G#`) bağımsız bir Claude görevi gibi tasarlandı. Sırayla ilerle, her adımın **Bitti Kriteri** (Definition of Done) karşılanmadan sonrakine geçme.

---

## 0. Yöntem ve Kurallar

Bu plan, projeyi Claude ile adım adım geliştirmek için bir **görev kuyruğu**dur. Her görev şu yapıdadır:

- **Amaç** — neyi başaracağız
- **Yapılacaklar** — somut işler
- **Çıktı dosyaları** — oluşacak/değişecek dosyalar
- **Bitti Kriteri** — kanıtlanabilir kabul koşulu

### Genel mühendislik ilkeleri
1. **Protokol soyutlama:** Tüm protokoller tek `IFileTransferClient` arayüzü arkasında. UI hangi protokolü kullandığını bilmez.
2. **Süreç ayrımı:** FTP/SFTP motoru **yalnızca** Main process'te. Renderer asla doğrudan Node soketi açmaz.
3. **Güvenli IPC:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Tüm köprü preload'daki `contextBridge` üzerinden, tip güvenli kanallarla.
4. **Stream-first:** Dosyalar belleğe tüm yüklenmez; her zaman stream ile aktarılır.
5. **Her sprint sonunda gerçek sunucuya karşı test.** Yerel Docker test sunucuları (vsftpd / OpenSSH) ile doğrula.

### Dal (branch) stratejisi
- `main` korunur. Her sprint için `feat/sprint-N-<konu>` dalı aç, PR ile birleştir.

---

## Faz 0 — Temel İskelet (Sprint 0)

### G0.1 — Proje iskeletini kur
- **Amaç:** electron-vite tabanlı çalışan boş bir Electron + Vue 3 penceresi.
- **Yapılacaklar:**
  - `npm create @quick-start/electron` (veya electron-vite şablonu) ile Vue + TS varyantı.
  - `package.json` script'leri: `dev`, `build`, `build:mac`, `build:win`, `build:linux`, `typecheck`, `lint`.
  - `tsconfig` strict mode; ana/preload/renderer için ayrı tsconfig.
  - ESLint + Prettier + `.editorconfig`.
- **Çıktı dosyaları:** `package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/`.
- **Bitti Kriteri:** `npm run dev` ile boş pencere açılıyor, HMR çalışıyor, `npm run typecheck` temiz.

### G0.2 — Vuetify 3 + Pinia + Router entegrasyonu
- **Amaç:** UI kütüphanesi ve durum yönetimi hazır.
- **Yapılacaklar:**
  - Vuetify 3 plugin kurulumu (tree-shaking, MDI ikon seti), light/dark tema.
  - Pinia kur, örnek store ile doğrula.
  - `vue-router` (history/hash uyumlu) — temel layout iskeleti.
- **Çıktı dosyaları:** `src/renderer/src/plugins/vuetify.ts`, `.../stores/`, `.../router/`, `.../App.vue`.
- **Bitti Kriteri:** Vuetify bileşeni render oluyor, tema değiştirilebiliyor, Pinia store reaktif.

### G0.3 — Güvenli IPC köprüsü (contextBridge) + tip sözleşmesi
- **Amaç:** Renderer ↔ Main arası tip güvenli, sertleştirilmiş IPC.
- **Yapılacaklar:**
  - `contextBridge.exposeInMainWorld('ferro', api)` — yalnızca beyaz listedeki kanallar.
  - Ortak tip paketi: `src/shared/ipc.ts` (kanal isimleri, istek/yanıt tipleri, event tipleri).
  - `window.ferro` için renderer global tip bildirimi (`env.d.ts`).
  - Main tarafında `ipcMain.handle` router'ı; hata serileştirme standardı (`{ ok, data, error }`).
  - Pencere sertleştirme: `webPreferences` (`contextIsolation`, `sandbox`, `nodeIntegration:false`), CSP meta.
- **Çıktı dosyaları:** `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/router.ts`, `src/renderer/src/env.d.ts`.
- **Bitti Kriteri:** Renderer'dan `window.ferro.ping()` çağrısı Main'e gidip yanıt dönüyor; DevTools'ta `require`/`process` renderer'da erişilemiyor.

### G0.4 — Proje yapısı, logger ve hata modeli
- **Amaç:** Tutarlı klasör düzeni ve gözlemlenebilirlik.
- **Yapılacaklar:**
  - Klasör iskeleti (aşağıdaki "Hedef Dizin Yapısı").
  - Yapısal logger (Main + Renderer), seviye bazlı.
  - Ortak hata tipleri: `FerroError` (kod + kullanıcı mesajı + teknik detay).
- **Çıktı dosyaları:** `src/main/core/logger.ts`, `src/shared/errors.ts`.
- **Bitti Kriteri:** Bir IPC hatası Renderer'a yapısal olarak ulaşıyor ve loglanıyor.

---

## Faz 1 — MVP: Bağlan, Listele, Tek Dosya (Sprint 1)

### G1.1 — Protokol soyutlama arayüzü (`IFileTransferClient`)
- **Amaç:** Tüm protokollerin uyacağı sözleşme.
- **Yapılacaklar:**
  - Arayüz: `connect()`, `disconnect()`, `list(path)`, `download(remote, localStream, opts)`, `upload(localStream, remote, opts)`, `delete(path)`, `rename(from, to)`, `mkdir(path)`, `rmdir(path)`, `stat(path)`, `pwd()`, `cwd(path)`.
  - Ortak tipler: `RemoteEntry` (ad, tip, boyut, mtime, izinler, link mi), `ConnectionConfig`, `TransferProgress`.
  - `TransferError` ve protokol-agnostik hata normalizasyonu.
- **Çıktı dosyaları:** `src/main/transfer/IFileTransferClient.ts`, `src/main/transfer/types.ts`.
- **Bitti Kriteri:** Arayüz derleniyor; iki adaptör de bunu implemente edecek şekilde tasarlandı.

### G1.2 — FTP/FTPS adaptörü (`basic-ftp`)
- **Amaç:** Düz FTP + FTPS explicit (AUTH TLS) ile çalışan adaptör.
- **Yapılacaklar:**
  - `basic-ftp` Client'ı `IFileTransferClient` arkasına sar.
  - Bağlantı seçenekleri: host, port, user, pass, `secure: false | true | 'implicit'`, `secureOptions.rejectUnauthorized`.
  - Anonim giriş (`anonymous` / boş şifre).
  - Listeleme: MLSD/Unix/DOS otomatik parse → `RemoteEntry[]` normalizasyonu.
  - Stream tabanlı `downloadTo` / `uploadFrom`.
  - Encoding seçeneği (varsayılan utf8; Türkçe için `latin1`/`win1254` opsiyonu).
- **Çıktı dosyaları:** `src/main/transfer/adapters/FtpAdapter.ts`.
- **Bitti Kriteri:** Gerçek/test FTP sunucusuna bağlanıp kök dizini listeliyor, bir dosya indirip yüklüyor.

### G1.3 — Bağlantı oturum yöneticisi + IPC uçları
- **Amaç:** UI'ın kullanacağı bağlantı yaşam döngüsü.
- **Yapılacaklar:**
  - `SessionManager`: aktif bağlantıları id ile tut, oluştur/kapat.
  - IPC: `connection.connect`, `connection.disconnect`, `fs.list`, `fs.download`, `fs.upload`.
  - Komut-yanıt akışını log paneline event olarak yayınla (`session.log` event).
- **Çıktı dosyaları:** `src/main/transfer/SessionManager.ts`, `src/main/ipc/handlers/connection.ts`, `.../fs.ts`.
- **Bitti Kriteri:** Renderer'dan bağlan → listele → indir/yükle uçtan uca çalışıyor.

### G1.4 — Bağlantı formu + Hızlı Bağlan UI
- **Amaç:** Kullanıcı bağlantı kurabiliyor.
- **Yapılacaklar:**
  - Quickconnect bar: host, port, kullanıcı, şifre, protokol seçimi (FTP/FTPS-E/FTPS-I/SFTP).
  - Bağlantı durumu göstergesi (bağlanıyor/bağlı/hata).
  - Pinia `connectionStore`.
- **Çıktı dosyaları:** `src/renderer/src/components/QuickConnect.vue`, `.../stores/connection.ts`.
- **Bitti Kriteri:** Formdan girilen bilgilerle gerçek bağlantı kuruluyor.

### G1.5 — Uzak dizin görünümü + gezinme
- **Amaç:** Uzak dosya sistemini gez.
- **Yapılacaklar:**
  - Dosya tablosu (ad, boyut, tarih, izin, tip ikonu) — Vuetify `v-data-table`.
  - Çift tıkla klasöre gir, ".." ile yukarı, breadcrumb/yol çubuğu.
  - Yenile, sırala, boş/yükleniyor/hata durumları.
- **Çıktı dosyaları:** `src/renderer/src/components/RemotePane.vue`, `.../stores/remoteFs.ts`.
- **Bitti Kriteri:** Dizinler arası gezinme akıcı; büyük dizinlerde donmuyor.

### G1.6 — Yerel dosya sistemi görünümü
- **Amaç:** Yerel tarafı göster (çift panelin temeli).
- **Yapılacaklar:**
  - Main'de yerel FS okuma (`fs/promises`) IPC uçları (`local.list`, `local.home`).
  - Renderer'da yerel pane (uzakla aynı tablo bileşeni, kaynak parametreli).
- **Çıktı dosyaları:** `src/main/ipc/handlers/local.ts`, `src/renderer/src/components/LocalPane.vue`.
- **Bitti Kriteri:** Yerel dizinlerde gezinme çalışıyor.

### G1.7 — Log / aktivite paneli
- **Amaç:** Komut-yanıt akışını göster (FileZilla mesaj günlüğü gibi).
- **Yapılacaklar:**
  - `session.log` event'lerini dinleyen alt panel; seviye renkleri; temizle/kopyala.
- **Çıktı dosyaları:** `src/renderer/src/components/LogPanel.vue`, `.../stores/log.ts`.
- **Bitti Kriteri:** Bağlantı ve transfer olayları gerçek zamanlı akıyor.

### G1.8 — Yerel Docker test sunucuları + duman testi
- **Amaç:** Tekrarlanabilir test ortamı.
- **Yapılacaklar:**
  - `docker-compose.yml`: vsftpd (FTP+FTPS) ve OpenSSH (SFTP).
  - README'de kullanım; örnek test dosyaları.
- **Çıktı dosyaları:** `test/docker-compose.yml`, `test/README.md`.
- **Bitti Kriteri:** `docker compose up` ile sunucular ayağa kalkıyor, MVP bunlara karşı çalışıyor.

> **🏁 MVP Sürümü (v0.1):** FTP/FTPS bağlan + iki panel listeleme + tek dosya indir/yükle + log.

---

## Faz 2 — Profesyonel Çekirdek (Sprint 2–3)

### G2.1 — Çift panel (dual-pane) düzeni
- **Amaç:** Sol yerel / sağ uzak — FileZilla mantığı.
- **Yapılacaklar:** Yeniden boyutlanabilir split layout, panel başlıkları, yol çubukları, aktif panel vurgusu.
- **Çıktı dosyaları:** `src/renderer/src/views/DualPaneView.vue`.
- **Bitti Kriteri:** İki panel yan yana, bağımsız gezinme.

### G2.2 — Transfer kuyruğu motoru (Main)
- **Amaç:** Çok dosyalı, ilerlemeli, yönetilebilir transfer.
- **Yapılacaklar:**
  - Kuyruk modeli: bekleyen/aktif/tamamlanan/başarısız; öncelik; iptal.
  - İlerleme event'i: aktarılan bayt, yüzde, hız (KB/s), kalan süre (ETA).
  - Stream tabanlı; eşzamanlılık limiti (önce 1, sonra havuzla artır).
- **Çıktı dosyaları:** `src/main/transfer/TransferQueue.ts`, `src/main/transfer/TransferJob.ts`.
- **Bitti Kriteri:** 10+ dosyalık kuyruk sırayla işleniyor, ilerleme doğru.

### G2.3 — Transfer kuyruğu UI
- **Amaç:** Kuyruğu görüntüle/yönet.
- **Yapılacaklar:** Alt panelde kuyruk sekmeleri (sıradaki/başarılı/başarısız), per-dosya progress bar, iptal/tekrar dene/temizle.
- **Çıktı dosyaları:** `src/renderer/src/components/TransferQueue.vue`, `.../stores/transfer.ts`.
- **Bitti Kriteri:** Kuyruk gerçek zamanlı güncelleniyor, iptal çalışıyor.

### G2.4 — Sürükle-bırak transfer
- **Amaç:** Panel↔panel ve OS↔panel sürükle-bırak.
- **Yapılacaklar:** Panel içi DnD ile transfer başlatma; OS'tan dosya bırakınca yükleme kuyruğa ekleme.
- **Bitti Kriteri:** Sürükle-bırak ile dosya/klasör transferi kuyruğa giriyor.

### G2.5 — Dosya işlemleri (sil / yeniden adlandır / mkdir / chmod)
- **Amaç:** Uzakta temel yönetim.
- **Yapılacaklar:** Sağ tık menüsü; onay diyalogları; chmod (FTP `SITE CHMOD`, SFTP `chmod`); hata geri bildirimi.
- **Çıktı dosyaları:** `src/renderer/src/components/ContextMenu.vue`, ilgili IPC uçları.
- **Bitti Kriteri:** Tüm işlemler her iki protokolde çalışıyor (destek yoksa zarif uyarı).

### G2.6 — Recursive (klasör) transferi
- **Amaç:** Klasörleri alt ağacıyla aktar.
- **Yapılacaklar:** Klasör ağacını gez, dosyaları kuyruğa düzleştir, uzakta dizinleri oluştur.
- **Bitti Kriteri:** İç içe klasör yapısı doğru aktarılıyor.

### G2.7 — Transferi sürdürme (resume)
- **Amaç:** Yarım transferi kaldığı yerden devam ettir.
- **Yapılacaklar:** FTP `REST` + `SIZE`; SFTP `fastGet/fastPut` offset; çakışma diyaloğu (üzerine yaz / atla / devam et / yeniden adlandır).
- **Bitti Kriteri:** Kesilen büyük dosya transferi resume ile tamamlanıyor.

### G2.8 — Keep-alive (NOOP)
- **Amaç:** Uzun işlemlerde bağlantı düşmesin.
- **Yapılacaklar:** Boşta periyodik `NOOP`; ayarlanabilir aralık.
- **Bitti Kriteri:** Uzun bekleme sonrası bağlantı canlı.

> **🏁 v0.2:** Çift panel + kuyruk + DnD + dosya işlemleri + resume.

---

## Faz 3 — SFTP ve İleri Özellikler (Sprint 4–6)

### G3.1 — SFTP adaptörü (`ssh2-sftp-client`)
- **Amaç:** SFTP'yi aynı arayüz arkasında.
- **Yapılacaklar:** `ssh2-sftp-client`'ı `IFileTransferClient`'a uyarla; şifre + private key auth; `list/stat/fastGet/fastPut/rename/mkdir/rmdir/chmod`.
- **Çıktı dosyaları:** `src/main/transfer/adapters/SftpAdapter.ts`.
- **Bitti Kriteri:** SFTP ile MVP+kuyruk akışı FTP'yle aynı şekilde çalışıyor.

### G3.2 — Host key doğrulama (TOFU)
- **Amaç:** SFTP güvenliği.
- **Yapılacaklar:** İlk bağlantıda parmak izini göster + onaylat; bilinen host store; değişiklikte uyar.
- **Çıktı dosyaları:** `src/main/transfer/knownHosts.ts`, onay diyaloğu.
- **Bitti Kriteri:** Yeni host onayı isteniyor, değişen host engelleniyor.

### G3.3 — Bağlantı havuzu (paralel transfer)
- **Amaç:** Eşzamanlı çoklu transfer.
- **Yapılacaklar:** Site başına N bağlantılık havuz; kuyruk havuzdan bağlantı kiralayıp iade etsin; FTP'nin seri doğasını havuzla aş.
- **Çıktı dosyaları:** `src/main/transfer/ConnectionPool.ts`.
- **Bitti Kriteri:** Aynı anda 2–4 transfer paralel ilerliyor.

### G3.4 — Site Yöneticisi (Site Manager)
- **Amaç:** Kayıtlı bağlantılar, klasörlü.
- **Yapılacaklar:** CRUD; klasörle gruplama; protokol/encoding/transfer modu ayarları; çift tıkla bağlan.
- **Çıktı dosyaları:** `src/renderer/src/views/SiteManager.vue`, `src/main/store/sites.ts`.
- **Bitti Kriteri:** Site kaydedilip yeniden bağlanılabiliyor.

### G3.5 — Şifreli kimlik deposu + ana parola
- **Amaç:** Kimlik bilgisi güvenliği.
- **Yapılacaklar:** Electron `safeStorage` (OS keychain) ile şifrele; opsiyonel ana parola; düz metin asla diskte değil.
- **Çıktı dosyaları:** `src/main/store/vault.ts`.
- **Bitti Kriteri:** Parolalar şifreli saklanıyor; disk dosyasında düz metin yok.

### G3.6 — TLS sertifika onay diyaloğu
- **Amaç:** Self-signed sertifikalarda açık onay.
- **Yapılacaklar:** Sertifika detayını göster; "bu kez / her zaman güven"; `rejectUnauthorized` yönetimi.
- **Bitti Kriteri:** Self-signed FTPS sunucusunda kullanıcı onayıyla bağlanılıyor.

### G3.7 — Dizin senkronizasyonu (mirror)
- **Amaç:** Tek/çift yönlü senkron.
- **Yapılacaklar:** Karşılaştırma (boyut+mtime), fark listesi önizleme, seçili aktarım.
- **Bitti Kriteri:** Yerel↔uzak fark doğru hesaplanıp uygulanıyor.

### G3.8 — Edit-in-place
- **Amaç:** Uzak dosyayı yerelde aç → düzenle → otomatik geri yükle.
- **Yapılacaklar:** Geçici dosyaya indir, sistem editöründe aç, değişiklik izle, geri yükle.
- **Bitti Kriteri:** Düzenlenen dosya otomatik uzağa yükleniyor.

### G3.9 — Bant genişliği sınırlama (throttling)
- **Amaç:** İndirme/yükleme hız limiti.
- **Yapılacaklar:** Stream throttle; global ve per-transfer limit ayarı.
- **Bitti Kriteri:** Ayarlanan limit ölçülebilir şekilde uygulanıyor.

### G3.10 — i18n + tema + ayarlar ekranı
- **Amaç:** Çoklu dil (TR/EN), tema, kullanıcı tercihleri.
- **Yapılacaklar:** `vue-i18n`; tema seçimi; transfer/bağlantı varsayılanları ayar ekranı.
- **Bitti Kriteri:** Dil/tema anında değişiyor; ayarlar kalıcı.

### G3.11 — FTPS implicit + gelişmiş TLS
- **Amaç:** Eski sistem uyumu.
- **Yapılacaklar:** `secure: 'implicit'` (port 990); TLS sürüm/şifre seçenekleri.
- **Bitti Kriteri:** Implicit FTPS sunucusuna bağlanılıyor.

---

## Faz 4 — Paketleme, Test, Yayın (Süreklilik)

### G4.1 — electron-builder paketleme + kod imzalama
- **Yapılacaklar:** mac (dmg, notarization), win (nsis, imza), linux (AppImage/deb); auto-update altyapısı (`electron-updater`).
- **Bitti Kriteri:** Üç platformda kurulabilir paket üretiliyor.

### G4.2 — Test paketi
- **Yapılacaklar:** Vitest (adaptör/kuyruk birim testleri), Playwright (uçtan uca UI), Docker sunuculara karşı entegrasyon.
- **Bitti Kriteri:** CI'da testler yeşil.

### G4.3 — Sunucu uyumluluk matrisi
- **Yapılacaklar:** vsftpd · ProFTPD · Pure-FTPd · FileZilla Server · IIS FTP (DOS listeleme!) · OpenSSH SFTP. Her birinde listeleme/transfer/resume/encoding doğrula.
- **Bitti Kriteri:** Matris tablosu (sunucu × özellik) dolduruldu, bilinen kısıtlar belgelendi.

### G4.4 — Güvenlik sertleştirme denetimi
- **Yapılacaklar:** CSP, `sandbox`, contextIsolation doğrulama; FTP bounce (`allowSeparateTransferHost` kapalı); bağımlılık denetimi (`npm audit`).
- **Bitti Kriteri:** Güvenlik kontrol listesi (rapor §9) tam karşılandı.

---

## Hedef Dizin Yapısı

```
ferro/
├─ electron.vite.config.ts
├─ package.json
├─ src/
│  ├─ main/                      # Node.js ana süreç
│  │  ├─ index.ts                # pencere + yaşam döngüsü
│  │  ├─ core/                   # logger, config
│  │  ├─ ipc/                    # router + handlers/
│  │  ├─ transfer/
│  │  │  ├─ IFileTransferClient.ts
│  │  │  ├─ types.ts
│  │  │  ├─ adapters/            # FtpAdapter, SftpAdapter
│  │  │  ├─ SessionManager.ts
│  │  │  ├─ TransferQueue.ts
│  │  │  └─ ConnectionPool.ts
│  │  └─ store/                  # vault, sites, knownHosts
│  ├─ preload/
│  │  └─ index.ts                # contextBridge
│  ├─ shared/                    # ipc.ts, errors.ts, types
│  └─ renderer/
│     └─ src/
│        ├─ App.vue
│        ├─ views/               # DualPaneView, SiteManager, Settings
│        ├─ components/          # Panes, QuickConnect, TransferQueue, LogPanel
│        ├─ stores/              # Pinia
│        ├─ plugins/             # vuetify, i18n
│        └─ router/
├─ test/
│  ├─ docker-compose.yml
│  └─ ...
└─ resources/                    # ikonlar, statik
```

---

## Özet Yol Haritası

| Sprint | Kapsam | Sürüm |
|--------|--------|-------|
| 0 | İskelet · IPC · Vuetify/Pinia | — |
| 1 | FTP/FTPS bağlan + listele + tek dosya + log | **v0.1 MVP** |
| 2 | Çift panel + kuyruk + DnD + ilerleme | — |
| 3 | Dosya işlemleri + recursive + resume + keep-alive | **v0.2** |
| 4 | SFTP + host key + bağlantı havuzu | **v0.3** |
| 5 | Site Manager + şifreli depo + TLS onayı | **v0.4** |
| 6 | Senkron + edit-in-place + throttle + i18n + implicit | **v0.5** |
| Sürekli | Paketleme · test · uyumluluk matrisi · güvenlik | **v1.0** |

---

## Alınan Kararlar (2026-06-29)

1. **Mimari:** ✅ **Electron masaüstü** (raporun önerisi). `stackvo.json` buna göre güncellenecek.
2. **MVP kapsamı:** ✅ **SFTP dahil** — ilk sürümde FTP + FTPS + SFTP üç protokol birden. Bu nedenle SFTP adaptörü (`G3.1`) ve host key doğrulama (`G3.2`) **Sprint 1'e** çekildi (aşağıda `G1.9`, `G1.10`).
3. **Hedef platformlar:** Açık — paketleme aşamasında (G4.1) netleşecek; başlangıçta geliştirme makinesi (macOS) önceliklidir.

### MVP'ye eklenen adımlar (SFTP dahil kararı gereği)
- **G1.9 — SFTP adaptörü (`ssh2-sftp-client`):** içerik `G3.1` ile aynı; MVP'ye çekildi.
- **G1.10 — Host key doğrulama (TOFU):** içerik `G3.2` ile aynı; MVP'ye çekildi.

> Başlangıç: **G0.1**'den başla. Sprint 0 → SFTP dahil MVP (Sprint 1) → gerçek Docker sunucularına (vsftpd + OpenSSH) karşı doğrula.
