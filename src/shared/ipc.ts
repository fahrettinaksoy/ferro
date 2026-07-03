import type { SerializedError } from './errors'
import type { SyncConfigInput, SyncConfigPublic, SyncSettingsSnapshot } from './sync'
import type {
  ConnectionConfig,
  RemoteEntry,
  LocalEntry,
  TransferDirection,
  TransferJob,
  SavedSite,
  SiteInput,
  SyncEntry,
  RuntimeSettings
} from './transfer'

// ── IPC sözleşmesi ─────────────────────────────────────────────────────────
// Tek doğruluk kaynağı: kanal isimleri + istek/yanıt + event yük tipleri.
// Main (ipcMain.handle), preload (contextBridge) ve renderer aynı tipleri kullanır.

/** invoke(): renderer → main istek/yanıt kanalları. */
export interface InvokeMap {
  'app:ping': { req: void; res: { pong: true; version: string } }
  /** Hakkında ekranı: uygulama + çalışma ortamı sürüm bilgileri. */
  'app:info': {
    req: void
    res: {
      name: string
      version: string
      electron: string
      chrome: string
      node: string
      platform: string
      arch: string
    }
  }
  'dialog:pickDirectory': { req: { defaultPath?: string }; res: { path: string | null } }

  // ── Bağlantı ──
  'connection:connect': { req: ConnectionConfig; res: { sessionId: string; cwd: string } }
  'connection:disconnect': { req: { sessionId: string }; res: { closed: true } }

  // ── Uzak dosya sistemi ──
  'fs:list': { req: { sessionId: string; path?: string }; res: RemoteEntry[] }
  'fs:pwd': { req: { sessionId: string }; res: { cwd: string } }
  'fs:cwd': { req: { sessionId: string; path: string }; res: { cwd: string } }
  'fs:mkdir': { req: { sessionId: string; path: string }; res: { ok: true } }
  'fs:delete': { req: { sessionId: string; path: string }; res: { ok: true } }
  'fs:rmdir': { req: { sessionId: string; path: string }; res: { ok: true } }
  'fs:rename': { req: { sessionId: string; from: string; to: string }; res: { ok: true } }
  'fs:chmod': { req: { sessionId: string; path: string; mode: number }; res: { ok: true } }

  // ── Transfer kuyruğu ──
  'transfer:enqueue': {
    req: {
      sessionId: string
      direction: TransferDirection
      remotePath: string
      localPath: string
      name: string
      /** true ise klasör; alt ağaç recursive olarak genişletilir. */
      isDirectory?: boolean
    }
    res: { jobId: string }
  }
  'transfer:cancel': { req: { jobId: string }; res: { ok: true } }
  /** Tüm transfer kuyruklarını duraklat/sürdür (aktif transferler sürer). */
  'transfer:setPaused': { req: { paused: boolean }; res: { paused: boolean } }
  'sync:compare': {
    req: { sessionId: string; localPath: string; remotePath: string }
    res: { entries: SyncEntry[] }
  }

  // ── Yerel dosya sistemi ──
  'local:home': { req: void; res: { path: string } }
  'local:list': { req: { path: string }; res: { path: string; entries: LocalEntry[] } }
  'local:mkdir': { req: { path: string }; res: { ok: true } }
  'local:delete': { req: { path: string }; res: { ok: true } }
  'local:rename': { req: { from: string; to: string }; res: { ok: true } }

  // ── Host key (SFTP TOFU) ──
  'hostkey:decision': { req: { requestId: string; accept: boolean }; res: { ok: true } }

  // ── TLS sertifika onayı (FTPS) ──
  'tls:decision': { req: { requestId: string; accept: boolean }; res: { ok: true } }

