import type { WebContents } from 'electron'
import { mkdir, readdir, stat } from 'fs/promises'
import { posix, join as joinLocal } from 'path'
import { emitEvent } from '../ipc/router'
import { FtpAdapter } from './adapters/FtpAdapter'
import { SftpAdapter } from './adapters/SftpAdapter'
import { hostKeyVerifier } from './HostKeyVerifier'
import { tlsVerifier } from './TlsVerifier'
import { ConnectionPool } from './ConnectionPool'
import { TransferQueue } from './TransferQueue'
import type { IFileTransferClient, AdapterOptions } from './IFileTransferClient'
import type { ConnectionConfig, TransferDirection, SyncEntry } from '@shared/transfer'
import { FerroError } from '@shared/errors'
import { getRuntimeSettings, activeProxy } from '../core/runtimeSettings'
import { createLogger } from '../core/logger'

const log = createLogger('session')

/** Recursive klasör transferi için derinlik üst sınırı (symlink döngüsü sigortası). */
const MAX_WALK_DEPTH = 64

interface Session {
  id: string
  client: IFileTransferClient
  sender: WebContents
  config: ConnectionConfig
  pool: ConnectionPool
  queue: TransferQueue
}

type LogLevel = 'info' | 'cmd' | 'reply' | 'error'

/** Aktif bağlantı oturumlarını yönetir; komut/yanıt akışı ve transfer durumunu renderer'a yayar. */
class SessionManager {
  private sessions = new Map<string, Session>()
  private jobOwners = new Map<string, TransferQueue>()
  private counter = 0
  /** Kuyruklar global duraklatıldı mı (yeni oturumlara da uygulanır)? */
  private transfersPaused = false
  /** Site ayarı yoksa kullanılacak havuz boyutu (Ayarlar → Aktarım). */
  private defaultPoolSize = 3

  /** Ayarlar'daki eşzamanlı aktarım sayısını uygular (yeni oturumlar için). */
  setDefaultPoolSize(n: number): void {
    this.defaultPoolSize = Math.min(10, Math.max(1, Math.floor(n)))
  }

  /** Verilen config için (primary veya havuz) yeni bir client üretir. */
  private createClient(config: ConnectionConfig, sender: WebContents): IFileTransferClient {
    const rs = getRuntimeSettings()
    const opts: AdapterOptions = {
      connectTimeoutMs: rs.connectTimeoutMs,
      keepAlive: rs.keepAlive,
      proxy: activeProxy(),
      transferType: rs.transferType
    }
    if (config.protocol === 'sftp') {
      return new SftpAdapter(
        config,
        (fp) => hostKeyVerifier.verify(config.host, config.port, fp, sender),
        opts
      )
    }
    return new FtpAdapter(
      config,
      (host, port, detail, fingerprint) =>
        tlsVerifier.verify(host, port, detail, fingerprint, sender),
      opts
    )
  }

