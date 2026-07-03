import type { IFileTransferClient } from './IFileTransferClient'
import { FerroError } from '@shared/errors'
import { createLogger } from '../core/logger'

const log = createLogger('pool')

/** acquire() bekleme üst sınırı — havuz tıkanırsa çağıran sonsuza dek asılı kalmaz. */
const DEFAULT_ACQUIRE_TIMEOUT_MS = 60_000

interface Waiter {
  resolve: (c: IFileTransferClient) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Site başına bağlantı havuzu. FTP kontrol bağlantısı seri çalıştığı için paralel
 * transfer ayrı bağlantılar gerektirir.
 *
 * Muhasebe kuralları:
 *  - size = idle + leased + açılmakta olan bağlantı sayısı; her yol tek noktadan
 *    (dropClient/promoteWaiter) düşürülür, sayaç kayması olmaz.
 *  - Ödünç verilen (leased) bağlantılar takip edilir; destroy() aktif transferin
 *    bağlantısını da kapatır (oturum kapanışında sızıntı kalmaz).
 *  - Bekleyenler zaman aşımına sahiptir ve boşalan her slotta (iade, düşürme,
 *    ölü iade) sırayla terfi ettirilir.
 */
export class ConnectionPool {
  private idle: IFileTransferClient[] = []
  private leased = new Set<IFileTransferClient>()
  private waiters: Waiter[] = []
  private size = 0
  private destroyed = false

  constructor(
    private readonly factory: () => IFileTransferClient,
    private readonly maxSize = 3,
    private readonly acquireTimeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS
  ) {}

  async acquire(): Promise<IFileTransferClient> {
    if (this.destroyed) throw new FerroError('NOT_CONNECTED', 'Bağlantı havuzu kapatıldı')

    // Boştaki bağlantılardan sağlıklı olanı bul; ölüleri muhasebeyle düşür.
    for (let reused = this.idle.pop(); reused; reused = this.idle.pop()) {
      if (reused.connected) {
        this.leased.add(reused)
        return reused
      }
      this.dropClient(reused)
    }

    if (this.size < this.maxSize) return this.openNew()

    // Limit dolu — bir slotun boşalmasını (zaman aşımıyla) bekle.
    return new Promise<IFileTransferClient>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = this.waiters.indexOf(waiter)
          if (i >= 0) this.waiters.splice(i, 1)
          reject(
            new FerroError(
              'CONNECTION_FAILED',
              'Havuzda boş bağlantı beklenirken zaman aşımına ulaşıldı'
            )
          )
        }, this.acquireTimeoutMs)
      }
      this.waiters.push(waiter)
    })
  }

  release(client: IFileTransferClient): void {
    this.leased.delete(client)
    if (this.destroyed || !client.connected) {
      this.dropClient(client)
      this.promoteWaiter()
      return
    }
    const waiter = this.takeWaiter()
    if (waiter) {
      this.leased.add(client)
      waiter.resolve(client)
    } else {
      this.idle.push(client)
    }
  }

  /** Bağlantı bozulduysa havuzdan düş; boşalan slot bekleyene devredilir. */
  discard(client: IFileTransferClient): void {
    this.leased.delete(client)
    this.dropClient(client)
    this.promoteWaiter()
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    for (const w of this.waiters.splice(0)) {
      clearTimeout(w.timer)
      w.reject(new FerroError('NOT_CONNECTED', 'Bağlantı havuzu kapatıldı'))
    }
    // Hem boştaki hem ödünç verilmiş (aktif transferdeki) bağlantılar kapatılır.
    const all = [...this.idle.splice(0), ...this.leased]
    this.leased.clear()
    await Promise.all(all.map((c) => c.disconnect().catch(() => undefined)))
    this.size = 0
  }

  /** Test/teşhis: anlık muhasebe görünümü. */
  stats(): { size: number; idle: number; leased: number; waiting: number } {
    return {
      size: this.size,
      idle: this.idle.length,
      leased: this.leased.size,
      waiting: this.waiters.length
    }
  }

  private async openNew(): Promise<IFileTransferClient> {
    this.size++
    try {
      const client = this.factory()
      await client.connect()
      // Bağlantı açılırken havuz kapatılmış olabilir: client'ı sızdırmadan kapat.
      // size düşürülmez — destroy() sayaçları zaten sıfırladı (promoteWaiter gibi
      // burada da destroy sonrası muhasebeye dokunulmaz).
      if (this.destroyed) {
        void client.disconnect().catch(() => undefined)
        throw new FerroError('NOT_CONNECTED', 'Bağlantı havuzu kapatıldı')
      }
      this.leased.add(client)
      log.debug(`yeni bağlantı açıldı (${this.size}/${this.maxSize})`)
      return client
    } catch (err) {
      if (!this.destroyed) {
        this.size--
        this.promoteWaiter()
      }
      throw err
    }
  }

  private takeWaiter(): Waiter | undefined {
    const w = this.waiters.shift()
    if (w) clearTimeout(w.timer)
    return w
  }

  /** Ölü/kapatılmış bir bağlantıyı muhasebeden düşürür. */
  private dropClient(client: IFileTransferClient): void {
    this.size--
    void client.disconnect().catch(() => undefined)
  }

  /** Boşalan slot için bekleyen varsa yeni bağlantı açıp devret. */
  private promoteWaiter(): void {
    if (this.destroyed || this.waiters.length === 0 || this.size >= this.maxSize) return
    const waiter = this.takeWaiter()
    if (!waiter) return
    this.size++
    const c = this.factory()
    c.connect()
      .then(() => {
        if (this.destroyed) {
          // destroy() sayaçları sıfırladı — muhasebeye dokunma, sadece kapat.
          void c.disconnect().catch(() => undefined)
          waiter.reject(new FerroError('NOT_CONNECTED', 'Bağlantı havuzu kapatıldı'))
          return
        }
        this.leased.add(c)
        waiter.resolve(c)
      })
      .catch((err) => {
        if (!this.destroyed) this.size--
        waiter.reject(err instanceof Error ? err : new Error(String(err)))
        // Bağlantı açılamadıysa sıradaki bekleyen de denesin (aynı hataya
        // çarpabilir ama asılı kalmaz — kendi zaman aşımı da var).
        this.promoteWaiter()
      })
  }
}