  // ── Ayarlar ──
  /** Uygulama geneli çalışma zamanı ayarlarını main sürece uygular
      (bant genişliği, havuz, timeout, retry, dosya-var politikası, editör,
      proxy, loglama, güncelleme). Açılışta ve her kaydetmede gönderilir. */
  'settings:apply': { req: RuntimeSettings; res: { ok: true } }
  /** Yerinde düzenleme için özel editör yolunu seçtirir (dosya seçici). */
  'settings:pickEditor': { req: void; res: { path: string | null } }

  // ── Master parola (kimlik deposu kilidi) ──
  /** Master parola durumunu döndürür: mod + kilitli mi + doğrulayıcı var mı. */
  'vault:status': {
    req: void
    res: { mode: 'os' | 'master'; locked: boolean; hasMaster: boolean }
  }
  /** Master parolayı ayarlar/değiştirir (mevcut sırlar yeni anahtara taşınır). */
  'vault:setMaster': { req: { current?: string; next: string }; res: { ok: true } }
  /** Master parolayla depoyu açar (oturum boyunca). */
  'vault:unlock': { req: { password: string }; res: { ok: boolean } }
  /** OS keychain moduna geri döner (master parolayı kaldırır). */
  'vault:useOsKeychain': { req: { current: string }; res: { ok: true } }

  /** Panel görünürlükleri değişti — Görünüm menüsündeki onay imleri eşitlenir. */
  'app:setPanelState': {
    req: { servers: boolean; log: boolean; queue: boolean }
    res: { ok: true }
  }

  /** Bağlantı durumu değişti — Sunucu menüsü öğelerinin etkinliği eşitlenir. */
  'app:setConnState': {
    req: {
      /** Etkin bir sekme var mı (bağlanıyor/bağlı/hata)? */
      hasActive: boolean
      /** Etkin sekme bağlanma sürecinde mi? */
      connecting: boolean
      /** Etkin sekme bağlı mı? */
      connected: boolean
      /** Herhangi bir bağlı oturum var mı? */
      anyConnected: boolean
      /** Transfer kuyrukları duraklatılmış mı? */
      paused: boolean
    }
    res: { ok: true }
  }

  // ── Edit-in-place ──
  'edit:open': { req: { sessionId: string; remotePath: string; name: string }; res: { ok: true } }

  // ── Site Yöneticisi ──
  'sites:list': { req: void; res: { sites: SavedSite[]; encryptionAvailable: boolean } }
  'sites:save': { req: SiteInput; res: { id: string } }
  'sites:delete': { req: { id: string }; res: { ok: true } }
  'sites:renameGroup': { req: { from: string; to: string }; res: { ok: true; count: number } }
  /** password: "parola sorulsun" sitelerinde o an girilen parola (kaydedilmez). */
  'sites:connect': {
    req: { id: string; password?: string }
    res: { sessionId: string; cwd: string }
  }
  /** Siteleri JSON dosyasına dışa aktarır (kaydetme diyaloğu main'de açılır).
      includePasswords: parolalar DÜZ METİN yazılır — kullanıcı açıkça onaylar.
      path null = kullanıcı diyaloğu iptal etti. */
  'sites:export': {
    req: { includePasswords: boolean }
    res: { path: string | null; count: number }
  }
  /** JSON dosyasından site içe aktarır (açma diyaloğu main'de açılır).
      Yinelenenler (aynı protokol+host+port+kullanıcı+ad) atlanır.
      path null = kullanıcı diyaloğu iptal etti. */
  'sites:import': {
    req: void
    res: { path: string | null; imported: number; skipped: number; total: number }
  }

