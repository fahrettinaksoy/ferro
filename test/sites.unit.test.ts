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
  app: { getPath: () => h.dir, getAppPath: () => h.dir },
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

describe('SiteStore içe/dışa aktarma', () => {
  it('dışa aktarma id içermez; parola yalnızca istenirse ve düz metin verilir', () => {
    siteStore.upsert({
      name: 'Aktarım',
      folder: 'Grup',
      protocol: 'sftp',
      host: 'sftp.ornek.com',
      port: 22,
      user: 'ali',
      password: 'cok-gizli',
      comment: 'not'
    })

    const without = siteStore.exportSites(false)
    expect(without.length).toBe(1)
    expect(without[0]).not.toHaveProperty('id')
    expect(without[0].password).toBeUndefined()
    expect(without[0].comment).toBe('not')

    const withPw = siteStore.exportSites(true)
    expect(withPw[0].password).toBe('cok-gizli')
  })

  it('içe aktarma yeni id üretir, parolayı şifreler, yinelenenleri atlar', () => {
    const entries = siteStore.exportSites(true)
    // Aynı kayıt → yinelenen; farklı host → yeni kayıt.
    const fresh = { ...entries[0], host: 'BASKA.ornek.com', password: 'yeni-parola' }
    const r1 = siteStore.importSites([...entries, fresh])
    expect(r1).toEqual({ imported: 1, skipped: 1 })

    const imported = siteStore.list().find((s) => s.host === 'BASKA.ornek.com')
    expect(imported).toBeTruthy()
    expect(imported!.hasPassword).toBe(true)
    expect(siteStore.buildConfig(imported!.id)?.password).toBe('yeni-parola')

    // Host karşılaştırması büyük/küçük harf duyarsız: tekrar içe aktarım eklemez.
    const r2 = siteStore.importSites([{ ...fresh, host: 'baska.ORNEK.com' }])
    expect(r2).toEqual({ imported: 0, skipped: 1 })

    const raw = readFileSync(join(h.dir, 'sites.json'), 'utf8')
    expect(raw).not.toContain('yeni-parola') // düz metin diske yazılmaz
  })

  it('"parola sorulsun" kayıtlarında parola yok sayılır', () => {
    const r = siteStore.importSites([
      {
        name: 'Sorulan',
        protocol: 'ftp',
        host: 'ask.ornek.com',
        port: 21,
        user: 'veli',
        password: 'sızmamalı',
        askPassword: true
      }
    ])
    expect(r.imported).toBe(1)
    const s = siteStore.list().find((x) => x.host === 'ask.ornek.com')
    expect(s!.hasPassword).toBe(false)
    const raw = readFileSync(join(h.dir, 'sites.json'), 'utf8')
    expect(raw).not.toContain('sızmamalı')
  })
})
