import type { IFileTransferClient } from './IFileTransferClient'
import { createLogger } from '../core/logger'

const log = createLogger('pool')

/**
 * Site başına bağlantı havuzu. FTP kontrol bağlantısı seri çalıştığı için paralel transfer
 * ayrı bağlantılar gerektirir. acquire() boş bağlantı verir ya da limite kadar yeni açar;
 * limit doluysa boşalmayı bekler.
 */
export class ConnectionPool {
  private idle: IFileTransferClient[] = []
  private waiters: Array<(c: IFileTransferClient) => void> = []
  private size = 0
  private destroyed = false

  constructor(
    private readonly factory: () => IFileTransferClient,
    private readonly maxSize = 3
  ) {}

  async acquire(): Promise<IFileTransferClient> {
    if (this.destroyed) throw new Error('Havuz kapatıldı')
    const reused = this.idle.pop()
    if (reused && reused.connected) return reused

    if (this.size < this.maxSize) {
      this.size++
      try {
        const client = this.factory()
        await client.connect()
        log.debug(`yeni bağlantı açıldı (${this.size}/${this.maxSize})`)
        return client
      } catch (err) {
        this.size--
        throw err
      }
    }

    // Limit dolu — bir bağlantının iadesini bekle.
    return new Promise<IFileTransferClient>((resolve) => this.waiters.push(resolve))
  }

  release(client: IFileTransferClient): void {
    if (this.destroyed || !client.connected) {
      void client.disconnect().catch(() => undefined)
      this.size--
      return
    }
    const waiter = this.waiters.shift()
    if (waiter) waiter(client)
    else this.idle.push(client)
  }

  /** Bağlantı bozulduysa havuzdan düş. */
  discard(client: IFileTransferClient): void {
    this.size--
    void client.disconnect().catch(() => undefined)
    // Bekleyenler varsa yeni bağlantı açılabilsin diye slot serbest kaldı.
    const waiter = this.waiters.shift()
    if (waiter) {
      this.size++
      const c = this.factory()
      c.connect()
        .then(() => waiter(c))
        .catch(() => {
          this.size--
        })
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true
    const all = this.idle.splice(0)
    await Promise.all(all.map((c) => c.disconnect().catch(() => undefined)))
    this.size = 0
  }
}
