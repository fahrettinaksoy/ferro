import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Geçici userData dizini + safeStorage taklidi.
const h = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-sites-'))
  return { dir }
})

vi.mock('electron', () => ({
  app: { getPath: () => h.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from('ENC:' + s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^ENC:/, '')
  }
}))

import { siteStore } from '../src/main/store/sites'
import { encryptionAvailable } from '../src/main/store/vault'

describe('SiteStore + vault', () => {
  it('parolayı şifreli saklar, düz metin diske yazılmaz', () => {
    const id = siteStore.upsert({
      name: 'Test',
      protocol: 'ftp',
      host: 'ftp.ornek.com',
      port: 21,
      user: 'kullanici',
      password: 'gizli-parola-123'
    })
    expect(id).toBeTruthy()
    expect(encryptionAvailable()).toBe(true)

    const raw = readFileSync(join(h.dir, 'sites.json'), 'utf8')
    expect(raw).not.toContain('gizli-parola-123') // düz metin yok
    expect(raw).toContain('v1:') // şifreli işaret
  })

  it('list() parolasız public görünüm verir', () => {
    const sites = siteStore.list()
    expect(sites.length).toBe(1)
    expect(sites[0]).not.toHaveProperty('secret')
    expect(sites[0].hasPassword).toBe(true)
  })

  it('buildConfig parolayı çözer', () => {
    const id = siteStore.list()[0].id
    const config = siteStore.buildConfig(id)
    expect(config?.password).toBe('gizli-parola-123')
  })

  it('güncellemede parola verilmezse korunur', () => {
    const id = siteStore.list()[0].id
    siteStore.upsert({
      id,
      name: 'Test (güncel)',
      protocol: 'sftp',
      host: 'ftp.ornek.com',
      port: 22,
      user: 'kullanici'
    })
    const config = siteStore.buildConfig(id)
    expect(config?.password).toBe('gizli-parola-123')
    expect(siteStore.list()[0].name).toBe('Test (güncel)')
  })

  it('silme kaydı kaldırır', () => {
    const id = siteStore.list()[0].id
    siteStore.remove(id)
    expect(siteStore.list().length).toBe(0)
  })
})
