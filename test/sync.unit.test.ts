import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { SyncPayload } from '../src/shared/sync'
import { FerroError } from '../src/shared/errors'

// Geçici userData dizini + safeStorage taklidi (sites.unit.test deseninde).
const h = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-sync-'))
  return { dir }
})

vi.mock('electron', () => ({
  app: { getPath: () => h.dir, getAppPath: () => h.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from('ENC:' + s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^ENC:/, '')
  }
}))

import { encryptSyncPayload, decryptSyncPayload } from '../src/main/sync/crypto'
import { syncConfigStore } from '../src/main/store/syncConfig'

function samplePayload(): SyncPayload {
  return {
    kind: 'ferro-sync-payload',
    version: 1,
    updatedAt: '2026-07-03T10:00:00.000Z',
    sites: [
      {
        name: 'Sunucu',
        protocol: 'sftp',
        host: 'sftp.ornek.com',
        port: 22,
        user: 'ali',
        password: 'cok-gizli-parola'
      }
    ],
    settings: { 'ferro.themeMode': 'dark', 'ferro.lang': 'tr' }
  }
}

describe('sync crypto (scrypt + AES-256-GCM)', () => {
  it('şifrele/çöz gidiş-dönüşü yükü aynen korur', () => {
    const blob = encryptSyncPayload(samplePayload(), 'sync-parolam')
    expect(blob.kind).toBe('ferro-sync')
    expect(blob.cipher).toBe('aes-256-gcm')
    const back = decryptSyncPayload(blob, 'sync-parolam')
    expect(back).toEqual(samplePayload())
  })

  it('şifreli blob düz metin sır içermez', () => {
    const blob = encryptSyncPayload(samplePayload(), 'sync-parolam')
    const raw = JSON.stringify(blob)
    expect(raw).not.toContain('cok-gizli-parola')
    expect(raw).not.toContain('sftp.ornek.com')
    expect(raw).not.toContain('ferro.themeMode')
  })

  it('yanlış parola AUTH_FAILED fırlatır', () => {
    const blob = encryptSyncPayload(samplePayload(), 'dogru-parola')
    try {
      decryptSyncPayload(blob, 'yanlis-parola')
      expect.unreachable('çözmemeliydi')
    } catch (err) {
      expect((err as FerroError).code).toBe('AUTH_FAILED')
    }
  })

  it('kurcalanmış veri AUTH_FAILED fırlatır (GCM bütünlüğü)', () => {
    const blob = encryptSyncPayload(samplePayload(), 'parola')
    const bytes = Buffer.from(blob.data, 'base64')
    bytes[0] ^= 0xff
    blob.data = bytes.toString('base64')
    try {
      decryptSyncPayload(blob, 'parola')
      expect.unreachable('çözmemeliydi')
    } catch (err) {
      expect((err as FerroError).code).toBe('AUTH_FAILED')
    }
  })

  it('aşırı KDF parametreleri reddedilir (bellek bombası koruması)', () => {
    const blob = encryptSyncPayload(samplePayload(), 'parola')
    blob.kdf.N = 1 << 24
    try {
      decryptSyncPayload(blob, 'parola')
      expect.unreachable('çözmemeliydi')
    } catch (err) {
      expect((err as FerroError).code).toBe('VALIDATION')
    }
  })
})

describe('SyncConfigStore', () => {
  it('sırları vault formatında saklar, düz metin diske yazılmaz', () => {
    syncConfigStore.update({
      provider: 'gist',
      include: { sites: true, settings: false },
      gist: { gistId: 'abc123', token: 'ghp_gizli_token' },
      webdav: { url: 'https://dav.ornek.com/ferro', user: 'ali', password: 'dav-parolasi' },
      syncPassword: 'sync-anahtari'
    })
    const raw = readFileSync(join(h.dir, 'sync.json'), 'utf8')
    expect(raw).not.toContain('ghp_gizli_token')
    expect(raw).not.toContain('dav-parolasi')
    expect(raw).not.toContain('sync-anahtari')
    expect(raw).toContain('v1:') // vault işareti
  })

  it('public görünüm sır döndürmez, yalnızca var/yok bildirir', () => {
    const pub = syncConfigStore.toPublic()
    expect(pub.gist).toEqual({ gistId: 'abc123', hasToken: true })
    expect(pub.webdav).toEqual({
      url: 'https://dav.ornek.com/ferro',
      user: 'ali',
      hasPassword: true
    })
    expect(pub.hasSyncPassword).toBe(true)
    expect(pub.include).toEqual({ sites: true, settings: false })
    expect(JSON.stringify(pub)).not.toContain('gizli')
  })

  it('sır alanı verilmezse mevcut değer korunur', () => {
    syncConfigStore.update({
      provider: 'webdav',
      include: { sites: true, settings: true },
      gist: { gistId: 'abc123' }, // token yok → korunur
      webdav: { url: 'https://dav.ornek.com/ferro', user: 'veli' }, // parola yok → korunur
      syncPassword: undefined // korunur
    })
    expect(syncConfigStore.gistCredentials().token).toBe('ghp_gizli_token')
    expect(syncConfigStore.webdavCredentials().password).toBe('dav-parolasi')
    expect(syncConfigStore.syncPassword()).toBe('sync-anahtari')
    expect(syncConfigStore.provider()).toBe('webdav')
  })

  it('markSynced son eşitleme bilgisini işler', () => {
    syncConfigStore.markSynced('push')
    const pub = syncConfigStore.toPublic()
    expect(pub.lastDirection).toBe('push')
    expect(pub.lastSyncAt).toBeTruthy()
  })
})
