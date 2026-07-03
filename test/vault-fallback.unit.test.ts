import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// safeStorage'ın OLMADIĞI ortam (keyring'siz Linux): parola kalıcı SAKLANMAMALI.
const h = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-vault-'))
  return { dir }
})

vi.mock('electron', () => ({
  app: { getPath: () => h.dir, getAppPath: () => h.dir },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('kullanılmamalı')
    },
    decryptString: () => {
      throw new Error('kullanılmamalı')
    }
  }
}))

import { siteStore } from '../src/main/store/sites'
import { encryptSecret, decryptSecret, encryptionAvailable } from '../src/main/store/vault'

describe('vault — safeStorage yokken', () => {
  it('encryptionAvailable false döner', () => {
    expect(encryptionAvailable()).toBe(false)
  })

  it('encryptSecret null döner — düz metin/base64 üretmez', () => {
    expect(encryptSecret('gizli')).toBeNull()
  })

  it('eski p0: kayıtları geri uyumlu şekilde okunabilir', () => {
    const legacy = 'p0:' + Buffer.from('eski-parola', 'utf8').toString('base64')
    expect(decryptSecret(legacy)).toBe('eski-parola')
  })

  it('site kaydında parola diske YAZILMAZ, hasPassword false olur', () => {
    const id = siteStore.upsert({
      name: 'Keyringsiz',
      protocol: 'ftp',
      host: 'ftp.ornek.com',
      port: 21,
      user: 'u',
      password: 'cok-gizli-parola'
    })
    const raw = readFileSync(join(h.dir, 'sites.json'), 'utf8')
    expect(raw).not.toContain('cok-gizli-parola')
    expect(raw).not.toContain(Buffer.from('cok-gizli-parola', 'utf8').toString('base64'))

    const site = siteStore.list().find((s) => s.id === id)!
    expect(site.hasPassword).toBe(false)
    expect(siteStore.buildConfig(id)?.password).toBeUndefined()
  })
})
