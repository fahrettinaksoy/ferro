import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { TeamInvitePayload, TeamPayload } from '../src/shared/team'
import { FerroError } from '../src/shared/errors'

// Geçici userData dizini + safeStorage taklidi (sync.unit.test deseninde).
const h = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferro-team-'))
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

import {
  generateTeamKey,
  encryptTeamPayload,
  decryptTeamPayload,
  encryptInvite,
  decryptInvite,
  encodeInviteCode,
  decodeInviteCode
} from '../src/main/team/crypto'
import { teamStore } from '../src/main/store/teams'

function samplePayload(teamKeyOwnerId = 'm-1'): TeamPayload {
  return {
    kind: 'ferro-team-payload',
    version: 1,
    teamId: 't-abc',
    name: 'Backend Ekibi',
    updatedAt: '2026-07-04T10:00:00.000Z',
    revision: 3,
    members: [
      { id: teamKeyOwnerId, name: 'Ali', role: 'admin', addedAt: '2026-07-04T09:00:00.000Z' }
    ],
    sites: [
      {
        name: 'Prod SFTP',
        protocol: 'sftp',
        host: 'sftp.ornek.com',
        port: 22,
        user: 'deploy',
        password: 'cok-gizli-parola'
      }
    ]
  }
}

describe('team vault crypto (AES-256-GCM, ekip anahtarı)', () => {
  it('şifrele/çöz gidiş-dönüşü yükü aynen korur', () => {
    const tk = generateTeamKey()
    const blob = encryptTeamPayload(samplePayload(), tk)
    expect(blob.kind).toBe('ferro-team')
    expect(blob.cipher).toBe('aes-256-gcm')
    expect(blob.teamId).toBe('t-abc')
    const back = decryptTeamPayload(blob, tk)
    expect(back).toEqual(samplePayload())
  })

  it('generateTeamKey 32 baytlık (base64) anahtar üretir ve her çağrı farklıdır', () => {
    const a = generateTeamKey()
    const b = generateTeamKey()
    expect(Buffer.from(a, 'base64')).toHaveLength(32)
    expect(a).not.toBe(b)
  })

  it('şifreli kasa düz metin sır içermez', () => {
    const tk = generateTeamKey()
    const raw = JSON.stringify(encryptTeamPayload(samplePayload(), tk))
    expect(raw).not.toContain('cok-gizli-parola')
    expect(raw).not.toContain('sftp.ornek.com')
    expect(raw).not.toContain('deploy')
  })

  it('yanlış ekip anahtarı AUTH_FAILED fırlatır', () => {
    const blob = encryptTeamPayload(samplePayload(), generateTeamKey())
    try {
      decryptTeamPayload(blob, generateTeamKey())
      expect.unreachable('çözmemeliydi')
    } catch (err) {
      expect((err as FerroError).code).toBe('AUTH_FAILED')
    }
  })

  it('kurcalanmış kasa AUTH_FAILED fırlatır (GCM bütünlüğü)', () => {
    const tk = generateTeamKey()
    const blob = encryptTeamPayload(samplePayload(), tk)
    const bytes = Buffer.from(blob.data, 'base64')
    bytes[0] ^= 0xff
    blob.data = bytes.toString('base64')
    try {
      decryptTeamPayload(blob, tk)
      expect.unreachable('çözmemeliydi')
    } catch (err) {
      expect((err as FerroError).code).toBe('AUTH_FAILED')
    }
  })

  it('geçersiz uzunlukta ekip anahtarı VALIDATION fırlatır', () => {
    const blob = encryptTeamPayload(samplePayload(), generateTeamKey())
    try {
      decryptTeamPayload(blob, Buffer.from('kisa').toString('base64'))
      expect.unreachable('çözmemeliydi')
    } catch (err) {
      expect((err as FerroError).code).toBe('VALIDATION')
    }
  })
})

describe('team invite (PIN ile scrypt + AES-256-GCM)', () => {
  const payload: TeamInvitePayload = {
    teamKey: generateTeamKey(),
    provider: 'gist',
    gist: { gistId: 'gist-123', token: 'ghp_gizli_token' }
  }

  it('davet kodu üret/çöz gidiş-dönüşü', () => {
    const file = encryptInvite(payload, 'pin1234', {
      teamId: 't-abc',
      teamName: 'Backend Ekibi',
      role: 'member'
    })
    const code = encodeInviteCode(file)
    expect(code.startsWith('ferro-invite-1.')).toBe(true)

    const decoded = decodeInviteCode(code)
    expect(decoded.teamId).toBe('t-abc')
    expect(decoded.role).toBe('member')
    const back = decryptInvite(decoded, 'pin1234')
    expect(back).toEqual(payload)
  })

  it('davet kodu (PIN olmadan) TK/jeton düz metin sızdırmaz', () => {
    const file = encryptInvite(payload, 'pin1234', {
      teamId: 't-abc',
      teamName: 'Backend Ekibi',
      role: 'member'
    })
    const code = encodeInviteCode(file)
    const decodedJson = Buffer.from(code.slice('ferro-invite-1.'.length), 'base64url').toString(
      'utf8'
    )
    expect(decodedJson).not.toContain('ghp_gizli_token')
    expect(decodedJson).not.toContain(payload.teamKey)
  })

  it('yanlış PIN AUTH_FAILED fırlatır', () => {
    const file = encryptInvite(payload, 'dogru-pin', {
      teamId: 't-abc',
      teamName: 'Backend Ekibi',
      role: 'readonly'
    })
    try {
      decryptInvite(file, 'yanlis-pin')
      expect.unreachable('çözmemeliydi')
    } catch (err) {
      expect((err as FerroError).code).toBe('AUTH_FAILED')
    }
  })

  it('tanınmayan davet kodu öneki VALIDATION fırlatır', () => {
    try {
      decodeInviteCode('rastgele-metin')
      expect.unreachable('çözmemeliydi')
    } catch (err) {
      expect((err as FerroError).code).toBe('VALIDATION')
    }
  })
})

describe('TeamStore (sır saklama + public görünüm)', () => {
  it('sırları vault formatında saklar; TK/jeton düz metin diske yazılmaz', () => {
    teamStore.add({
      teamId: 't-store',
      name: 'Depo Ekibi',
      role: 'admin',
      memberId: 'me-1',
      memberName: 'Ali',
      provider: 'gist',
      teamKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      gist: { gistId: 'g-1', token: 'ghp_super_gizli' },
      webdav: { url: '', user: '', password: '' }
    })
    const raw = readFileSync(join(h.dir, 'teams.json'), 'utf8')
    expect(raw).not.toContain('ghp_super_gizli')
    expect(raw).not.toContain('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
    expect(raw).toContain('v1:') // vault işareti
  })

  it('public görünüm sır döndürmez, yalnızca var/yok bildirir', () => {
    const pub = teamStore.getPublic('t-store')
    expect(pub).toBeTruthy()
    expect(pub!.hasCredentials).toBe(true)
    expect(pub!.role).toBe('admin')
    expect(JSON.stringify(pub)).not.toContain('ghp_super_gizli')
  })

  it('çözülmüş TK/erişim yalnızca motor tarafına döner', () => {
    expect(teamStore.teamKey('t-store')).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
    expect(teamStore.credentials('t-store')!.gist.token).toBe('ghp_super_gizli')
  })

  it('remove yerel kaydı siler', () => {
    teamStore.remove('t-store')
    expect(teamStore.getPublic('t-store')).toBeNull()
  })
})
