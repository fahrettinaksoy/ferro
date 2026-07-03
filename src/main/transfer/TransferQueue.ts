import { createReadStream, createWriteStream, existsSync } from 'fs'
import { stat } from 'fs/promises'
import { posix, extname, basename, dirname, join as joinLocal } from 'path'
import type { TransferJob, TransferDirection } from '@shared/transfer'
import { FerroError, type FerroErrorCode } from '@shared/errors'
import type { IFileTransferClient } from './IFileTransferClient'
import type { ConnectionPool } from './ConnectionPool'
import { maybeThrottle } from './throttle'
import { retryPolicy, fileExistsPolicy } from '../core/runtimeSettings'
import { createLogger } from '../core/logger'

const log = createLogger('queue')
const PROGRESS_THROTTLE_MS = 120

// Retry: geçici hatalarda üstel geri çekilme + jitter. Deneme sayısı ve gecikme
// Ayarlar → Bağlantı'dan gelir (runtimeSettings). Bağlantı her denemede havuzdan
// yeniden alınır (kopan bağlantı discard edildiği için retry = auto-reconnect).
const BACKOFF_FACTOR = 2
const BACKOFF_JITTER = 0.2

/** Yeniden denemenin anlamlı olduğu hata sınıfları (kalıcı hatalar hariç). */
const RETRYABLE_CODES: ReadonlySet<FerroErrorCode> = new Set([
  'CONNECTION_FAILED',
  'TRANSFER_FAILED',
  'NOT_CONNECTED',
  'TIMEOUT',
  'UNKNOWN'
])

interface StatInfo {
  exists: boolean
  size: number
  mtime: number
}

async function localStat(path: string): Promise<StatInfo> {
  try {
    const s = await stat(path)
    return { exists: true, size: s.size, mtime: s.mtimeMs }
  } catch {
    return { exists: false, size: 0, mtime: 0 }
  }
}

async function remoteStat(client: IFileTransferClient, path: string): Promise<StatInfo> {
  try {
    const e = await client.stat(path)
    return { exists: true, size: e.size, mtime: e.modifiedAt ?? 0 }
  } catch {
    return { exists: false, size: 0, mtime: 0 }
  }
}

/** "ad.uzt" → "ad (n).uzt" biçiminde çakışmayan bir hedef adı bulur. */
function nonCollidingName(base: string, exists: (candidate: string) => boolean): string {
  if (!exists(base)) return base
  const ext = extname(base)
  const stem = base.slice(0, base.length - ext.length)
  for (let n = 1; n < 10_000; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!exists(candidate)) return candidate
  }
  return base
}

interface TransferPlan {
  skip: boolean
  startAt: number
  /** (rename politikasında değişmiş olabilecek) hedef yol. */
  targetPath: string
}

interface JobEntry {
  job: TransferJob
  abort: AbortController
  lastEmit: number
  /** Resume offset'i (bayt) — ilerleme gösteriminde bu offset eklenir. */
  startAt: number
  /** Kaçıncı deneme (0 = ilk). */
  attempt: number
  /** Backoff beklemesi sırasındaki zamanlayıcı (iptalde temizlenir). */
  retryTimer?: NodeJS.Timeout
}

/**
 * Bir oturuma ait transfer kuyruğu. İşler bağlantı havuzu üzerinden işlenir; eşzamanlılık
 * havuz boyutuyla doğal olarak sınırlanır (acquire() limit dolunca bekler).
 */
