import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { validatePayload, isKnownChannel } from '../src/main/ipc/validation'
import { safeLocalPath, safeDestructiveLocalPath } from '../src/main/ipc/handlers/localPaths'

describe('IPC yük doğrulama (zod)', () => {
  it('geçerli connection:connect yükünü kabul eder', () => {
    const payload = {
      protocol: 'sftp',
      host: 'example.com',
      port: 22,
      user: 'u',
      password: 'p'
    }
    expect(validatePayload('connection:connect', payload)).toMatchObject(payload)
  })

  it('geçersiz port VALIDATION hatası fırlatır', () => {
    expect(() =>
      validatePayload('connection:connect', {
        protocol: 'ftp',
        host: 'x',
        port: 99999,
        user: ''
      })
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('bilinmeyen alanları süzer (strip)', () => {
    const out = validatePayload('sites:delete', {
      id: 'abc',
      surpriseField: 'ignored'
    }) as Record<string, unknown>
    expect(out).toEqual({ id: 'abc' })
    expect('surpriseField' in out).toBe(false)
  })

  it('local:list göreli yolu reddeder', () => {
    expect(() => validatePayload('local:list', { path: '../etc' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
  })

  it('local:delete null bayt içeren yolu reddeder', () => {
    expect(() => validatePayload('local:delete', { path: '/tmp/x\0y' })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
  })

  it('transfer:enqueue yol ayırıcılı adı reddeder', () => {
    expect(() =>
      validatePayload('transfer:enqueue', {
        sessionId: 's1',
        direction: 'download',
        remotePath: '/a/b',
        localPath: '/tmp/b',
        name: '../evil'
      })
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('void kanallar undefined yükü kabul eder', () => {
    expect(validatePayload('sites:list', undefined)).toBeUndefined()
  })

  it('isKnownChannel bilinmeyeni ayırt eder', () => {
    expect(isKnownChannel('sites:list')).toBe(true)
    expect(isKnownChannel('hacker:channel')).toBe(false)
  })
})

describe('yerel yol korumaları', () => {
  it('göreli yol reddedilir', () => {
    expect(() => safeLocalPath('etc/passwd')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
  })

  it('".." dizileri normalize edilir', () => {
    expect(safeLocalPath('/tmp/a/../b')).toBe('/tmp/b')
  })

  it('yıkıcı işlem: dosya sistemi kökü reddedilir', () => {
    expect(() => safeDestructiveLocalPath('/')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
    // normalize sonrası köke inen yol da reddedilir
    expect(() => safeDestructiveLocalPath('/tmp/..')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
  })

  it('yıkıcı işlem: ev dizininin kendisi reddedilir', () => {
    expect(() => safeDestructiveLocalPath(homedir())).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' })
    )
  })

  it('normal alt dizin yıkıcı işlem için kabul edilir', () => {
    expect(safeDestructiveLocalPath('/tmp/ferro-test/dosya.txt')).toBe('/tmp/ferro-test/dosya.txt')
  })
})
