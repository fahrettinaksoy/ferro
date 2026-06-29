import { createReadStream, createWriteStream } from 'fs'
import { stat } from 'fs/promises'
import type { TransferJob, TransferDirection } from '@shared/transfer'
import { FerroError } from '@shared/errors'
import type { IFileTransferClient } from './IFileTransferClient'
import type { ConnectionPool } from './ConnectionPool'
import { maybeThrottle } from './throttle'
import { createLogger } from '../core/logger'

const log = createLogger('queue')
const PROGRESS_THROTTLE_MS = 120

interface JobEntry {
  job: TransferJob
  abort: AbortController
  lastEmit: number
  /** Resume offset'i (bayt) — ilerleme gösteriminde bu offset eklenir. */
  startAt: number
}

async function localSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

async function remoteSize(client: IFileTransferClient, path: string): Promise<number | null> {
  try {
    return (await client.stat(path)).size
  } catch {
    return null
  }
}

/**
 * Bir oturuma ait transfer kuyruğu. İşler bağlantı havuzu üzerinden işlenir; eşzamanlılık
 * havuz boyutuyla doğal olarak sınırlanır (acquire() limit dolunca bekler).
 */
export class TransferQueue {
  private entries = new Map<string, JobEntry>()
  private counter = 0

  constructor(
    private readonly sessionId: string,
    private readonly pool: ConnectionPool,
    private readonly emit: (job: TransferJob) => void,
    private readonly now: () => number = () => Date.now()
  ) {}

  enqueue(
    direction: TransferDirection,
    name: string,
    remotePath: string,
    localPath: string
  ): string {
    const id = `j${++this.counter}`
    const job: TransferJob = {
      id,
      sessionId: this.sessionId,
      direction,
      name,
      remotePath,
      localPath,
      status: 'queued',
      bytes: 0,
      total: null
    }
    this.entries.set(id, { job, abort: new AbortController(), lastEmit: 0, startAt: 0 })
    this.emit({ ...job })
    void this.run(id)
    return id
  }

  cancel(jobId: string): void {
    const entry = this.entries.get(jobId)
    if (!entry) return
    entry.abort.abort()
    if (entry.job.status === 'queued') {
      entry.job.status = 'cancelled'
      this.emit({ ...entry.job })
    }
  }

  private async run(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry || entry.abort.signal.aborted) return

    const client = await this.pool.acquire()
    if (entry.abort.signal.aborted) {
      this.pool.release(client)
      return
    }

    entry.job.status = 'active'
    this.emit({ ...entry.job })

    try {
      const resumable = client.supportsResume === true
      if (entry.job.direction === 'upload') {
        const total = await localSize(entry.job.localPath)
        entry.job.total = total
        let startAt = 0
        if (resumable) {
          const existing = await remoteSize(client, entry.job.remotePath)
          if (existing !== null && existing > 0 && existing < total) startAt = existing
        }
        entry.startAt = startAt
        entry.job.bytes = startAt
        if (startAt > 0) this.emit({ ...entry.job })
        const source = createReadStream(
          entry.job.localPath,
          startAt > 0 ? { start: startAt } : {}
        )
        const opts = {
          startAt,
          signal: entry.abort.signal,
          onProgress: (p: { bytes: number; total: number | null }) =>
            this.onProgress(entry, p.bytes, p.total)
        }
        const throttle = maybeThrottle()
        if (throttle) {
          source.pipe(throttle)
          await client.upload(throttle, entry.job.remotePath, opts)
        } else {
          await client.upload(source, entry.job.remotePath, opts)
        }
      } else {
        const total = await remoteSize(client, entry.job.remotePath)
        entry.job.total = total
        const existing = await localSize(entry.job.localPath)
        let startAt = 0
        if (resumable && existing > 0 && total !== null) {
          if (existing >= total) {
            // Yerel dosya zaten tam — atla.
            entry.job.bytes = existing
            entry.job.status = 'completed'
            this.emit({ ...entry.job })
            this.pool.release(client)
            return
          }
          startAt = existing
        }
        entry.startAt = startAt
        entry.job.bytes = startAt
        if (startAt > 0) this.emit({ ...entry.job })
        const dest = createWriteStream(entry.job.localPath, { flags: startAt > 0 ? 'a' : 'w' })
        const opts = {
          startAt,
          signal: entry.abort.signal,
          onProgress: (p: { bytes: number; total: number | null }) =>
            this.onProgress(entry, p.bytes, p.total)
        }
        const throttle = maybeThrottle()
        if (throttle) {
          const destDone = new Promise<void>((resolve, reject) => {
            dest.once('finish', resolve)
            dest.once('error', reject)
          })
          throttle.pipe(dest)
          await client.download(entry.job.remotePath, throttle, opts)
          await destDone
        } else {
          await client.download(entry.job.remotePath, dest, opts)
        }
      }
      entry.job.status = 'completed'
      this.emit({ ...entry.job })
      this.pool.release(client)
      log.info(`tamamlandı: ${entry.job.name}${entry.startAt > 0 ? ' (resume)' : ''}`)
    } catch (err) {
      const fe = FerroError.from(err)
      entry.job.status = fe.code === 'CANCELLED' ? 'cancelled' : 'failed'
      if (entry.job.status === 'failed') entry.job.error = fe.message
      this.emit({ ...entry.job })
      // İptal/hata sonrası bağlantı tutarsız olabilir; havuzdan düşür.
      this.pool.discard(client)
    }
  }

  private onProgress(entry: JobEntry, bytes: number, total: number | null): void {
    // Adaptör bytes'ı bu transfer için 0'dan sayar; resume offset'ini ekle.
    // total ise zaten dosyanın TAM boyutu (kalan değil), olduğu gibi kullan.
    entry.job.bytes = entry.startAt + bytes
    if (total !== null) entry.job.total = total
    const t = this.now()
    if (t - entry.lastEmit >= PROGRESS_THROTTLE_MS) {
      entry.lastEmit = t
      this.emit({ ...entry.job })
    }
  }
}
