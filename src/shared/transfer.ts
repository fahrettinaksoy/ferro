// Protokolden bağımsız transfer alan tipleri. Hem main (motor) hem renderer (UI) kullanır.

export type Protocol = 'ftp' | 'ftps' | 'ftps-implicit' | 'sftp'

export type EntryType = 'file' | 'directory' | 'symlink' | 'unknown'

/** Bir uzak dizin girdisi (protokol-agnostik normalize edilmiş). */
export interface RemoteEntry {
  name: string
  type: EntryType
  size: number
  /** Değişiklik zamanı (epoch ms). Sunucu vermezse null. */
  modifiedAt: number | null
  /** Unix izinleri (örn. 0o755) — biliniyorsa. */
  permissions: number | null
  /** Sahip kullanıcı: SFTP'de uid, FTP'de kullanıcı adı — biliniyorsa. */
  owner?: string | null
  /** Sahip grup: SFTP'de gid, FTP'de grup adı — biliniyorsa. */
  group?: string | null
  /** Sembolik link hedefi (type === 'symlink'). */
  linkTarget?: string
}

/** Kullanıcı tarafından girilen/saklanan bağlantı yapılandırması. */
export interface ConnectionConfig {
  protocol: Protocol
  host: string
  port: number
  user: string
  password?: string
  /** SFTP için özel anahtar (PEM). */
  privateKey?: string
  passphrase?: string
  /** Anonim FTP girişi. */
  anonymous?: boolean
  /** Kontrol bağlantısı karakter kodlaması (FTP). Varsayılan utf8. */
  encoding?: string
  /** Self-signed TLS sertifikalarını kabul et (FTPS). */
  rejectUnauthorized?: boolean
  /** Paralel transfer için en fazla bağlantı (site ayarı; varsayılan 3, 1-10). */
  maxConnections?: number
}

/** Bir protokol için varsayılan port. */
export function defaultPort(protocol: Protocol): number {
  switch (protocol) {
    case 'ftps-implicit':
      return 990
    case 'sftp':
      return 22
    default:
      return 21
  }
}

/** Transfer ilerleme bildirimi (main → renderer). */
export interface TransferProgress {
  /** Aktarılan bayt. */
  bytes: number
  /** Toplam bayt (biliniyorsa). */
  total: number | null
}

export type TransferDirection = 'download' | 'upload'

export type TransferJobStatus = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled'

/** Transfer kuyruğundaki bir iş (main ↔ renderer ortak durumu). */
export interface TransferJob {
  id: string
  sessionId: string
  direction: TransferDirection
  name: string
  remotePath: string
  localPath: string
  status: TransferJobStatus
  bytes: number
  total: number | null
  error?: string
  /** Kaçıncı deneme (0 = ilk). Geçici hatalarda kuyruk otomatik yeniden dener. */
  attempt?: number
}

/** FTP aktarım modu (Aktarım ayarları sekmesi). */
export type TransferMode = 'default' | 'active' | 'passive'

/**
 * Site Yöneticisi'nin gelişmiş sekmelerindeki alanlar (Genel/Gelişmiş/Aktarım/
 * Karakter kümesi). Tamamı opsiyonel ve site başına saklanır; bir kısmı şu an
 * yalnızca UI'da tutulur (motora bağlanması ayrı iş), `encoding` ise bağlantıda kullanılır.
 */
export interface SiteAdvanced {
  /** Genel: serbest not. */
  comment?: string
  /** Genel: kenar çubuğu/listede renk etiketi (örn. 'red', 'green'). */
  colorLabel?: string
  /** Gelişmiş: sunucu türü (örn. 'unix', 'windows', 'auto'). */
  serverType?: string
  /** Gelişmiş: vekil sunucu atlansın. */
  bypassProxy?: boolean
  /** Gelişmiş: varsayılan yerel klasör. */
  localDir?: string
  /** Gelişmiş: varsayılan uzak klasör. */
  remoteDir?: string
  /** Gelişmiş: eş zamanlı tarama. */
  syncBrowsing?: boolean
  /** Gelişmiş: klasör karşılaştırma. */
  dirComparison?: boolean
  /** Gelişmiş: sunucu saat dilimi farkı (saat bileşeni). */
  timezoneHours?: number
  /** Gelişmiş: sunucu saat dilimi farkı (dakika bileşeni). */
  timezoneMinutes?: number
  /** Aktarım: yöntem (varsayılan/aktif/pasif). */
  transferMode?: TransferMode
  /** Aktarım: eş zamanlı bağlantı sayısı sınırlansın. */
  limitConnections?: boolean
  /** Aktarım: en fazla bağlantı sayısı. */
  maxConnections?: number
}

/** Kaydedilmiş bir bağlantı (Site Yöneticisi). Parola İÇERMEZ — yalnızca var/yok bilgisi. */
export interface SavedSite extends SiteAdvanced {
  id: string
  name: string
  folder?: string
  protocol: Protocol
  host: string
  port: number
  user: string
  anonymous?: boolean
  /** Parola kaydedilmez; her bağlanışta sorulur (oturum boyunca hatırlanabilir). */
  askPassword?: boolean
  encoding?: string
  rejectUnauthorized?: boolean
  hasPassword: boolean
}

