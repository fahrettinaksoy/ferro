import { app, safeStorage } from 'electron'
import { join } from 'path'
import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto'
import { readJsonVersioned, writeJsonVersioned } from './jsonStore'
import { FerroError } from '@shared/errors'
import { createLogger } from '../core/logger'

const log = createLogger('vault')

// Kimlik bilgisi şifreleme — iki mod:
//  • 'os'     : OS keychain'e bağlı safeStorage ( 'v1:' önekli ). Varsayılan.
//  • 'master' : Kullanıcı ana parolası; scrypt + AES-256-GCM ( 'm1:' önekli ).
//               OS keychain'e güvenmeyen/taşınabilir kurulumlar için.
// safeStorage YOKSA ve master ayarlı DEĞİLSE parola kalıcı SAKLANMAZ (null döner).
// Eski 'p0:' base64 kayıtları yalnızca OKUNUR (geri uyumluluk + demo seed).

const VAULT_META_VERSION = 1
const SCRYPT_N = 16_384
const SCRYPT_r = 8
const SCRYPT_p = 1
const KEY_LEN = 32
const IV_LEN = 12
const VERIFY_PLAINTEXT = 'ferro-vault-verify-v1'

interface MasterParams {
  /** scrypt tuzu (base64). */
  salt: string
  /** Doğrulayıcı: VERIFY_PLAINTEXT'in şifrelenmiş hali (base64 iv|tag|ct). */
  verifier: string
}

interface VaultMeta {
  mode: 'os' | 'master'
  master?: MasterParams
}

class Vault {
  private meta: VaultMeta | null = null
  /** Master mod açıkken bellekteki türetilmiş anahtar (kilit açılınca dolar). */
  private masterKey: Buffer | null = null

  private file(): string {
    return join(app.getPath('userData'), 'vault.json')
  }

  private load(): VaultMeta {
    if (this.meta) return this.meta
    this.meta = readJsonVersioned<VaultMeta>(this.file(), VAULT_META_VERSION, () => ({
      mode: 'os'
    }))
    return this.meta
  }

  private save(): void {
    writeJsonVersioned(this.file(), VAULT_META_VERSION, this.load())
  }

  private deriveKey(password: string, salt: Buffer): Buffer {
    return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p })
  }

  private aesEncrypt(key: Buffer, plain: string): string {
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, ct]).toString('base64')
  }

  private aesDecrypt(key: Buffer, blob: string): string {
    const buf = Buffer.from(blob, 'base64')
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + 16)
    const ct = buf.subarray(IV_LEN + 16)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  }

  // ── Durum ──

  osEncryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  mode(): 'os' | 'master' {
    return this.load().mode
  }

  hasMaster(): boolean {
    return !!this.load().master
  }

  /** Master modda ve henüz kilit açılmamışsa true. OS modunda her zaman false. */
  isLocked(): boolean {
    return this.load().mode === 'master' && this.masterKey === null
  }

  // ── Şifrele / çöz ──

  /**
   * Düz metni saklanabilir string'e çevirir; saklanamıyorsa null döner
   * (OS keychain yok ve master ayarlı değil, ya da master kilitli).
   */
  encryptSecret(plain: string): string | null {
    const meta = this.load()
    if (meta.mode === 'master') {
      if (!this.masterKey) {
        log.warn('master parola kilitli — parola saklanamadı')
        return null
      }
      return 'm1:' + this.aesEncrypt(this.masterKey, plain)
    }
    if (this.osEncryptionAvailable()) {
      return 'v1:' + safeStorage.encryptString(plain).toString('base64')
    }
    log.warn('safeStorage kullanılamıyor — parola kalıcı olarak saklanmayacak')
    return null
  }

  /** Saklanan değeri çözer; çözülemezse boş string. */
  decryptSecret(stored: string): string {
    try {
      if (stored.startsWith('m1:')) {
        if (!this.masterKey) return '' // kilitli — çağıran parolayı sorar
        return this.aesDecrypt(this.masterKey, stored.slice(3))
      }
      if (stored.startsWith('v1:')) {
        return safeStorage.decryptString(Buffer.from(stored.slice(3), 'base64'))
      }
      if (stored.startsWith('p0:')) {
        return Buffer.from(stored.slice(3), 'base64').toString('utf8')
      }
    } catch (err) {
      log.error('parola çözülemedi', String(err))
    }
    return ''
  }

  // ── Master parola yönetimi ──

  /** Master parolayı doğrular (verifier üzerinden). */
  verifyMaster(password: string): boolean {
    const m = this.load().master
    if (!m) return false
    try {
      const key = this.deriveKey(password, Buffer.from(m.salt, 'base64'))
      const decrypted = this.aesDecrypt(key, m.verifier)
      const a = Buffer.from(decrypted)
      const b = Buffer.from(VERIFY_PLAINTEXT)
      return a.length === b.length && timingSafeEqual(a, b)
    } catch {
      return false // GCM auth hatası = yanlış parola
    }
  }

  /** Master parolayla depoyu açar (oturum boyunca bellekte tutulur). */
  unlock(password: string): boolean {
    const m = this.load().master
    if (!m) return false
    if (!this.verifyMaster(password)) return false
    this.masterKey = this.deriveKey(password, Buffer.from(m.salt, 'base64'))
    log.info('kimlik deposu açıldı (master)')
    return true
  }

  /**
   * Master parolayı ayarlar/değiştirir ve yeni anahtar üretir.
   * Çağıran (IPC handler), mevcut sırları önce çözüp sonra yeni anahtarla
   * yeniden şifrelemekten sorumludur (transitionSecrets deseni).
   * Değişiklikte mevcut parola doğrulanır.
   */
  setMaster(current: string | undefined, next: string): void {
    const meta = this.load()
    if (meta.master) {
      if (!current || !this.verifyMaster(current)) {
        throw new FerroError('AUTH_FAILED', 'Mevcut master parola hatalı')
      }
    }
    const salt = randomBytes(16)
    const key = this.deriveKey(next, salt)
    const verifier = this.aesEncrypt(key, VERIFY_PLAINTEXT)
    meta.mode = 'master'
    meta.master = { salt: salt.toString('base64'), verifier }
    this.masterKey = key
    this.save()
    log.info('master parola ayarlandı')
  }

  /** OS keychain moduna döner (master parolayı kaldırır). Mevcut parola gerekir. */
  disableMaster(current: string): void {
    const meta = this.load()
    if (!meta.master) return
    if (!this.verifyMaster(current)) {
      throw new FerroError('AUTH_FAILED', 'Master parola hatalı')
    }
    meta.mode = 'os'
    meta.master = undefined
    this.masterKey = null
    this.save()
    log.info('OS keychain moduna dönüldü')
  }
}

const vault = new Vault()

// Dışa açık ince API (mevcut çağrı yerleriyle uyumlu).
export function encryptionAvailable(): boolean {
  // Renderer'a "parola saklanabilir mi" bilgisi: master ayarlıysa (kilitliyken bile
  // açılınca saklanır) ya da OS keychain varsa true.
  return vault.mode() === 'master' || vault.osEncryptionAvailable()
}
export function encryptSecret(plain: string): string | null {
  return vault.encryptSecret(plain)
}
export function decryptSecret(stored: string): string {
  return vault.decryptSecret(stored)
}
export { vault }
