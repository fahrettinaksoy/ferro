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
  encoding?: string
  rejectUnauthorized?: boolean
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
