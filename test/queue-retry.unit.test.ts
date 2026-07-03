import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'
import type { Writable } from 'stream'
import { ConnectionPool } from '../src/main/transfer/ConnectionPool'
import { TransferQueue } from '../src/main/transfer/TransferQueue'
import { getRuntimeSettings, setRuntimeSettings } from '../src/main/core/runtimeSettings'
import { FerroError, type FerroErrorCode } from '../src/shared/errors'
import type { IFileTransferClient } from '../src/main/transfer/IFileTransferClient'
import type { RemoteEntry, TransferJob } from '../src/shared/transfer'

// Testlerde hızlı retry: taban gecikmeyi kısalt (varsayılan 5 sn testi bekletir).
beforeEach(() => {
  setRuntimeSettings({ ...getRuntimeSettings(), retryMaxAttempts: 3, retryDelayMs: 10 })
})

const CONTENT = 'retry-test-icerik'

/** İlk N denemede verilen kodla başarısız olan, sonra başarılı indiren sahte istemci. */
function makeFailingFactory(
  failures: number,
  code: FerroErrorCode
): { factory: () => IFileTransferClient; calls: () => number } {
  let downloads = 0
  const factory = (): IFileTransferClient => ({
    connected: true,
    async connect() {},
    async disconnect() {},
    pwd: async () => '/',
    cwd: async () => undefined,
    list: async () => [],
    stat: async (): Promise<RemoteEntry> => ({
      name: 'x',
      type: 'file',
      size: CONTENT.length,
      modifiedAt: null,
      permissions: null
    }),
    async download(_remote: string, dest: Writable): Promise<void> {
      downloads++
      if (downloads <= failures) {
        dest.destroy()
        throw new FerroError(code, 'sahte hata')
      }
      await new Promise<void>((resolve, reject) => {
        dest.once('error', reject)
        dest.end(CONTENT, resolve)
      })
    },
    async upload() {},
    delete: async () => undefined,
    rename: async () => undefined,
    mkdir: async () => undefined,
    rmdir: async () => undefined,
    chmod: async () => undefined
  })
  return { factory, calls: () => downloads }
}

function waitFor(predicate: () => boolean, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = (): void => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('zaman aşımı'))
      setTimeout(tick, 25)
    }
    tick()
  })
}

describe('TransferQueue — retry/backoff', () => {
  it('geçici hatada backoff ile yeniden dener ve başarır', async () => {
    const { factory, calls } = makeFailingFactory(1, 'TRANSFER_FAILED')
    const pool = new ConnectionPool(factory, 2)
    const updates: TransferJob[] = []
    const queue = new TransferQueue('s-retry', pool, (j) => updates.push({ ...j }))

    const local = join(mkdtempSync(join(tmpdir(), 'ferro-retry-')), 'a.txt')
    const id = queue.enqueue('download', 'a.txt', '/a.txt', local)

    await waitFor(() => updates.some((u) => u.id === id && u.status === 'completed'))

    expect(calls()).toBe(2) // 1 başarısız + 1 başarılı
    // Retry ara durumu: attempt=1 ile yeniden 'queued' yayılmış olmalı.
    expect(updates.some((u) => u.status === 'queued' && u.attempt === 1)).toBe(true)
    await pool.destroy()
  }, 20_000)

  it('tüm denemeler tükenince failed olur', async () => {
    const { factory, calls } = makeFailingFactory(99, 'TRANSFER_FAILED')
    const pool = new ConnectionPool(factory, 2)
    const updates: TransferJob[] = []
    const queue = new TransferQueue('s-retry2', pool, (j) => updates.push({ ...j }))

    const local = join(mkdtempSync(join(tmpdir(), 'ferro-retry-')), 'b.txt')
    const id = queue.enqueue('download', 'b.txt', '/b.txt', local)

    await waitFor(() => updates.some((u) => u.id === id && u.status === 'failed'))
    expect(calls()).toBe(3) // MAX_ATTEMPTS
    await pool.destroy()
  }, 20_000)

  it('kalıcı hata (AUTH_FAILED) yeniden denenmez', async () => {
    const { factory, calls } = makeFailingFactory(99, 'AUTH_FAILED')
    const pool = new ConnectionPool(factory, 2)
    const updates: TransferJob[] = []
    const queue = new TransferQueue('s-retry3', pool, (j) => updates.push({ ...j }))

    const local = join(mkdtempSync(join(tmpdir(), 'ferro-retry-')), 'c.txt')
    const id = queue.enqueue('download', 'c.txt', '/c.txt', local)

    await waitFor(() => updates.some((u) => u.id === id && u.status === 'failed'))
    expect(calls()).toBe(1) // tek deneme
    expect(updates.some((u) => u.status === 'queued' && (u.attempt ?? 0) > 0)).toBe(false)
    await pool.destroy()
  })
})
