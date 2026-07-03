# Sunucu Uyumluluk Matrisi

"Tüm sunucuları desteklemek" hedefi, protokolden çok **sunucu davranış farklılıklarını** (dizin
listeleme formatı, pasif mod, encoding, TLS) doğru ele almaktır. Bu matris test durumunu izler.

## Durum

| Sunucu                         | Protokol | Listeleme formatı    | Durum            | Not                                                                                             |
| ------------------------------ | -------- | -------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| **vsftpd** (delfer/alpine-ftp) | FTP      | MLSD / Unix LIST     | ✅ Otomatik test | `localhost:21` — 6+ test geçiyor                                                                |
| **OpenSSH SFTP** (atmoz/sftp)  | SFTP     | SFTP stat            | ✅ Otomatik test | `localhost:2222` — host key TOFU dahil                                                          |
| **Pure-FTPd** (stilliard)      | FTP/FTPS | Unix LIST            | 🟡 Manuel        | `--profile extended`, `localhost:2121`                                                          |
| **ProFTPD** (kibatic)          | FTP/FTPS | Unix LIST            | 🟡 Manuel        | `--profile extended`, `localhost:2122`                                                          |
| **Microsoft IIS FTP**          | FTP      | **DOS/Windows LIST** | ⬜ Yapılmadı     | Linux Docker'da çalışmaz (Windows). basic-ftp DOS parser'ı var; gerçek IIS'e karşı doğrulanmalı |
| **FileZilla Server**           | FTP/FTPS | Unix/MLSD            | ⬜ Yapılmadı     | Windows. Manuel test gerekir                                                                    |

## Çalıştırma

```bash
# Otomatik test sunucuları (vsftpd + OpenSSH)
docker compose -f test/docker-compose.yml up -d
npm test

# Genişletilmiş sunucular (Pure-FTPd + ProFTPD)
docker compose -f test/docker-compose.yml --profile extended up -d
```

## Manuel test prosedürü (her sunucu için)

1. Bağlan (FTP + varsa FTPS).
2. Kök dizini listele → ad/boyut/tarih/izin doğru mu? (özellikle **IIS DOS formatı**).
3. Türkçe karakterli dosya adı yükle/indir/listele (UTF-8 + Latin-1/win1254 encoding).
4. Büyük dosya transferini yarıda kes → resume (REST) ile tamamla.
5. Recursive klasör transferi.
6. Pasif mod (NAT/firewall arkası) — `basic-ftp` yalnızca pasif destekler.

## Bilinen kısıtlar

- **Aktif mod:** `basic-ftp` yalnızca pasif (PASV/EPSV) destekler. Aktif mod gereken nadir sunucularda transfer başarısız olur.
- **DOS listeleme:** IIS FTP `MM-DD-YY ... <DIR> ad` formatı kullanır; gerçek IIS'e karşı test edilmeli.
- **Tarih/saat dilimi:** LIST (MLSD olmayan) çıktısında tarihler güvenilmez; `basic-ftp` yalnızca MLSD'de kesin tarih verir.
