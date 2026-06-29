import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Readable } from 'stream'
import { readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { FtpAdapter } from '../src/main/transfer/adapters/FtpAdapter'
import { ConnectionPool } from '../src/main/transfer/ConnectionPool'
import { TransferQueue } from '../src/main/transfer/TransferQueue'
import type { ConnectionConfig, TransferJob } from '../src/shared/transfer'

const config: ConnectionConfig = {
  protocol: 'ftp',
  host: 'localhost',
  port: 21,
  user: 'ferro',
  password: 'ferropass'
}

const NAMES = ['qtest-0.txt', 'qtest-1.txt', 'qtest-2.txt', 'qtest-3.txt']
const content = (i: number): string => `ferro kuyruk testi #${i} · çğşüöı\n`.repeat(50)

function waitFor(predicate: () => boolean, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = (): void => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('zaman aşımı'))
      setTimeout(tick, 50)
    }
    tick()
  })
}

describe('TransferQueue + ConnectionPool (gerçek vsftpd)', () => {
  const setup = new FtpAdapter(config)
  const tmpFiles: string[] = []

  beforeAll(async () => {
    await setup.connect()
    // Sunucuya indirilecek dosyaları hazırla.
    for (let i = 0; i < NAMES.length; i++) {
      await setup.upload(Readable.from(Buffer.from(content(i))), NAMES[i])
    }
  })

  afterAll(async () => {
    for (const n of NAMES) await setup.delete(n).catch(() => undefined)
    await setup.disconnect()
    for (const f of tmpFiles) rmSync(f, { force: true })
  })

  it('çoklu indirmeyi havuzla paralel işler, durum geçişlerini yayar', async () => {
    const updates: TransferJob[] = []
    const pool = new ConnectionPool(() => new FtpAdapter(config), 2)
    const queue = new TransferQueue('s-test', pool, (job) => updates.push({ ...job }))

    const ids: string[] = []
    for (const n of NAMES) {
      const local = join(tmpdir(), `ferro-${n}`)
      tmpFiles.push(local)
      ids.push(queue.enqueue('download', n, n, local))
    }

    // Tüm işler tamamlanana kadar bekle.
    await waitFor(() =>
      ids.every((id) => {
        const last = [...updates].reverse().find((u) => u.id === id)
        return last?.status === 'completed'
      })
    )

    // İçerikler doğru inmeli.
    for (let i = 0; i < NAMES.length; i++) {
      const local = join(tmpdir(), `ferro-${NAMES[i]}`)
      expect(readFileSync(local, 'utf8')).toBe(content(i))
    }

    // Durum geçişleri: en az bir 'active' ve her iş için 'completed' görülmeli.
    expect(updates.some((u) => u.status === 'active')).toBe(true)
    expect(updates.filter((u) => u.status === 'completed').length).toBe(NAMES.length)

    await pool.destroy()
  })

  it('yarım inen dosyayı resume ile tamamlar (FTP REST)', async () => {
    const updates: TransferJob[] = []
    const pool = new ConnectionPool(() => new FtpAdapter(config), 1)
    const queue = new TransferQueue('s-resume', pool, (job) => updates.push({ ...job }))

    const full = Buffer.from(content(0))
    const local = join(tmpdir(), 'ferro-resume.txt')
    tmpFiles.push(local)
    // Dosyanın ilk yarısını yerele yaz (yarım inmiş gibi).
    writeFileSync(local, full.subarray(0, Math.floor(full.length / 2)))

    const id = queue.enqueue('download', NAMES[0], NAMES[0], local)
    await waitFor(() => {
      const last = [...updates].reverse().find((u) => u.id === id)
      return last?.status === 'completed'
    })

    expect(readFileSync(local)).toEqual(full)
    // Resume kanıtı: offset snapshot'ı yarı boyutta görülmeli (sıfırdan değil).
    const half = Math.floor(full.length / 2)
    expect(updates.some((u) => u.id === id && u.bytes === half)).toBe(true)
    await pool.destroy()
  })

  it('cancel bilinmeyen job için güvenli (no-op)', () => {
    const pool = new ConnectionPool(() => new FtpAdapter(config), 1)
    const queue = new TransferQueue('s-test2', pool, () => {})
    expect(() => queue.cancel('yok')).not.toThrow()
  })
})
