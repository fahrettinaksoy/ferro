import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Readable } from 'stream'
import { readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SftpAdapter } from '../src/main/transfer/adapters/SftpAdapter'
import { ConnectionPool } from '../src/main/transfer/ConnectionPool'
import { TransferQueue } from '../src/main/transfer/TransferQueue'
import type { ConnectionConfig, TransferJob } from '../src/shared/transfer'

// Bu test çalışmadan önce: docker compose -f test/docker-compose.yml up -d
// atmoz/sftp: kullanıcı ferro, yazılabilir dizin /upload
const config: ConnectionConfig = {
  protocol: 'sftp',
  host: 'localhost',
  port: 2222,
  user: 'ferro',
  password: 'ferropass'
}

const REMOTE_DL = '/upload/sftp-resume-dl.txt'
const REMOTE_UL = '/upload/sftp-resume-ul.txt'
const FULL = Buffer.from('ferro sftp resume · çğşüöı\n'.repeat(200))
const HALF = Math.floor(FULL.length / 2)

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

describe('SFTP resume (gerçek atmoz/sftp konteynerine karşı)', () => {
  const setup = new SftpAdapter(config)
  const tmpFiles: string[] = []

  beforeAll(async () => {
    await setup.connect()
  })

  afterAll(async () => {
    await setup.delete(REMOTE_DL).catch(() => undefined)
    await setup.delete(REMOTE_UL).catch(() => undefined)
    await setup.disconnect()
    for (const f of tmpFiles) rmSync(f, { force: true })
  })

  it('yarım inen dosyayı offset ile tamamlar (indirme)', async () => {
    await setup.upload(Readable.from(FULL), REMOTE_DL)

    const updates: TransferJob[] = []
    const pool = new ConnectionPool(() => new SftpAdapter(config), 1)
    const queue = new TransferQueue('s-sftp-dl', pool, (job) => updates.push({ ...job }))

    const local = join(tmpdir(), 'ferro-sftp-resume-dl.txt')
    tmpFiles.push(local)
    writeFileSync(local, FULL.subarray(0, HALF)) // yarım inmiş gibi

    const id = queue.enqueue('download', 'sftp-resume-dl.txt', REMOTE_DL, local)
    await waitFor(() => {
      const last = [...updates].reverse().find((u) => u.id === id)
      return last?.status === 'completed'
    })

    expect(readFileSync(local)).toEqual(FULL)
    // Resume kanıtı: ilk yayında bytes offset'ten başlamalı (sıfırdan değil).
    expect(updates.some((u) => u.id === id && u.bytes === HALF)).toBe(true)
    await pool.destroy()
  })

  it('yarım yüklenen dosyayı append ile tamamlar (yükleme)', async () => {
    // Uzakta ilk yarı var (yarım kalmış yükleme gibi).
    await setup.upload(Readable.from(FULL.subarray(0, HALF)), REMOTE_UL)

    const updates: TransferJob[] = []
    const pool = new ConnectionPool(() => new SftpAdapter(config), 1)
    const queue = new TransferQueue('s-sftp-ul', pool, (job) => updates.push({ ...job }))

    const local = join(tmpdir(), 'ferro-sftp-resume-ul.txt')
    tmpFiles.push(local)
    writeFileSync(local, FULL)

    const id = queue.enqueue('upload', 'sftp-resume-ul.txt', REMOTE_UL, local)
    await waitFor(() => {
      const last = [...updates].reverse().find((u) => u.id === id)
      return last?.status === 'completed'
    })

    // Uzak dosya tam içeriğe eşit olmalı (ikinci yarı append edildi).
    const chunks: Buffer[] = []
    const { Writable } = await import('stream')
    const sink = new Writable({
      write(chunk, _enc, cb): void {
        chunks.push(Buffer.from(chunk))
        cb()
      }
    })
    await setup.download(REMOTE_UL, sink)
    expect(Buffer.concat(chunks)).toEqual(FULL)
    expect(updates.some((u) => u.id === id && u.bytes === HALF)).toBe(true)
    await pool.destroy()
  })
})
