import { safeStorage } from 'electron'
import { createLogger } from '../core/logger'

const log = createLogger('vault')

// Kimlik bilgisi şifreleme. Mümkünse OS keychain'e bağlı safeStorage kullanılır.
// Anahtar yoksa (bazı Linux ortamları) base64 fallback'e düşer — güvensiz, uyarı loglanır.

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Düz metni şifreleyip saklanabilir string döndürür. */
export function encryptSecret(plain: string): string {
  if (encryptionAvailable()) {
    return 'v1:' + safeStorage.encryptString(plain).toString('base64')
  }
  log.warn('safeStorage yok — parola güvensiz (base64) saklanıyor')
  return 'p0:' + Buffer.from(plain, 'utf8').toString('base64')
}

/** Saklanan değeri çözer. */
export function decryptSecret(stored: string): string {
  try {
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
