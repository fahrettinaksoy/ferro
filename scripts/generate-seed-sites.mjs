// Ferro — 48 karışık türde sahte (seed) bağlantı üretici.
//
// StoredSite formatında (src/main/store/sites.ts) bir sites.json üretir.
// Parolalar vault'un taşınabilir base64 fallback formatında ('p0:') saklanır;
// böylece OS keychain (safeStorage) olmadan da açılırlar — dev/test için idealdir.
//
// Kullanım:
//   node scripts/generate-seed-sites.mjs                 -> seed/sites.seed.json üretir
//   node scripts/generate-seed-sites.mjs --install       -> userData/sites.json'a da yazar
//
// Not: --install mevcut sites.json'ın ÜZERİNE YAZAR. Gerçek bağlantılarınız varsa kullanmayın.

import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const DEFAULT_PORT = { ftp: 21, ftps: 21, 'ftps-implicit': 990, sftp: 22 }

/** Düz metni vault'un taşınabilir (güvensiz) fallback formatında şifreler. */
const enc = (plain) => 'p0:' + Buffer.from(plain, 'utf8').toString('base64')

// 48 bağlantı: 4 protokol arası karışık, çeşitli klasörler/portlar/seçeneklerle.
// [name, protocol, host, folder, user, opts?]
const specs = [
  // — Production —
  ['Web Sunucusu (App)', 'sftp', 'app01.ferro.example.com', 'Production', 'deploy'],
  ['Web Sunucusu (App2)', 'sftp', 'app02.ferro.example.com', 'Production', 'deploy'],
  ['API Gateway', 'sftp', 'api.ferro.example.com', 'Production', 'svc-api', { port: 2222 }],
  ['Yük Dengeleyici', 'sftp', 'lb.ferro.example.com', 'Production', 'root'],
  ['Statik İçerik (FTPS)', 'ftps', 'static.ferro.example.com', 'Production', 'static-ftp'],
  ['Medya Deposu', 'ftps-implicit', 'media.ferro.example.com', 'Production', 'media', { rejectUnauthorized: false }],
  ['Ödeme Servisi', 'sftp', 'pay.ferro.example.com', 'Production', 'pay-svc', { port: 50022 }],
  ['Kuyruk İşleyici', 'sftp', 'worker.ferro.example.com', 'Production', 'worker'],

  // — Staging —
  ['Staging Web', 'sftp', 'staging.ferro.example.com', 'Staging', 'deploy'],
  ['Staging API', 'ftps', 'api.staging.ferro.example.com', 'Staging', 'qa-ftp', { rejectUnauthorized: false }],
  ['Staging DB Dosyaları', 'sftp', 'db.staging.ferro.example.com', 'Staging', 'dbadmin'],
  ['QA Test Sunucu', 'ftp', 'qa.ferro.example.com', 'Staging', 'qa', { encoding: 'latin1' }],
  ['UAT Ortamı', 'ftps', 'uat.ferro.example.com', 'Staging', 'uatuser'],

  // — Development —
  ['Dev Box (Local VM)', 'ftp', '192.168.1.50', 'Development', 'dev', { port: 2121 }],
  ['Dev Box (Docker)', 'sftp', '127.0.0.1', 'Development', 'ferro', { port: 2222 }],
  ['Test FTP (vsftpd)', 'ftp', '127.0.0.1', 'Development', 'ferro', { port: 21 }],
  ['Test SFTP (atmoz)', 'sftp', 'localhost', 'Development', 'ferro', { port: 2200 }],
  ['Feature Branch Demo', 'sftp', 'demo.ferro.example.com', 'Development', 'demo'],
  ['Sandbox', 'ftps', 'sandbox.ferro.example.com', 'Development', 'sandbox', { rejectUnauthorized: false }],

  // — Backups —
  ['Yedek Sunucu (Gece)', 'sftp', 'backup01.ferro.example.com', 'Backups', 'backup'],
  ['Yedek Sunucu (Haftalık)', 'sftp', 'backup02.ferro.example.com', 'Backups', 'backup', { port: 2222 }],
  ['Off-site Yedek', 'ftps-implicit', 'offsite.ferro.example.com', 'Backups', 'archive', { rejectUnauthorized: false }],
  ['Veritabanı Dump Arşivi', 'sftp', 'dumps.ferro.example.com', 'Backups', 'pgdump'],
  ['Log Arşivi', 'ftps', 'logs.ferro.example.com', 'Backups', 'logship'],

  // — CDN / Edge —
  ['CDN Origin (EU)', 'ftps-implicit', 'origin-eu.cdn.example.com', 'CDN', 'cdn-eu'],
  ['CDN Origin (US)', 'ftps-implicit', 'origin-us.cdn.example.com', 'CDN', 'cdn-us'],
  ['CDN Origin (APAC)', 'ftps', 'origin-ap.cdn.example.com', 'CDN', 'cdn-ap', { rejectUnauthorized: false }],
  ['Edge Cache Node 1', 'sftp', 'edge1.cdn.example.com', 'CDN', 'edge'],

  // — Müşteriler (Clients) —
  ['Acme Corp', 'ftps', 'ftp.acme-corp.example', 'Müşteriler', 'ferro-acme'],
  ['Globex', 'sftp', 'sftp.globex.example', 'Müşteriler', 'globex', { port: 2022 }],
  ['Initech', 'ftp', 'ftp.initech.example', 'Müşteriler', 'initech', { encoding: 'latin1' }],
  ['Umbrella Health', 'ftps-implicit', 'secure.umbrella.example', 'Müşteriler', 'umbrella', { rejectUnauthorized: false }],
  ['Wonka Industries', 'sftp', 'transfer.wonka.example', 'Müşteriler', 'wonka'],
  ['Stark Endüstri', 'ftps', 'edi.stark.example', 'Müşteriler', 'stark-edi'],
  ['Wayne Holding', 'sftp', 'files.wayne.example', 'Müşteriler', 'wayne', { port: 4422 }],

  // — Genel / Anonim Aynalar (Public Mirrors) —
  ['Debian Aynası', 'ftp', 'ftp.debian.org', 'Aynalar', 'anonymous', { anonymous: true }],
  ['GNU Aynası', 'ftp', 'ftp.gnu.org', 'Aynalar', 'anonymous', { anonymous: true }],
  ['Mozilla Aynası', 'ftp', 'ftp.mozilla.org', 'Aynalar', 'anonymous', { anonymous: true }],
  ['Kernel.org', 'ftp', 'mirrors.kernel.org', 'Aynalar', 'anonymous', { anonymous: true }],
  ['Ubuntu Releases', 'ftp', 'releases.ubuntu.com', 'Aynalar', 'anonymous', { anonymous: true }],

  // — Bulut / Sağlayıcılar —
  ['AWS EC2 (Bastion)', 'sftp', 'bastion.eu-central-1.example', 'Bulut', 'ec2-user', { port: 22 }],
  ['DigitalOcean Droplet', 'sftp', 'do-fra1.example', 'Bulut', 'root'],
  ['Hetzner Storage Box', 'ftps-implicit', 'u123456.your-storagebox.de', 'Bulut', 'u123456'],
  ['Hetzner Storage (SFTP)', 'sftp', 'u123456.your-storagebox.de', 'Bulut', 'u123456', { port: 23 }],
  ['OVH VPS', 'sftp', 'vps.ovh.example', 'Bulut', 'ubuntu'],
  ['Azure Web App', 'ftps', 'waws-ferro.ftp.azurewebsites.windows.net', 'Bulut', '$ferro', { rejectUnauthorized: false }],
  ['Google Cloud VM', 'sftp', 'gcp-vm.example', 'Bulut', 'gcpuser', { port: 22 }],
  ['Cloudflare R2 Gateway', 'ftps', 'r2-gw.example', 'Bulut', 'r2-access']
]