  async connect(
    config: ConnectionConfig,
    sender: WebContents
  ): Promise<{ sessionId: string; cwd: string }> {
    const id = `s${++this.counter}`
    const client = this.createClient(config, sender)

    // Protokol komut/yanıt akışını log paneline bağla.
    client.attachProtocolLog?.((line) => {
      const level: LogLevel = /^< /.test(line) ? 'reply' : /^> /.test(line) ? 'cmd' : 'info'
      this.emitLog(sender, id, level, line.trim())
    })

    // Renderer'ın bekleyen sekmesi bu kimliğe bağlanır; günlük akışı bağlantı
    // kurulmadan önce de görünür olur.
    if (!sender.isDestroyed()) {
      emitEvent(sender, 'session:connecting', {
        sessionId: id,
        host: config.host,
        port: config.port
      })
    }
    this.emitLog(
      sender,
      id,
      'info',
      `Bağlanılıyor: ${config.host}:${config.port} (${config.protocol})`
    )
    try {
      await client.connect()
      const cwd = await client.pwd()

      // Paralel transfer için bağlantı havuzu (lazy: bağlantılar acquire'da açılır) + kuyruk.
      // Havuz boyutu site ayarından gelir; yoksa Ayarlar'daki genel varsayılan.
      const poolSize = Math.min(10, Math.max(1, config.maxConnections ?? this.defaultPoolSize))
      const pool = new ConnectionPool(() => this.createClient(config, sender), poolSize)
      const queue = new TransferQueue(id, pool, (job) => {
        if (!sender.isDestroyed()) emitEvent(sender, 'transfer:update', job)
      })
      // Terminal duruma ulaşan işlerin sahipliği bırakılır (bellek büyümesin).
      queue.onFinished = (jobId) => this.jobOwners.delete(jobId)
      if (this.transfersPaused) queue.pause()

      this.sessions.set(id, { id, client, sender, config, pool, queue })
      this.emitLog(sender, id, 'info', `Bağlandı. Çalışma dizini: ${cwd}`)
      log.info(`oturum açıldı: ${id} → ${config.host}`)
      return { sessionId: id, cwd }
    } catch (err) {
      const fe = FerroError.from(err)
      this.emitLog(sender, id, 'error', `Bağlantı hatası: ${fe.message}`)
      throw fe
    }
  }

  /** Oturumun (browsing) client'ını döndürür; yoksa NOT_CONNECTED fırlatır. */
  require(sessionId: string): IFileTransferClient {
    return this.session(sessionId).client
  }

  session(sessionId: string): Session {
    const s = this.sessions.get(sessionId)
    if (!s) throw new FerroError('NOT_CONNECTED', 'Oturum bulunamadı veya bağlantı kapalı')
    return s
  }

  /** Transferi kuyruğa ekler ve jobId döndürür. Klasörse recursive genişletilir ('' döner). */
  enqueueTransfer(
    sessionId: string,
    direction: TransferDirection,
    remotePath: string,
    localPath: string,
    name: string,
    isDirectory = false
  ): string {
    const s = this.session(sessionId)
    if (isDirectory) {
      const walk =
        direction === 'download'
          ? this.walkDownload(s, remotePath, localPath)
          : this.walkUpload(s, localPath, remotePath)
      void walk.catch((err) => {
        this.emitLog(
          s.sender,
          sessionId,
          'error',
          `Klasör transferi hatası: ${FerroError.from(err).message}`
        )
      })
      return ''
    }
    const jobId = s.queue.enqueue(direction, name, remotePath, localPath)
    this.jobOwners.set(jobId, s.queue)
    return jobId
  }

  /** Uzak klasörü (alt ağaç) yerele indirmek için dosyaları kuyruğa ekler.
   *  Not: symlink girdileri (type==='symlink') bilinçli olarak takip edilmez;
   *  derinlik sınırı, symlink'i dizin olarak çözen sunuculara karşı ek sigortadır. */
  private async walkDownload(
    s: Session,
    remotePath: string,
    localPath: string,
    depth = 0
  ): Promise<void> {
    if (depth > MAX_WALK_DEPTH) {
      throw new FerroError('FS_ERROR', `Dizin ağacı çok derin (>${MAX_WALK_DEPTH}): ${remotePath}`)
    }
    await mkdir(localPath, { recursive: true })
    const entries = await s.client.list(remotePath)
    for (const e of entries) {
      const rp = posix.join(remotePath, e.name)
      const lp = joinLocal(localPath, e.name)
      if (e.type === 'directory') {
        await this.walkDownload(s, rp, lp, depth + 1)
      } else if (e.type === 'file') {
        const jobId = s.queue.enqueue('download', e.name, rp, lp)
        this.jobOwners.set(jobId, s.queue)
      }
    }
  }

