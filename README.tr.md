<div align="center">

# Ferro

**Modern, güvenli ve hızlı FTP / FTPS / SFTP istemcisi**

Dosyalarınızı sunucularınıza güvenle taşıyın — macOS, Windows ve Linux'ta.

[![CI](https://github.com/fahrettinaksoy/ferro/actions/workflows/ci.yml/badge.svg)](https://github.com/fahrettinaksoy/ferro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/fahrettinaksoy/ferro?label=%C4%B0ndir&color=success)](https://github.com/fahrettinaksoy/ferro/releases/latest)

[**⬇ İndir**](https://github.com/fahrettinaksoy/ferro/releases/latest) · [Özellikler](#neden-ferro) · [Hızlı Başlangıç](#hızlı-başlangıç) · [SSS](#sık-sorulan-sorular)

_English documentation: [README.md](README.md)_

</div>

---

## Ekran Görüntüleri

<!--
  Ekran görüntüleri docs/screenshots/ dizinine eklenecek.
  Önerilen dosyalar: main.png, site-manager.png, transfer-queue.png,
  settings.png, theme-studio.png, sync.png
-->

<table>
  <tr>
    <td align="center" width="50%">
      <!-- <img src="docs/screenshots/main.png" alt="Ana ekran — çift panel görünümü" /> -->
      <em>Ana ekran — çift panel görünümü</em>
    </td>
    <td align="center" width="50%">
      <!-- <img src="docs/screenshots/site-manager.png" alt="Site Yöneticisi" /> -->
      <em>Site Yöneticisi</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <!-- <img src="docs/screenshots/transfer-queue.png" alt="Transfer kuyruğu" /> -->
      <em>Transfer kuyruğu</em>
    </td>
    <td align="center" width="50%">
      <!-- <img src="docs/screenshots/settings.png" alt="Ayarlar" /> -->
      <em>Ayarlar</em>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <!-- <img src="docs/screenshots/theme-studio.png" alt="Tema stüdyosu" /> -->
      <em>Tema stüdyosu</em>
    </td>
    <td align="center" width="50%">
      <!-- <img src="docs/screenshots/sync.png" alt="Dizin senkronizasyonu" /> -->
      <em>Dizin senkronizasyonu</em>
    </td>
  </tr>
</table>

> Ekran görüntüleri ilk halka açık sürümden önce eklenecektir.

---

## Neden Ferro?

### 🔒 Parolalarınız güvende

- Parolalarınız **işletim sisteminizin anahtar zincirinde şifrelenir** — diskte asla düz metin durmaz. İsterseniz bunun yerine bir **ana parola** belirleyebilirsiniz.
- Şifreli bağlantılarda (FTPS) kimlik bilgileriniz, **kimliği doğrulanmamış bir sunucuya asla gönderilmez**.
- Bağlandığınız sunucunun kimliği ilk bağlantıda kaydedilir; sonradan **değişirse sizi açıkça uyarır** — araya giren sahte sunuculara (MITM) karşı koruma sağlar.
- Dilerseniz parolayı hiç kaydetmeyip her bağlantıda sorulmasını seçebilirsiniz.

### ⚡ Hızlı ve kesintiye dayanıklı transferler

- **Paralel transfer** — aynı anda birden fazla dosya, bağlantı havuzuyla.
- **Kaldığı yerden devam** — bağlantı koptuğunda yarım kalan indirme/yükleme baştan başlamaz.
- **Otomatik yeniden bağlanma** — geçici hatalarda transferi kendisi toparlar.
- **Hız sınırı** — arka planda çalışırken internetinizi tüketmesin diye bant genişliğini sınırlayabilirsiniz.
- Dosya çakışmalarında ne yapılacağını siz seçersiniz: sor, üzerine yaz, yeniyse yaz, sürdür, yeniden adlandır, atla.

### 🗂 Günlük işleri kolaylaştıran arayüz

- **Çift panel** — solda bilgisayarınız, sağda sunucu; **sürükle-bırak** ile dosya ve klasör aktarın.
- **Site Yöneticisi** — sunucularınızı klasörleyin, renk etiketleri verin, site başına ayarları özelleştirin.
- **Yerinde düzenleme** — sunucudaki dosyaya çift tıklayın, kendi editörünüzde düzenleyin; kaydettiğinizde otomatik yüklenir.
- **Dizin senkronizasyonu** — yerel ve uzak klasörü karşılaştırın, yalnızca farkları aktarın.
- **Protokol günlüğü** — merak ederseniz sunucuyla konuşulan her komutu görün.

### 🎨 Size uyum sağlar

- **Tema stüdyosu** — tek bir renk seçin, uygulama tüm temayı ondan üretsin: açık/koyu mod, 9 renk şeması, 3 kontrast seviyesi.
- **Türkçe ve İngilizce** arayüz.
- **Otomatik güncelleme** — yeni sürümler kendiliğinden gelir.

### Desteklenen protokoller

| Protokol | Ne zaman kullanılır?                                                  |
| -------- | --------------------------------------------------------------------- |
| **SFTP** | SSH erişiminiz olan sunucular — en güvenli ve yaygın seçenek          |
| **FTPS** | TLS şifrelemeli FTP (explicit ve implicit) — klasik hosting panelleri |
| **FTP**  | Şifrelemesiz eski sunucular — yalnızca güvenilir ağlarda önerilir     |

---

## Kurulum

Platformunuza uygun paketi [**Releases**](https://github.com/fahrettinaksoy/ferro/releases/latest) sayfasından indirin:

| Platform    | Paket                                                 |
| ----------- | ----------------------------------------------------- |
| **macOS**   | `Ferro-<sürüm>-<mimari>.dmg` — Apple Silicon ve Intel |
| **Windows** | `Ferro-<sürüm>-x64.exe` — kurulum sihirbazı           |
| **Linux**   | `Ferro-<sürüm>-x64.AppImage` veya `.deb`              |

Kurulumdan sonra uygulama güncellemeleri kendiliğinden alır; sıklığı ve kanalı Ayarlar → Güncellemeler'den değiştirebilirsiniz.

## Hızlı Başlangıç

1. Ferro'yu açın — **Site Yöneticisi** sizi karşılar.
2. **Yeni site** oluşturun: protokolü seçin (SFTP önerilir), sunucu adresi, kullanıcı adı ve parolanızı girin.
3. **Bağlan** deyin. İlk bağlantıda sunucunun kimliği size gösterilir ve onayınızla kaydedilir.
4. Sol panel bilgisayarınız, sağ panel sunucudur — dosyaları **sürükleyip bırakın** ya da çift tıklayın.
5. Transferlerin durumunu alttaki kuyruk panelinden izleyin.

## Klavye Kısayolları

| Kısayol          | İşlev                 |
| ---------------- | --------------------- |
| <kbd>⌘ ,</kbd>   | Ayarlar               |
| <kbd>⌘ S</kbd>   | Site Yöneticisi       |
| <kbd>⌘ ⇧ S</kbd> | Dizin senkronizasyonu |
| <kbd>⌘ B</kbd>   | Sunucular paneli      |
| <kbd>⌘ J</kbd>   | Transfer kuyruğu      |
| <kbd>⌘ L</kbd>   | Günlük paneli         |
| <kbd>F5</kbd>    | Yenile                |
| <kbd>⌘ /</kbd>   | Tüm kısayollar        |

_Windows/Linux'ta <kbd>⌘</kbd> yerine <kbd>Ctrl</kbd> kullanılır._

## Sık Sorulan Sorular

**Parolalarım nerede saklanıyor?**
İşletim sisteminizin güvenli anahtar zincirinde (macOS Keychain, Windows Credential Manager, Linux Secret Service) şifrelenmiş olarak. İsterseniz bunun yerine bir ana parola belirleyebilir ya da parolaların hiç kaydedilmemesini seçebilirsiniz.

**FileZilla'dan geçebilir miyim?**
Evet — Ferro aynı temel iş akışını (çift panel, site yöneticisi, transfer kuyruğu) modern bir arayüz ve varsayılan olarak güvenli davranışlarla sunar. Site kayıtlarınızı şimdilik elle taşımanız gerekir.

**Aktif FTP modu destekleniyor mu?**
Şimdilik hayır; Ferro pasif mod kullanır. Günümüz sunucularının ve NAT arkasındaki ağların büyük çoğunluğu pasif modla sorunsuz çalışır.

**Hangi sunucularla test edildi?**
vsftpd ve OpenSSH ile otomatik testlerden geçer; Pure-FTPd ve ProFTPD elle doğrulanmıştır. Ayrıntılı uyumluluk matrisi: [test/COMPATIBILITY.md](test/COMPATIBILITY.md)

**Bir sorun buldum, nereye bildireyim?**
[GitHub Issues](https://github.com/fahrettinaksoy/ferro/issues) üzerinden. Güvenlik açıklarını lütfen herkese açık issue yerine özel kanaldan bildirin — bkz. [SECURITY.md](SECURITY.md)

---

## Geliştiriciler İçin

Ferro açık kaynaklıdır: Electron + Vue 3 + TypeScript ile geliştirilmiştir.

- **Mimari, geliştirme ortamı, test ve yayınlama:** [docs/DEVELOPMENT.tr.md](docs/DEVELOPMENT.tr.md)
- **Katkı rehberi:** [CONTRIBUTING.md](CONTRIBUTING.md) · **Davranış kuralları:** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

```bash
git clone https://github.com/fahrettinaksoy/ferro.git
cd ferro && npm install && npm run dev
```

## Lisans

[MIT](LICENSE) © Fahrettin Aksoy
