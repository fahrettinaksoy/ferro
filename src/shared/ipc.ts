import type { SerializedError } from './errors'
import type {
  ConnectionConfig,
  RemoteEntry,
  LocalEntry,
  TransferDirection,
  TransferJob,
  SavedSite,
  SiteInput,
  SyncEntry
} from './transfer'

// ── IPC sözleşmesi ─────────────────────────────────────────────────────────
// Tek doğruluk kaynağı: kanal isimleri + istek/yanıt + event yük tipleri.
// Main (ipcMain.handle), preload (contextBridge) ve renderer aynı tipleri kullanır.

/** invoke(): renderer → main istek/yanıt kanalları. */
export interface InvokeMap {
  'app:ping': { req: void; res: { pong: true; version: string } }
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
  'settings:setBandwidth': { req: { bytesPerSec: number }; res: { ok: true } }

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
}

/** event: main → renderer tek yönlü olay yükleri. */
export interface EventMap {
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