  // ── Senkronizasyon (uçtan uca şifreli — Gist / WebDAV) ──
  /** Yapılandırma görünümü: sırlar yalnızca var/yok olarak döner. */
  'sync:getConfig': { req: void; res: { config: SyncConfigPublic } }
  /** Yapılandırmayı kaydeder. Sır alanları: undefined = mevcut korunur. */
  'sync:setConfig': { req: SyncConfigInput; res: { config: SyncConfigPublic } }
  /** Yerel veriyi şifreleyip uzak depoya yükler. settings: renderer'ın
      localStorage anlık görüntüsü (yalnızca ayarlar eşitlemesi açıkken). */
  'sync:push': {
    req: { settings?: SyncSettingsSnapshot }
    res: { updatedAt: string; bytes: number; sites: number; settings: boolean }
  }
  /** Uzak blob'u indirir/çözer: siteler main'de birleştirilir, ayarlar
      renderer'a uygulanmak üzere döner. found=false → uzak kopya henüz yok. */
  'sync:pull': {
    req: void
    res: {
      found: boolean
      updatedAt?: string
      sites?: { imported: number; skipped: number; total: number }
      settings?: SyncSettingsSnapshot
    }
  }
}

/** event: main → renderer tek yönlü olay yükleri. */
export interface EventMap {
  /** Uygulama menüsündeki "Hakkında" tıklandı — renderer M3 diyaloğunu açar. */
  'app:showAbout': null
  /** Görünüm menüsünden panel göster/gizle tıklandı. */
  'app:togglePanel': { panel: 'servers' | 'log' | 'queue' }
  /** Menü eylemi: ilgili diyalog/paneli aç ya da bağlantı eylemini çalıştır. */
  'app:menuAction': {
    action:
      | 'settings'
      | 'siteManager'
      | 'hotkeys'
      | 'connect'
      | 'disconnect'
      | 'reconnect'
      | 'sync'
      | 'toggleTransfers'
  }
  /** Bağlantı denemesi başladı — renderer bekleyen sekmeyi bu kimliğe bağlar
      ve günlük akışı (session:log) daha bağlantı kurulmadan görünür olur. */
  'session:connecting': {
    sessionId: string
    host: string
    port: number
  }
  'session:log': {
    sessionId: string
    level: 'info' | 'cmd' | 'reply' | 'error'
    text: string
  }
  'transfer:update': TransferJob
  'hostkey:verify': {
    requestId: string
    host: string
    port: number
    fingerprint: string
    /** true ise daha önce kaydedilmiş anahtar DEĞİŞMİŞ demektir (uyarı!). */
    changed: boolean
  }
  'tls:verify': {
    requestId: string
    host: string
    port: number
    /** Sertifika doğrulama hatası açıklaması (örn. "self signed certificate"). */
    detail: string
    /** Sunucunun SHA-256 sertifika parmak izi (alınamadıysa null). */
    fingerprint: string | null
    /** true ise daha önce pinlenen sertifika DEĞİŞMİŞ demektir (MITM uyarısı!). */
    changed: boolean
  }
}

export type InvokeChannel = keyof InvokeMap
export type EventChannel = keyof EventMap

export type InvokeReq<C extends InvokeChannel> = InvokeMap[C]['req']
export type InvokeRes<C extends InvokeChannel> = InvokeMap[C]['res']

/** Main handler'larının döndürdüğü zarf. preload bunu açıp ya değeri döner ya da reject eder. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: SerializedError }

/**
 * window.ferro üzerinden açılan ham köprü yüzeyi.
 * invoke ZARFI (IpcResult) döndürür — düz nesne olduğu için contextBridge tüm alanları korur.
 * Unwrap + hata fırlatma renderer istemcisinde (lib/ipc.ts) yapılır; böylece FerroError'un
 * `code` alanı renderer bağlamında korunur (köprüden fırlatılan Error'lar düz Error'a indirgenir).
 */
export interface FerroBridge {
  invoke<C extends InvokeChannel>(
    channel: C,
    payload: InvokeReq<C>
  ): Promise<IpcResult<InvokeRes<C>>>
  on<E extends EventChannel>(event: E, listener: (payload: EventMap[E]) => void): () => void
}

/** preload ↔ main arası dahili köprü kanalları (uygulama kanalları değil). */
export const BRIDGE = {
  invoke: 'ferro:invoke',
  event: 'ferro:event'
} as const