  /** Yerel klasörü (alt ağaç) uzağa yüklemek için dosyaları kuyruğa ekler.
   *  Symlink'ler takip edilmez (withFileTypes lstat semantiği); derinlik sınırı ek sigorta. */
  private async walkUpload(
    s: Session,
    localPath: string,
    remotePath: string,
    depth = 0
  ): Promise<void> {
    if (depth > MAX_WALK_DEPTH) {
      throw new FerroError('FS_ERROR', `Dizin ağacı çok derin (>${MAX_WALK_DEPTH}): ${localPath}`)
    }
    await s.client.mkdir(remotePath).catch(() => undefined) // varsa görmezden gel
    const dirents = await readdir(localPath, { withFileTypes: true })
    for (const d of dirents) {
      const lp = joinLocal(localPath, d.name)
      const rp = posix.join(remotePath, d.name)
      if (d.isDirectory()) {
        await this.walkUpload(s, lp, rp, depth + 1)
      } else if (d.isFile()) {
        const jobId = s.queue.enqueue('upload', d.name, rp, lp)
        this.jobOwners.set(jobId, s.queue)
      }
    }
  }

  cancelTransfer(jobId: string): void {
    this.jobOwners.get(jobId)?.cancel(jobId)
  }

  /** Tüm oturumların transfer kuyruklarını duraklat/sürdür (yenilere de uygulanır). */
  setTransfersPaused(paused: boolean): void {
    this.transfersPaused = paused
    for (const s of this.sessions.values()) {
      if (paused) s.queue.pause()
      else s.queue.resume()
    }
    log.info(`transfer kuyrukları ${paused ? 'duraklatıldı' : 'sürdürüldü'}`)
  }

  /** İki dizini (tek seviye) karşılaştırır — senkronizasyon önizlemesi için. */
  async compareDirs(
    sessionId: string,
    localPath: string,
    remotePath: string
  ): Promise<SyncEntry[]> {
    const client = this.require(sessionId)
    const map = new Map<string, SyncEntry>()

    const remote = await client.list(remotePath)
    for (const e of remote) {
      map.set(e.name, {
        name: e.name,
        isDirectory: e.type === 'directory',
        inLocal: false,
        inRemote: true,
        localSize: null,
        localMtime: null,
        remoteSize: e.type === 'directory' ? null : e.size,
        remoteMtime: e.modifiedAt
      })
    }

    const dirents = await readdir(localPath, { withFileTypes: true })
    for (const d of dirents) {
      const isDir = d.isDirectory()
      let size: number | null = null
      let mtime: number | null = null
      try {
        const s = await stat(joinLocal(localPath, d.name))
        size = isDir ? null : s.size
        mtime = s.mtimeMs
      } catch {
        // erişilemeyeni atla
      }
      const existing = map.get(d.name)
      if (existing) {
        existing.inLocal = true
        existing.localSize = size
        existing.localMtime = mtime
        existing.isDirectory = existing.isDirectory || isDir
      } else {
        map.set(d.name, {
          name: d.name,
          isDirectory: isDir,
          inLocal: true,
          inRemote: false,
          localSize: size,
          localMtime: mtime,
          remoteSize: null,
          remoteMtime: null
        })
      }
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  async disconnect(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    // Önce kuyruğu temiz iptal et: aktif transferler abort edilir, backoff
    // zamanlayıcıları durur — işler ölü havuza karşı retry döngüsüne girmez.
    s.queue.cancelAll()
    await s.pool.destroy().catch(() => undefined)
    await s.client.disconnect().catch(() => undefined)
    this.sessions.delete(sessionId)
    this.emitLog(s.sender, sessionId, 'info', 'Bağlantı kapatıldı')
    log.info(`oturum kapandı: ${sessionId}`)
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.disconnect(id)))
  }

  emitLog(sender: WebContents, sessionId: string, level: LogLevel, text: string): void {
    if (sender.isDestroyed()) return
    emitEvent(sender, 'session:log', { sessionId, level, text })
  }
}

export const sessionManager = new SessionManager()
