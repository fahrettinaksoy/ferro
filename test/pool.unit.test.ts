import { describe, it, expect } from 'vitest'
import { ConnectionPool } from '../src/main/transfer/ConnectionPool'
import type { IFileTransferClient } from '../src/main/transfer/IFileTransferClient'

/** Testler için asgari sahte istemci. */
class FakeClient implements IFileTransferClient {
  connected = false
  connectCount = 0
  disconnectCount = 0
  constructor(private readonly failConnect = false) {}

  async connect(): Promise<void> {
    this.connectCount++
    if (this.failConnect) throw new Error('bağlanamadı')
    this.connected = true
  }
  async disconnect(): Promise<void> {
    this.disconnectCount++
    this.connected = false
  }
  // Havuz testlerinde kullanılmayan üyeler:
  pwd = async (): Promise<string> => '/'
  cwd = async (): Promise<void> => undefined
  list = async (): Promise<never[]> => []
  stat = (): Promise<never> => Promise.reject(new Error('yok'))
  download = async (): Promise<void> => undefined
  upload = async (): Promise<void> => undefined
  delete = async (): Promise<void> => undefined
  rename = async (): Promise<void> => undefined
  mkdir = async (): Promise<void> => undefined
  rmdir = async (): Promise<void> => undefined
  chmod = async (): Promise<void> => undefined
}

describe('ConnectionPool', () => {
  it('maxSize kadar bağlantı açar, fazlası iadeyi bekler', async () => {
    const pool = new ConnectionPool(() => new FakeClient(), 2)
    const a = await pool.acquire()
    const b = await pool.acquire()
    expect(pool.stats()).toMatchObject({ size: 2, leased: 2, idle: 0 })

    let resolved = false
    const third = pool.acquire().then((c) => {
      resolved = true
      return c
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(resolved).toBe(false)
    expect(pool.stats().waiting).toBe(1)

    pool.release(a)
    const c = await third
    expect(c).toBe(a) // iade edilen bağlantı bekleyene devredilir
    expect(pool.stats()).toMatchObject({ size: 2, leased: 2, waiting: 0 })
    pool.release(b)
    pool.release(c)
  })

  it('boştaki ölü bağlantı muhasebeyle düşürülür — size kayması olmaz', async () => {
    const pool = new ConnectionPool(() => new FakeClient(), 2)
    const a = await pool.acquire()
    pool.release(a)
    a.connected = false // boşta beklerken bağlantı koptu

    const b = await pool.acquire() // ölüyü düşürüp YENİ bağlantı açmalı
    expect(b).not.toBe(a)
    expect((a as FakeClient).disconnectCount).toBe(1)
    // size doğru: hâlâ 2 bağlantı daha açılabilir olmalı (1 leased + 1 slot)
    const c = await pool.acquire()
    expect(pool.stats()).toMatchObject({ size: 2, leased: 2 })
    pool.release(b)
    pool.release(c)
  })

  it('ölü bağlantı iadesi bekleyeni terfi ettirir (asılı kalmaz)', async () => {
    const pool = new ConnectionPool(() => new FakeClient(), 1)
    const a = await pool.acquire()
    const waiting = pool.acquire()

    a.connected = false // transfer sırasında koptu
    pool.release(a) // ölü iade → bekleyen için YENİ bağlantı açılmalı

    const b = await waiting
    expect(b).not.toBe(a)
    expect(b.connected).toBe(true)
    pool.release(b)
  })

  it('discard boşalan slotu bekleyene devreder', async () => {
    const pool = new ConnectionPool(() => new FakeClient(), 1)
    const a = await pool.acquire()
    const waiting = pool.acquire()
    pool.discard(a)
    const b = await waiting
    expect(b).not.toBe(a)
    pool.release(b)
  })

  it('acquire zaman aşımı: havuz tıkalıysa hata fırlatır', async () => {
    const pool = new ConnectionPool(() => new FakeClient(), 1, 50)
    await pool.acquire() // slot dolu, iade edilmiyor
    await expect(pool.acquire()).rejects.toMatchObject({ code: 'CONNECTION_FAILED' })
  })

  it('bağlantı açılamıyorsa acquire reddedilir', async () => {
    const pool = new ConnectionPool(() => new FakeClient(true), 1)
    await expect(pool.acquire()).rejects.toThrow('bağlanamadı')
    // başarısız açılış slotu geri bırakır — sonraki deneme yine slot bulur
    await expect(pool.acquire()).rejects.toThrow('bağlanamadı')
    expect(pool.stats().size).toBe(0)
  })

  it('bekleyen için açılan bağlantı başarısız olursa bekleyen reddedilir', async () => {
    let calls = 0
    const pool = new ConnectionPool(() => new FakeClient(++calls > 1), 1)
    const a = await pool.acquire()
    const waiting = pool.acquire()
    pool.discard(a) // slot boşaldı → bekleyen için yeni bağlantı denenir (artık başarısız)
    await expect(waiting).rejects.toThrow('bağlanamadı')
    expect(pool.stats()).toMatchObject({ size: 0, waiting: 0 })
  })

  it('destroy bekleyenleri reddeder ve AKTİF (leased) bağlantıları da kapatır', async () => {
    const pool = new ConnectionPool(() => new FakeClient(), 1)
    const a = (await pool.acquire()) as FakeClient
    const waiting = pool.acquire()

    await pool.destroy()

    await expect(waiting).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
    expect(a.disconnectCount).toBe(1) // aktif transferin bağlantısı sızmadı
    await expect(pool.acquire()).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })

  it('destroy sonrası iade edilen bağlantı kapatılır', async () => {
    const pool = new ConnectionPool(() => new FakeClient(), 2)
    const a = (await pool.acquire()) as FakeClient
    const destroyPromise = pool.destroy()
    pool.release(a)
    await destroyPromise
    expect(a.disconnectCount).toBeGreaterThanOrEqual(1)
  })

  it('stats doğru sayar', async () => {
    const pool = new ConnectionPool(() => new FakeClient(), 3)
    const a = await pool.acquire()
    const b = await pool.acquire()
    pool.release(a)
    expect(pool.stats()).toEqual({ size: 2, idle: 1, leased: 1, waiting: 0 })
    pool.release(b)
    expect(pool.stats()).toEqual({ size: 2, idle: 2, leased: 0, waiting: 0 })
  })

  it('destroy, açılmakta olan bağlantıyı sızdırmaz (openNew yarışı)', async () => {
    let openGate!: () => void
    const gate = new Promise<void>((r) => (openGate = r))
    class SlowClient extends FakeClient {
      override async connect(): Promise<void> {
        await gate
        await super.connect()
      }
    }
    const client = new SlowClient()
    const pool = new ConnectionPool(() => client, 1)

    const acquiring = pool.acquire() // connect gate'te asılı
    const destroying = pool.destroy() // bu sırada havuz kapatılıyor
    openGate() // connect şimdi tamamlanır
    await destroying

    await expect(acquiring).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
    // Sızıntı yok: geç açılan bağlantı kapatıldı, muhasebe sıfır.
    expect(client.disconnectCount).toBeGreaterThanOrEqual(1)
    expect(pool.stats()).toMatchObject({ size: 0, leased: 0, idle: 0 })
  })
})
