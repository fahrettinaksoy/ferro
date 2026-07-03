import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Readable } from 'stream'
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// SessionManager → ipc/router → electron zincirini kır: electron'u mock'la.
vi.mock('electron', () => ({
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn() }
}))

import { sessionManager } from '../src/main/transfer/SessionManager'
import type { ConnectionConfig, TransferJob } from '../src/shared/transfer'

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

// Renderer WebContents taklidi — emitLog buraya yazar.
const sentEvents: Array<{ channel: string; payload: unknown }> = []
const fakeSender = {
  isDestroyed: () => false,
  send: (_bridge: string, channel: string, payload: unknown) => {
    sentEvents.push({ channel, payload })
  }
} as never

const ftp: ConnectionConfig = {
  protocol: 'ftp',
  host: 'localhost',
  port: 21,
  user: 'ferro',
  password: 'ferropass'
}

describe('SessionManager (gerçek vsftpd, electron mock)', () => {
  let sessionId: string

  beforeAll(async () => {
    const res = await sessionManager.connect(ftp, fakeSender)
    sessionId = res.sessionId
  })

  afterAll(async () => {
    await sessionManager.disconnectAll()
  })

  it('bağlanır ve oturum açar', () => {
    expect(sessionId).toBeTruthy()
    expect(sessionManager.require(sessionId).connected).toBe(true)
  })

  it('session:log eventleri yayar (komut/yanıt akışı dahil)', () => {
    const logs = sentEvents.filter((e) => e.channel === 'session:log')
    expect(logs.length).toBeGreaterThan(0)
    // En az bir "Bağlandı" info satırı olmalı
    expect(logs.some((e) => (e.payload as { text: string }).text.includes('Bağlandı'))).toBe(true)
  })

  it('require() ile dizin listeler', async () => {
    const entries = await sessionManager.require(sessionId).list()
    expect(Array.isArray(entries)).toBe(true)
  })

  it('bilinmeyen oturum NOT_CONNECTED fırlatır', () => {
    expect(() => sessionManager.require('yok')).toThrowError(/Oturum bulunamadı/)
  })

  it('recursive klasör indirme: alt ağacı kuyruğa açar ve indirir', async () => {
    const client = sessionManager.require(sessionId)
    // Uzakta ağaç oluştur: rtree/a.txt + rtree/sub/b.txt
    await client.mkdir('rtree').catch(() => undefined)
    await client.mkdir('rtree/sub').catch(() => undefined)
    await client.upload(Readable.from(Buffer.from('icerik-A\n')), 'rtree/a.txt')
    await client.upload(Readable.from(Buffer.from('icerik-B\n')), 'rtree/sub/b.txt')

    const localDir = mkdtempSync(join(tmpdir(), 'ferro-rtree-'))
    sentEvents.length = 0
    sessionManager.enqueueTransfer(
      sessionId,
      'download',
      'rtree',
      join(localDir, 'rtree'),
      'rtree',
      true
    )

    const completed = (): TransferJob[] =>
      sentEvents
        .filter((e) => e.channel === 'transfer:update')
        .map((e) => e.payload as TransferJob)
        .filter((j) => j.status === 'completed')

    await waitFor(() => new Set(completed().map((j) => j.name)).size >= 2)

    expect(readFileSync(join(localDir, 'rtree', 'a.txt'), 'utf8')).toBe('icerik-A\n')
    expect(readFileSync(join(localDir, 'rtree', 'sub', 'b.txt'), 'utf8')).toBe('icerik-B\n')
    expect(existsSync(join(localDir, 'rtree', 'sub'))).toBe(true)

    // Temizlik (best-effort)
    await client.delete('rtree/a.txt').catch(() => undefined)
    await client.delete('rtree/sub/b.txt').catch(() => undefined)
    await client.rmdir('rtree/sub').catch(() => undefined)
    await client.rmdir('rtree').catch(() => undefined)
    rmSync(localDir, { recursive: true, force: true })
  })

  it('compareDirs: yerel/uzak farkları doğru raporlar', async () => {
    const client = sessionManager.require(sessionId)
    await client.mkdir('sdir').catch(() => undefined)
    await client.upload(Readable.from(Buffer.from('uzak-icerik')), 'sdir/ortak.txt')

    const localDir = mkdtempSync(join(tmpdir(), 'ferro-sync-'))
    writeFileSync(join(localDir, 'ortak.txt'), 'yerel-icerik-daha-uzun') // farklı boyut
    writeFileSync(join(localDir, 'sadece-yerel.txt'), 'x')

    const entries = await sessionManager.compareDirs(sessionId, localDir, 'sdir')
    const ortak = entries.find((e) => e.name === 'ortak.txt')
    const yerel = entries.find((e) => e.name === 'sadece-yerel.txt')

    expect(ortak?.inLocal).toBe(true)
    expect(ortak?.inRemote).toBe(true)
    expect(ortak?.localSize).not.toBe(ortak?.remoteSize) // farklı
    expect(yerel?.inLocal).toBe(true)
    expect(yerel?.inRemote).toBe(false)

    await client.delete('sdir/ortak.txt').catch(() => undefined)
    await client.rmdir('sdir').catch(() => undefined)
    rmSync(localDir, { recursive: true, force: true })
  })
})
