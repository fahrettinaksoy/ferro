import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto'
import { FerroError } from '@shared/errors'
import {
  INVITE_CODE_PREFIX,
  type TeamBlobFile,
  type TeamInviteFile,
  type TeamInvitePayload,
  type TeamPayload,
  type TeamRole
} from '@shared/team'

// ── Ekip kripto katmanı ─────────────────────────────────────────────────────
// İki ayrı şifreleme sınırı:
//  1) Kasa: TeamPayload, EKİP ANAHTARI (TK) ile AES-256-GCM'le şifrelenir. TK
//     paroladan türetilmez — 32 baytlık tam entropili rastgele anahtardır, bu
//     yüzden KDF yoktur. (Sync tarafındaki parola-türetmeli şemadan bilinçli
//     olarak farklıdır: ekip anahtarı insanlar arasında paylaşılır, bir insan
//     parolası değildir.)
//  2) Davet: TeamInvitePayload (TK + depo jetonları), davet-PIN'inden scrypt ile
//     türetilen anahtarla şifrelenir. PIN kısa/insan-taşınabilir olabildiği için
//     KDF vardır (kaba kuvvet maliyetini yükseltir).
// Her iki tarafta da yanlış anahtar/PIN GCM etiket doğrulamasında yakalanır —
// düz metin asla kısmen açılmaz.

const IV_LEN = 12
const KEY_LEN = 32
const SALT_LEN = 16
const TAG_LEN = 16

/** Davet PIN'i için scrypt parametreleri (sync tarafıyla aynı; etkileşimli). */
const KDF = { algo: 'scrypt' as const, N: 16384, r: 8, p: 1 }

// ── Ekip anahtarı üretimi ──

/** Yeni bir ekip için tam entropili 32 baytlık anahtar üretir (base64). */
export function generateTeamKey(): string {
  return randomBytes(KEY_LEN).toString('base64')
}

function keyFromBase64(b64: string): Buffer {
  const key = Buffer.from(b64, 'base64')
  if (key.length !== KEY_LEN) {
    throw new FerroError('VALIDATION', 'Ekip anahtarı geçersiz (32 bayt olmalı)')
  }
  return key
}

// ── Düşük seviye AES-256-GCM yardımcıları (iv|ct|tag → base64 alanları) ──

function gcmEncrypt(key: Buffer, plain: Buffer): { iv: string; data: string } {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])
  return { iv: iv.toString('base64'), data: enc.toString('base64') }
}

function gcmDecrypt(key: Buffer, ivB64: string, dataB64: string): Buffer {
  const raw = Buffer.from(dataB64, 'base64')
  if (raw.length < TAG_LEN + 1) throw new FerroError('VALIDATION', 'Şifreli veri eksik/bozuk')
  const tag = raw.subarray(raw.length - TAG_LEN)
  const body = raw.subarray(0, raw.length - TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()])
}

// ── Kasa şifrelemesi (ekip anahtarıyla) ──

/** TeamPayload'ı ekip anahtarıyla şifreleyip uzağa yazılacak zarfı üretir. */
export function encryptTeamPayload(payload: TeamPayload, teamKeyB64: string): TeamBlobFile {
  const key = keyFromBase64(teamKeyB64)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const { iv, data } = gcmEncrypt(key, plain)
  return {
    app: 'ferro',
    kind: 'ferro-team',
    version: 1,
    teamId: payload.teamId,
    name: payload.name,
    updatedAt: payload.updatedAt,
    revision: payload.revision,
    cipher: 'aes-256-gcm',
    iv,
    data
  }
}

/**
 * Uzaktan inen kasa zarfını çözer. Yanlış ekip anahtarı / bozuk veri
 * AUTH_FAILED (GCM etiketi tutmaz); tanınmayan format VALIDATION fırlatır.
 */