export class TransferQueue {
  private entries = new Map<string, JobEntry>()
  private counter = 0
  /** Duraklatıldı mı? Yeni işler başlatılmaz; aktif transferler sürer. */
  private paused = false
  /** Duraklatma sırasında bekletilen (henüz başlamamış) iş kimlikleri. */
  private pending: string[] = []

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
    // Oturum önekli kimlik: jobOwners haritası (SessionManager) global olduğu için
    // farklı oturumların işleri asla çakışmaz.
    const id = `${this.sessionId}:j${++this.counter}`
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
    this.entries.set(id, {
      job,
      abort: new AbortController(),
      lastEmit: 0,
      startAt: 0,
      attempt: 0
    })
    this.emit({ ...job })
    void this.run(id)
    return id
  }

  /** Kuyruğu duraklat: sıradaki işler bekletilir (aktif transferler sürer). */
  pause(): void {
    this.paused = true
  }

  /** Kuyruğu sürdür: bekletilen işler sırayla başlatılır. */
  resume(): void {
    this.paused = false
    for (const id of this.pending.splice(0)) void this.run(id)
  }

  cancel(jobId: string): void {
    const entry = this.entries.get(jobId)
    if (!entry) return
    entry.abort.abort()
    // Backoff beklemesindeyse zamanlayıcıyı durdur — iş bir daha koşmaz.
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer)
      entry.retryTimer = undefined
    }
    if (entry.job.status === 'queued') {
      entry.job.status = 'cancelled'
      this.emit({ ...entry.job })
      this.finish(entry)
    }
  }

  /** Tüm işleri iptal eder (oturum kapanışında temiz kapanış için). */
  cancelAll(): void {
    for (const id of [...this.entries.keys()]) this.cancel(id)
    this.pending.length = 0
  }

  /**
   * İş terminal duruma ulaştı: kaydı bırak (bellek sınırsız büyümesin).
   * Renderer kendi kopyasını tutar; kuyruğun kaydına artık gerek yoktur.
   */
  private finish(entry: JobEntry): void {
    if (entry.retryTimer) clearTimeout(entry.retryTimer)
    this.entries.delete(entry.job.id)
    this.onFinished?.(entry.job.id)
  }

  /** Terminal duruma ulaşan işler için bildirim (SessionManager jobOwners budar). */
  onFinished?: (jobId: string) => void

  private async run(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry || entry.abort.signal.aborted) return

    // Kuyruk duraklatıldıysa işi bekleme listesine al — resume() başlatır.
    if (this.paused) {
      this.pending.push(id)
      return
    }

    let client: IFileTransferClient | null = null
    try {
      client = await this.pool.acquire()
      if (entry.abort.signal.aborted) {
        this.pool.release(client)
        return
      }

      entry.job.status = 'active'
      this.emit({ ...entry.job })

      const resumable = client.supportsResume === true
      const plan = await this.planTransfer(client, entry, resumable)

      // Dosya-var politikası "atla" dediyse transferi başlatmadan tamamla.
      if (plan.skip) {
        entry.job.status = 'completed'
        this.emit({ ...entry.job })
        this.pool.release(client)
        this.finish(entry)
        log.info(`atlandı (dosya var): ${entry.job.name}`)
        return
      }

      const startAt = plan.startAt
      entry.startAt = startAt
      const opts = {
        startAt,
        signal: entry.abort.signal,
        onProgress: (p: { bytes: number; total: number | null }) =>
          this.onProgress(entry, p.bytes, p.total)
      }

      if (entry.job.direction === 'upload') {
        entry.job.bytes = startAt
        if (startAt > 0) this.emit({ ...entry.job })
        const source = createReadStream(entry.job.localPath, startAt > 0 ? { start: startAt } : {})
        const throttle = maybeThrottle()
        if (throttle) {
          source.pipe(throttle)
          await client.upload(throttle, plan.targetPath, opts)
        } else {
          await client.upload(source, plan.targetPath, opts)
        }
      } else {
        entry.job.bytes = startAt
        if (startAt > 0) this.emit({ ...entry.job })
        const dest = createWriteStream(plan.targetPath, { flags: startAt > 0 ? 'a' : 'w' })
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
      this.finish(entry)
      log.info(`tamamlandı: ${entry.job.name}${entry.startAt > 0 ? ' (resume)' : ''}`)
    } catch (err) {
      const fe = FerroError.from(err)

      if (fe.code === 'CANCELLED' || entry.abort.signal.aborted) {
        entry.job.status = 'cancelled'
        this.emit({ ...entry.job })
        // Zarif iptal (SFTP) bağlantıyı sağlam bırakır → havuza iade et;
        // bağlantı kapatılarak iptal edildiyse (FTP) düşür.
        if (client) {
          if (client.connected) this.pool.release(client)
          else this.pool.discard(client)
        }
        this.finish(entry)
        return
      }

      // Hata sonrası bağlantı tutarsız olabilir; havuzdan düşür (retry taze
      // bağlantı alır — auto-reconnect bu yolla sağlanır).
      if (client) this.pool.discard(client)

      const maxAttempts = retryPolicy().maxAttempts
      if (RETRYABLE_CODES.has(fe.code) && entry.attempt < maxAttempts - 1) {
        entry.attempt++
        entry.job.attempt = entry.attempt
        entry.job.status = 'queued'
        entry.job.error = fe.message
        this.emit({ ...entry.job })
        const delay = this.backoffDelay(entry.attempt)
        log.warn(
          `başarısız (${fe.code}), ${delay}ms sonra yeniden denenecek ` +
            `[${entry.attempt + 1}/${maxAttempts}]: ${entry.job.name}`
        )
        entry.retryTimer = setTimeout(() => {
          entry.retryTimer = undefined
          void this.run(id)
        }, delay)
        return
      }

      entry.job.status = 'failed'
      entry.job.error = fe.message
      this.emit({ ...entry.job })
      this.finish(entry)
      log.error(`başarısız: ${entry.job.name} (${fe.code}) ${fe.message}`)
    }
  }

  /**
   * Dosya-var politikasını (Ayarlar → Dosya var işlemi) uygulayıp transfer planını
   * üretir: atla / baştan yaz / kaldığı yerden sürdür / yeniden adlandır.
   */
  private async planTransfer(
    client: IFileTransferClient,
    entry: JobEntry,
    resumable: boolean
  ): Promise<TransferPlan> {
    const upload = entry.job.direction === 'upload'
    const targetPath = upload ? entry.job.remotePath : entry.job.localPath

    const source = upload
      ? await localStat(entry.job.localPath)
      : await remoteStat(client, entry.job.remotePath)
    entry.job.total = source.exists ? source.size : null

    const dest = upload ? await remoteStat(client, targetPath) : await localStat(targetPath)

    if (!dest.exists) return { skip: false, startAt: 0, targetPath }

    switch (fileExistsPolicy(entry.job.direction)) {
      case 'skip':
        return { skip: true, startAt: 0, targetPath }
      case 'overwrite':
        return { skip: false, startAt: 0, targetPath }
      case 'overwrite-newer':
        return source.mtime > dest.mtime
          ? { skip: false, startAt: 0, targetPath }
          : { skip: true, startAt: 0, targetPath }
      case 'overwrite-size':
        return source.size !== dest.size
          ? { skip: false, startAt: 0, targetPath }
          : { skip: true, startAt: 0, targetPath }
      case 'rename':
        return {
          skip: false,
          startAt: 0,
          targetPath: await this.renameTarget(upload, client, targetPath)
        }
      // 'resume' ve 'ask' (diyalog yok → sürdürmeye düş): kaldığı yerden.
      default:
        if (!resumable) return { skip: false, startAt: 0, targetPath }
        if (dest.size >= source.size) return { skip: true, startAt: 0, targetPath } // zaten tam
        return { skip: false, startAt: dest.size, targetPath }
    }
  }

  /** Rename politikası için çakışmayan hedef yol üretir. */
  private async renameTarget(
    upload: boolean,
    client: IFileTransferClient,
    targetPath: string
  ): Promise<string> {
    if (!upload) {
      const dir = dirname(targetPath)
      const unique = nonCollidingName(basename(targetPath), (c) => existsSync(joinLocal(dir, c)))
      return joinLocal(dir, unique)
    }
    // Uzak taraf: senkron var-yok yok; stat ile artan numara dene.
    const dir = posix.dirname(targetPath)
    const base = posix.basename(targetPath)
    const ext = extname(base)
    const stem = base.slice(0, base.length - ext.length)
    for (let n = 0; n < 10_000; n++) {
      const candidate = n === 0 ? base : `${stem} (${n})${ext}`
      const full = posix.join(dir, candidate)
      const exists = await remoteStat(client, full)
      if (!exists.exists) return full
    }
    return targetPath
  }

  /** Üstel geri çekilme + jitter (taban gecikme Ayarlar'dan). */
  private backoffDelay(attempt: number): number {
    const base = retryPolicy().baseDelayMs * Math.pow(BACKOFF_FACTOR, attempt - 1)
    const jitter = base * BACKOFF_JITTER * (Math.random() * 2 - 1)
    return Math.max(0, Math.round(base + jitter))
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