if (specs.length !== 48) {
  console.error(`Beklenen 48, bulunan ${specs.length} kayıt — düzeltin.`)
  process.exit(1)
}

const sites = specs.map(([name, protocol, host, folder, user, opts = {}]) => {
  const port = opts.port ?? DEFAULT_PORT[protocol]
  const rec = { id: randomUUID(), name, folder, protocol, host, port, user }
  if (opts.anonymous) rec.anonymous = true
  if (opts.encoding) rec.encoding = opts.encoding
  if (opts.rejectUnauthorized === false) rec.rejectUnauthorized = false
  // Anonim girişlerde parola yok; diğerlerine sahte parola.
  if (!opts.anonymous) rec.secret = enc('ferropass')
  return rec
})

const json = JSON.stringify(sites, null, 2)

// 1) Repo içine tekrar kullanılabilir seed.
const seedPath = join(repoRoot, 'seed', 'sites.seed.json')
mkdirSync(dirname(seedPath), { recursive: true })
writeFileSync(seedPath, json, 'utf8')
console.log(`✓ ${seedPath} (${sites.length} bağlantı)`)

// Protokol dağılımı özeti.
const dist = sites.reduce((m, s) => ((m[s.protocol] = (m[s.protocol] || 0) + 1), m), {})
console.log('  Dağılım:', dist)

// 2) İsteğe bağlı: gerçek userData konumuna kur.
if (process.argv.includes('--install')) {
  const userData = join(os.homedir(), 'Library', 'Application Support', 'ferro')
  mkdirSync(userData, { recursive: true })
  const target = join(userData, 'sites.json')
  writeFileSync(target, json, 'utf8')
  console.log(`✓ Kuruldu: ${target}`)
}