/** Site kaydetme/güncelleme girdisi (renderer → main). Parola opsiyonel olarak iletilir. */
export interface SiteInput extends SiteAdvanced {
  /** Verilirse mevcut site güncellenir. */
  id?: string
  name: string
  folder?: string
  protocol: Protocol
  host: string
  port: number
  user: string
  password?: string
  anonymous?: boolean
  /** Parola kaydedilmez; her bağlanışta sorulur. */
  askPassword?: boolean
  encoding?: string
  rejectUnauthorized?: boolean
}

/**
 * Dışa aktarma dosyasındaki tek site kaydı: SiteInput'un id'siz hâli.
 * id bilinçli olarak dışarıda tutulur — içe aktarımda hedef makinede yeni id
 * üretilir, böylece çakışma/üzerine yazma riski olmaz. `password` yalnızca
 * "parolaları dahil et" seçilirse ve DÜZ METİN olarak bulunur.
 */
export type SiteExportEntry = Omit<SiteInput, 'id'>

/** Site dışa aktarma dosyası zarfı (sürümlü, gelecekte geçiş yapılabilir). */
export interface SitesExportFile {
  app: 'ferro'
  kind: 'sites'
  version: 1
  exportedAt: string
  sites: SiteExportEntry[]
}

/** Hedef dosya zaten varsa uygulanacak politika (Ayarlar → Dosya var işlemi). */
export type FileExistsAction =
  'ask' | 'overwrite' | 'overwrite-newer' | 'overwrite-size' | 'resume' | 'rename' | 'skip'

/** FTP aktarım türü (ASCII/binary) — yalnızca FTP protokolünde anlamlıdır. */
export type TransferTypeMode = 'auto' | 'ascii' | 'binary'

export type ProxyType = 'none' | 'http' | 'socks4' | 'socks5'

/** SFTP için vekil sunucu yapılandırması (Ayarlar → Genel vekil sunucu). */
export interface ProxyConfig {
  type: ProxyType
  host: string
  port: number
  user?: string
  password?: string
}

/** FTP ASCII/binary sınıflandırma kuralları. */
export interface TransferTypeConfig {
  mode: TransferTypeMode
  /** ASCII sayılacak uzantılar (noktasız, küçük harf). */
  asciiExtensions: string[]
  noExtAsAscii: boolean
  dotfilesAsAscii: boolean
}

/**
 * Renderer'ın main sürece ittiği çalışma zamanı ayarları (Ayarlar penceresi).
 * Uygulama açılışında ve her kaydetmede tek seferde gönderilir (settings:apply).
 * Site başına ConnectionConfig'ten ayrıdır — bunlar uygulama geneli davranışı belirler.
 */
export interface RuntimeSettings {
  /** Bant genişliği sınırı (bayt/sn); 0 = sınırsız. */
  bandwidthBytesPerSec: number
  /** Yeni oturumların bağlantı havuzu boyutu (1-10). */
  maxConnections: number
  /** Bağlantı zaman aşımı (ms); 0 = kapalı. */
  connectTimeoutMs: number
  /** FTP keep-alive (NOOP) gönderilsin mi. */
  keepAlive: boolean
  /** Transfer yeniden deneme: en fazla deneme sayısı (1 = yeniden deneme yok). */
  retryMaxAttempts: number
  /** Yeniden denemeler arası taban gecikme (ms). */
  retryDelayMs: number
  /** İndirmede hedef varsa politika. */
  fileExistsDownload: FileExistsAction
  /** Yüklemede hedef varsa politika. */
  fileExistsUpload: FileExistsAction
  /** FTP aktarım türü kuralları. */
  transferType: TransferTypeConfig
  /** Yerinde düzenleme editörü. */
  editor: { mode: 'none' | 'system' | 'custom'; customPath: string }
  /** SFTP vekil sunucu. */
  proxy: ProxyConfig
  /** Günlük dosyaya yazma + rotasyon boyutu (MiB). */
  logging: { toFile: boolean; maxSizeMiB: number }
  /** Otomatik güncelleme. */
  updates: { frequency: 'daily' | 'weekly' | 'never'; channel: 'stable' | 'beta' | 'nightly' }
}

/** İki dizin karşılaştırması (senkronizasyon) için tek girdi. */
export interface SyncEntry {
  name: string
  isDirectory: boolean
  inLocal: boolean
  inRemote: boolean
  localSize: number | null
  localMtime: number | null
  remoteSize: number | null
  remoteMtime: number | null
}

/** Yerel dosya sistemi girdisi (renderer'da yerel panel için). */
export interface LocalEntry {
  name: string
  type: EntryType
  size: number
  modifiedAt: number | null
  /** Mutlak yerel yol. */
  path: string
}
