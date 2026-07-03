import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto'
import { FerroError } from '@shared/errors'
import type { SyncBlobFile, SyncPayload } from '@shared/sync'

// ── Sync blob şifrelemesi ──────────────────────────────────────────────────
// Veri cihazdan çıkmadan önce sync parolasıyla şifrelenir; uzak depo yalnızca
// şifreli blob'u görür. Anahtar türetimi scrypt (parola + rastgele tuz),
// şifreleme AES-256-GCM (bütünlük etiketi dahil). Yanlış parola GCM etiket
// doğrulamasında yakalanır — düz metin asla kısmen açılmaz.

/** scrypt parametreleri (Node varsayılanlarıyla uyumlu, etkileşimli kullanım için). */
const KDF = { algo: 'scrypt' as const, N: 16384, r: 8, p: 1 }
const KEY_LEN = 32
const IV_LEN = 12
const SALT_LEN = 16

function deriveKey(password: string, salt: Buffer, N: number, r: number, p: number): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N, r, p, maxmem: 128 * 1024 * 1024 })
}

/** Yükü sync parolasıyla şifreleyip uzak depoya yazılacak zarfı üretir. */
export function encryptSyncPayload(payload: SyncPayload, password: string): SyncBlobFile {
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const key = deriveKey(password, salt, KDF.N, KDF.r, KDF.p)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const enc = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])
  return {
    app: 'ferro',
    kind: 'ferro-sync',
    version: 1,
    updatedAt: payload.updatedAt,
    kdf: { algo: KDF.algo, salt: salt.toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p },
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    data: enc.toString('base64')
  }
}

/**
 * Uzak depodan inen zarfı çözer. Yanlış parola / bozuk veri AUTH_FAILED
 * fırlatır (GCM etiketi tutmaz); tanınmayan format VALIDATION fırlatır.
 */
export function decryptSyncPayload(file: SyncBlobFile, password: string): SyncPayload {
  if (file.kind !== 'ferro-sync' || file.version !== 1 || file.cipher !== 'aes-256-gcm') {
    throw new FerroError('VALIDATION', 'Tanınmayan sync dosyası formatı')
  }
  const { salt, N, r, p } = file.kdf
  // KDF parametreleri dosyadan gelir (eski cihaz farklı sürüm yazmış olabilir)
  // ama güvensiz girdidir — maliyet sınırlanır (bellek bombası koruması).
  if (N > 1 << 20 || r > 16 || p > 4) {
    throw new FerroError('VALIDATION', 'Sync dosyasının KDF parametreleri desteklenmiyor')
  }
  const key = deriveKey(password, Buffer.from(salt, 'base64'), N, r, p)
  const raw = Buffer.from(file.data, 'base64')
  if (raw.length < 17) throw new FerroError('VALIDATION', 'Sync dosyası eksik/bozuk')
  const tag = raw.subarray(raw.length - 16)
  const body = raw.subarray(0, raw.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'))
  decipher.setAuthTag(tag)
  let plain: Buffer
  try {
    plain = Buffer.concat([decipher.update(body), decipher.final()])
  } catch {
    throw new FerroError(
      'AUTH_FAILED',
      'Sync parolası hatalı ya da dosya bozulmuş (şifre çözülemedi)'
    )
  }
  try {
    const parsed = JSON.parse(plain.toString('utf8')) as SyncPayload
    if (parsed.kind !== 'ferro-sync-payload') throw new Error('kind uyuşmuyor')
    return parsed
  } catch (err) {
    throw new FerroError('VALIDATION', 'Sync yükü çözümlenemedi', String(err))
  }
}
