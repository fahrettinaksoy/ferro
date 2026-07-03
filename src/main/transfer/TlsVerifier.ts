import type { WebContents } from 'electron'
import { app } from 'electron'
import { join } from 'path'
import { readJsonVersioned, writeJsonVersioned } from '../store/jsonStore'
import { emitEvent } from '../ipc/router'
import { createLogger } from '../core/logger'

const log = createLogger('tls')

/**
 * FTPS self-signed sertifika onayı (TOFU + sertifika pinleme).
 *
 * Güven yalnızca host:port'a değil, sunucunun SHA-256 sertifika parmak izine
 * bağlanır: ilk kabulde parmak izi kalıcı olarak saklanır, sonraki bağlantılarda
 * sunucu FARKLI bir sertifika sunarsa (olası MITM) kullanıcıya "değişti" uyarısıyla
 * yeniden sorulur. Parmak izi alınamayan istisnai durumlarda onay yalnızca
 * oturum süresince geçerli olur, diske yazılmaz.
 */

const STORE_VERSION = 1

/** Kullanıcı kararı beklenirken üst sınır — güvenli tarafta (reddet) sonuçlanır. */
const DECISION_TIMEOUT_MS = 5 * 60_000

class TlsVerifier {
  private pending = new Map<string, (accept: boolean) => void>()
  private counter = 0
  private certs: Record<string, string> | null = null
  /** Parmak izi alınamadığında verilen onaylar — yalnızca bu çalıştırma için. */
  private sessionTrusted = new Set<string>()

  private file(): string {
    return join(app.getPath('userData'), 'trusted_certs.json')
  }

  private key(host: string, port: number): string {
    return `${host}:${port}`
  }

  private load(): Record<string, string> {
    if (this.certs) return this.certs
    this.certs = readJsonVersioned<Record<string, string>>(this.file(), STORE_VERSION, () => ({}), {
      // v0 (eski biçim): parmak izsiz "host:port" listesi. Bu kayıtlar her
      // sertifikaya güvendiği için güvensizdir — taşınmaz, kullanıcı bir kez
      // daha onaylar ve kayıt parmak iziyle yenilenir.
      legacy: (parsed) => {
        if (!Array.isArray(parsed)) return null
        log.info(
          `eski trusted_certs biçimi bulundu; ${parsed.length} kayıt parmak izi için yeniden onaylanacak`
        )
        return {}
      }
    })
    return this.certs
  }

  private persist(): void {
    try {
      writeJsonVersioned(this.file(), STORE_VERSION, this.load())
    } catch (err) {
      log.warn('trusted_certs yazılamadı', String(err))
    }
  }

  /** Kayıtlı (pinlenmiş) parmak izi; yoksa null. */
  pinned(host: string, port: number): string | null {
    return this.load()[this.key(host, port)] ?? null
  }

  async verify(
    host: string,
    port: number,
    detail: string,
    fingerprint: string | null,
    sender: WebContents
  ): Promise<boolean> {
    const key = this.key(host, port)
    const pinned = this.pinned(host, port)

    // Sunucu daha önce onaylanan sertifikanın aynısını sunuyor → sormadan geç.
    if (fingerprint && pinned && fingerprint === pinned) return true
    // Parmak izi alınamamış ve bu oturumda zaten onaylanmış → tekrar sorma
    // (bağlantı havuzu aynı sunucuya kısa aralıklarla birden çok bağlantı açar).
    if (!fingerprint && this.sessionTrusted.has(key)) return true

    const changed = pinned !== null && fingerprint !== null && pinned !== fingerprint
    if (changed) {
      log.warn(`sertifika DEĞİŞTİ: ${key} (kayıtlı: ${pinned}, sunulan: ${fingerprint})`)
    }

    const requestId = `tls${++this.counter}`
    const decision = new Promise<boolean>((resolve) => {
      this.pending.set(requestId, resolve)
      // Renderer yanıt veremezse bağlantı sonsuza dek asılı kalmasın — reddet.
      setTimeout(() => {
        if (this.pending.delete(requestId)) {
          log.warn(`sertifika onayı zaman aşımı (${key}) — reddedildi`)
          resolve(false)
        }
      }, DECISION_TIMEOUT_MS)
    })
    emitEvent(sender, 'tls:verify', { requestId, host, port, detail, fingerprint, changed })

    const accepted = await decision
    if (accepted) {
      if (fingerprint) {
        this.load()[key] = fingerprint
        this.persist()
        log.info(`sertifika pinlendi: ${key} → ${fingerprint}`)
      } else {
        this.sessionTrusted.add(key)
        log.warn(`sertifika parmak izi alınamadı; ${key} yalnızca bu oturum için güvenildi`)
      }
    }
    return accepted
  }

  resolve(requestId: string, accept: boolean): void {
    const r = this.pending.get(requestId)
    if (r) {
      this.pending.delete(requestId)
      r(accept)
    }
  }
}

export const tlsVerifier = new TlsVerifier()
