import { describe, it, expect, vi } from 'vitest'

// safeStorage MEVCUT ama master modu AES kullanır (safeStorage'a bağlı değil).
const h = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-vaultm-'))
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

import { vault, encryptSecret, decryptSecret } from '../src/main/store/vault'

describe('vault — master parola (scrypt + AES-256-GCM)', () => {
  it('başlangıçta OS modunda', () => {
    expect(vault.mode()).toBe('os')
    expect(vault.hasMaster()).toBe(false)
    expect(vault.isLocked()).toBe(false)
  })

  it('master parola ayarlanır ve sır AES ile yuvarlanır', () => {
    vault.setMaster(undefined, 'ana-parola-123')
    expect(vault.mode()).toBe('master')
    expect(vault.hasMaster()).toBe(true)
    expect(vault.isLocked()).toBe(false) // ayarlarken anahtar bellekte

    const enc = encryptSecret('gizli-parola')
    expect(enc).toMatch(/^m1:/)
    expect(enc).not.toContain('gizli-parola')
    expect(decryptSecret(enc as string)).toBe('gizli-parola')
  })

  it('doğru parola doğrulanır, yanlış reddedilir', () => {
    expect(vault.verifyMaster('ana-parola-123')).toBe(true)
    expect(vault.verifyMaster('yanlış')).toBe(false)
  })

  it('parola değiştirilirken mevcut parola doğrulanır', () => {
    const enc = encryptSecret('x') as string
    // yanlış mevcut parola → hata
    expect(() => vault.setMaster('yanlış', 'yeni')).toThrowError(
      expect.objectContaining({ code: 'AUTH_FAILED' })
    )
    // doğru mevcut parola → başarır, ESKİ sır yeni anahtarla artık çözülemez
    vault.setMaster('ana-parola-123', 'yeni-ana-parola')
    expect(vault.verifyMaster('yeni-ana-parola')).toBe(true)
    // eski anahtarla üretilen blob yeni anahtarla çözülemez (boş döner)
    expect(decryptSecret(enc)).toBe('')
  })

  it('OS moduna geri dönüşte yanlış parola reddedilir', () => {
    expect(() => vault.disableMaster('yanlış')).toThrowError(
      expect.objectContaining({ code: 'AUTH_FAILED' })
    )
    vault.disableMaster('yeni-ana-parola')
    expect(vault.mode()).toBe('os')
    expect(vault.hasMaster()).toBe(false)
  })
})
