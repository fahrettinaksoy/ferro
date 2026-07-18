# Ferro — Tauri v2 Mimari & Durum

Ferro, **saf Rust/Tauri v2** üzerine kurulu, güvenlik-odaklı bir FTP/FTPS/SFTP
masaüstü istemcisidir. Bu belge mimariyi, modül haritasını ve önceki masaüstü
sürümünden geçişte kullanıcıyı etkileyen notları özetler.

## Mimari

- **Backend:** Yerel çekirdeğin (FTP/FTPS/SFTP, vault, sync, team) tamamı **Rust**'tadır.
  Node.js yoktur; sidecar yoktur.
- **Frontend:** Vue 3 + Vuetify + Pinia renderer. Köprü `window.ferro`
  ([tauriBridge.ts](../src/renderer/src/lib/tauriBridge.ts)) Tauri `invoke`/`listen`
  üzerine kurulur; renderer kaynağı köprü katmanından bağımsızdır.
- **IPC:** renderer `window.ferro.invoke(channel, payload)` → Rust `bridge_invoke`
  komutu → dispatch. Her çağrı bir `IpcResult` zarfı döndürür
  (`{ok:true,data}|{ok:false,error}`). ~60 kanalın tamamı Rust'ta uygulanır.

## Modül haritası (`src-tauri/src/`)

| Modül                 | Sorumluluk                                                                  |
| --------------------- | --------------------------------------------------------------------------- |
| `bridge.rs`           | Tek `bridge_invoke` komutu + kanal dispatch + `emit_event`                  |
| `error.rs`            | `FerroError`/`FerroErrorCode`/`SerializedError`                             |
| `types.rs`            | Tüm alan tipleri (serde, camelCase)                                         |
| `store/json_store.rs` | Atomik + sürümlü + bozulma karantinalı JSON                                 |
| `store/sites.rs`      | Site deposu (seed, upsert, import/export, vault geçişi)                     |
| `vault.rs`            | Kimlik şifreleme: master (`m1:`) + keyring (`k1:`)                          |
| `settings.rs`         | Çalışma zamanı ayarları + varsayılanlar                                     |
| `localfs.rs`          | Guard'lı yerel FS                                                           |
| `handlers.rs`         | IPC handler'ları                                                            |
| `logger.rs`           | Rotasyonlu dosya loglaması                                                  |
| `menu.rs`             | Native uygulama menüsü                                                      |
| `updater.rs`          | Otomatik güncelleme (tauri-plugin-updater)                                  |
| `transfer/`           | SFTP/FTP istemcileri, oturum yöneticisi, kuyruk, TOFU, proxy, edit-in-place |
| `sync/` , `team/`     | Uçtan uca şifreli senkronizasyon ve ekip paylaşımı                          |
| `crypto.rs`           | Sync/Team paylaşılan kripto primitifleri                                    |
| `paths.rs`            | Uygulama dizinleri (Tauri path API)                                         |

### Transfer motoru

Her oturum kendi çok-thread'li tokio runtime'ını sahiplenir; bloklayan istemci
metotları içeride `block_on` yapar, handler'lar `spawn_blocking` ile çağırır.
SFTP `russh`+`russh-sftp` ile async, FTP `suppaftp` ile senkron; ikisi de tek
`TransferClient` trait'i ardında. Transferler ayrı bağlantı kullanır (tarama
bloklanmaz); bant genişliği throttle, resume, retry, iptal ve dizin yürüyüşü desteklenir.

## Kripto uyumluluğu

Byte-düzenleri modüle göre farklıdır; mevcut şifreli verilerle uyum için korunur:

- **vault `m1:`** → `base64(iv[12] ‖ tag[16] ‖ ct)`, scrypt(N=16384,r=8,p=1)+AES-256-GCM.
- **sync & team** → `data = base64(ct ‖ tag)`, `iv` ayrı alanda.
- Güvensiz dosyalarda KDF sınırı: `N≤2^20, r≤16, p≤4`.

## Geçiş notları (kullanıcı etkisi)

1. **Veri dizini değişir.** Önceki masaüstü sürümü veriyi uygulama ADIYLA
   (`~/Library/Application Support/Ferro`) tutuyordu; Tauri identifier tabanlıdır
   (`~/Library/Application Support/com.ferro.app`). İlk açılışta **temiz profil**
   kullanılır; siteler `sites.seed.json`'dan tohumlanır.
2. **Eski `v1:` parolalar çözülemez.** Önceki OS anahtar zinciri (safeStorage) blob'ları
   Rust `keyring` ile uyumlu değildir → kayıtlı parolalar bir kez yeniden girilir.
   Master-parola (`m1:`) verisi taşınabilir. `p0:` (demo seed) okunur.

## Build / geliştirme

```bash
npm run dev          # yalnız Vite web önizleme (http://localhost:1420)
npm run tauri:dev    # native masaüstü penceresi
npm run build        # web build (typecheck + vite build)
npm run tauri:build  # masaüstü paket üret
npm run typecheck    # vue-tsc
npm test             # Vue bileşen testleri (Vitest)
```

## Auto-updater'ı etkinleştirme

`tauri signer generate` ile anahtar üret → `tauri.conf.json`'a `plugins.updater`
(endpoints + pubkey) ekle → özel anahtarı `TAURI_SIGNING_PRIVATE_KEY` CI secret'i yap.
Yapılandırma yoksa açılış kontrolü sessizce atlanır.