export function decryptTeamPayload(file: TeamBlobFile, teamKeyB64: string): TeamPayload {
  if (file.kind !== 'ferro-team' || file.version !== 1 || file.cipher !== 'aes-256-gcm') {
    throw new FerroError('VALIDATION', 'Tanınmayan ekip kasası formatı')
  }
  const key = keyFromBase64(teamKeyB64)
  let plain: Buffer
  try {
    plain = gcmDecrypt(key, file.iv, file.data)
  } catch {
    throw new FerroError('AUTH_FAILED', 'Ekip anahtarı hatalı ya da kasa bozulmuş')
  }
  try {
    const parsed = JSON.parse(plain.toString('utf8')) as TeamPayload
    if (parsed.kind !== 'ferro-team-payload') throw new Error('kind uyuşmuyor')
    return parsed
  } catch (err) {
    throw new FerroError('VALIDATION', 'Ekip kasası yükü çözümlenemedi', String(err))
  }
}

// ── Davet şifrelemesi (PIN ile) ──

function deriveInviteKey(pin: string, salt: Buffer, N: number, r: number, p: number): Buffer {
  return scryptSync(pin, salt, KEY_LEN, { N, r, p, maxmem: 128 * 1024 * 1024 })
}

/** TeamInvitePayload'ı davet-PIN'iyle şifreleyip davet zarfını üretir. */
export function encryptInvite(
  payload: TeamInvitePayload,
  pin: string,
  meta: { teamId: string; teamName: string; role: TeamRole }
): TeamInviteFile {
  const salt = randomBytes(SALT_LEN)
  const key = deriveInviteKey(pin, salt, KDF.N, KDF.r, KDF.p)
  const { iv, data } = gcmEncrypt(key, Buffer.from(JSON.stringify(payload), 'utf8'))
  return {
    app: 'ferro',
    kind: 'ferro-invite',
    version: 1,
    teamId: meta.teamId,
    teamName: meta.teamName,
    role: meta.role,
    kdf: { algo: KDF.algo, salt: salt.toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p },
    cipher: 'aes-256-gcm',
    iv,
    data
  }
}

/** Davet zarfını PIN ile çözer. Yanlış PIN → AUTH_FAILED. */
export function decryptInvite(file: TeamInviteFile, pin: string): TeamInvitePayload {
  if (file.kind !== 'ferro-invite' || file.version !== 1 || file.cipher !== 'aes-256-gcm') {
    throw new FerroError('VALIDATION', 'Tanınmayan davet formatı')
  }
  const { salt, N, r, p } = file.kdf
  // KDF parametreleri davet kodundan gelir — güvensiz girdi; maliyet sınırlanır.
  if (N > 1 << 20 || r > 16 || p > 4) {
    throw new FerroError('VALIDATION', 'Davetin KDF parametreleri desteklenmiyor')
  }
  const key = deriveInviteKey(pin, Buffer.from(salt, 'base64'), N, r, p)
  let plain: Buffer
  try {
    plain = gcmDecrypt(key, file.iv, file.data)
  } catch {
    throw new FerroError('AUTH_FAILED', 'Davet PIN’i hatalı ya da davet kodu bozuk')
  }
  try {
    return JSON.parse(plain.toString('utf8')) as TeamInvitePayload
  } catch (err) {
    throw new FerroError('VALIDATION', 'Davet yükü çözümlenemedi', String(err))
  }
}

// ── Davet kodu kodlama/çözme (zarf ↔ taşınabilir string) ──

/** Davet zarfını tek satırlık taşınabilir koda çevirir. */
export function encodeInviteCode(file: TeamInviteFile): string {
  const json = JSON.stringify(file)
  return INVITE_CODE_PREFIX + Buffer.from(json, 'utf8').toString('base64url')
}

/** Davet kodunu zarfa geri çözer. Biçim tanınmazsa VALIDATION fırlatır. */
export function decodeInviteCode(code: string): TeamInviteFile {
  const trimmed = code.trim()
  if (!trimmed.startsWith(INVITE_CODE_PREFIX)) {
    throw new FerroError('VALIDATION', 'Geçersiz davet kodu (önek uyuşmuyor)')
  }
  const b64 = trimmed.slice(INVITE_CODE_PREFIX.length)
  let file: TeamInviteFile
  try {
    file = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as TeamInviteFile
  } catch (err) {
    throw new FerroError('VALIDATION', 'Davet kodu çözümlenemedi', String(err))
  }
  if (file.app !== 'ferro' || file.kind !== 'ferro-invite') {
    throw new FerroError('VALIDATION', 'Bu bir Ferro davet kodu değil')
  }
  return file
}
