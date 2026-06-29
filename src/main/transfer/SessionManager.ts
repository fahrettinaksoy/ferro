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
import type { IFileTransferClient } from './IFileTransferClient'
import type { ConnectionConfig, TransferDirection, SyncEntry } from '@shared/transfer'
import { FerroError } from '@shared/errors'
import { createLogger } from '../core/logger'

const log = createLogger('session')

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

  /** Verilen config için (primary veya havuz) yeni bir client üretir. */
  private createClient(config: ConnectionConfig, sender: WebContents): IFileTransferClient {
    if (config.protocol === 'sftp') {
      return new SftpAdapter(config, (fp) =>
        hostKeyVerifier.verify(config.host, config.port, fp, sender)
      )
    }
    return new FtpAdapter(config, (host, port, detail) =>
      tlsVerifier.verify(host, port, detail, sender)
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

    this.emitLog(sender, id, 'info', `Bağlanılıyor: ${config.host}:${config.port} (${config.protocol})`)
    try {
      await client.connect()
      const cwd = await client.pwd()

      // Paralel transfer için bağlantı havuzu (lazy: bağlantılar acquire'da açılır) + kuyruk.
      const pool = new ConnectionPool(() => this.createClient(config, sender))
      const queue = new TransferQueue(id, pool, (job) => {
        if (!sender.isDestroyed()) emitEvent(sender, 'transfer:update', job)
      })

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
        this.emitLog(s.sender, sessionId, 'error', `Klasör transferi hatası: ${FerroError.from(err).message}`)
      })
      return ''
    }
    const jobId = s.queue.enqueue(direction, name, remotePath, localPath)
    this.jobOwners.set(jobId, s.queue)
    return jobId
  }

  /** Uzak klasörü (alt ağaç) yerele indirmek için dosyaları kuyruğa ekler. */
  private async walkDownload(s: Session, remotePath: string, localPath: string): Promise<void> {
    await mkdir(localPath, { recursive: true })
    const entries = await s.client.list(remotePath)
    for (const e of entries) {
      const rp = posix.join(remotePath, e.name)
      const lp = joinLocal(localPath, e.name)
      if (e.type === 'directory') {
        await this.walkDownload(s, rp, lp)
      } else if (e.type === 'file') {
        const jobId = s.queue.enqueue('download', e.name, rp, lp)
        this.jobOwners.set(jobId, s.queue)
      }
    }
  }

  /** Yerel klasörü (alt ağaç) uzağa yüklemek için dosyaları kuyruğa ekler. */
  private async walkUpload(s: Session, localPath: string, remotePath: string): Promise<void> {
    await s.client.mkdir(remotePath).catch(() => undefined) // varsa görmezden gel
    const dirents = await readdir(localPath, { withFileTypes: true })
    for (const d of dirents) {
      const lp = joinLocal(localPath, d.name)
      const rp = posix.join(remotePath, d.name)
      if (d.isDirectory()) {
        await this.walkUpload(s, lp, rp)
      } else if (d.isFile()) {
        const jobId = s.queue.enqueue('upload', d.name, rp, lp)
        this.jobOwners.set(jobId, s.queue)
      }
    }
  }

  cancelTransfer(jobId: string): void {
    this.jobOwners.get(jobId)?.cancel(jobId)
  }

  /** İki dizini (tek seviye) karşılaştırır — senkronizasyon önizlemesi için. */
  async compareDirs(sessionId: string, localPath: string, remotePath: string): Promise<SyncEntry[]> {
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
