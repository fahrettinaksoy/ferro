import type { WebContents } from 'electron'
import { emitEvent } from '../ipc/router'
import { knownHosts } from '../store/knownHosts'
import { createLogger } from '../core/logger'

const log = createLogger('hostkey')

/** Kullanıcı kararı beklenirken üst sınır — renderer yanıt veremezse bağlantı
 *  sonsuza dek asılı kalmaz, güvenli tarafta (reddet) sonuçlanır. */
const DECISION_TIMEOUT_MS = 5 * 60_000

/**
 * SFTP host key TOFU (Trust On First Use) doğrulaması.
 * Bilinmeyen/değişen anahtarda renderer'a parmak izini gösterir ve kullanıcı kararını bekler.
 */
class HostKeyVerifier {
  private pending = new Map<string, (accept: boolean) => void>()
  private counter = 0

  async verify(
    host: string,
    port: number,
    fingerprint: string,
    sender: WebContents
  ): Promise<boolean> {
    const known = knownHosts.get(host, port)
    if (known === fingerprint) return true

    const changed = known !== null && known !== fingerprint
    const requestId = `hk${++this.counter}`
    log.info(`host key onayı isteniyor: ${host}:${port} changed=${changed}`)

    const decision = new Promise<boolean>((resolve) => {
      this.pending.set(requestId, resolve)
      setTimeout(() => {
        if (this.pending.delete(requestId)) {
          log.warn(`host key onayı zaman aşımı (${host}:${port}) — reddedildi`)
          resolve(false)
        }
      }, DECISION_TIMEOUT_MS)
    })
    emitEvent(sender, 'hostkey:verify', { requestId, host, port, fingerprint, changed })

    const accepted = await decision
    if (accepted) {
      knownHosts.set(host, port, fingerprint)
      log.info(`host key kabul edildi ve kaydedildi: ${host}:${port}`)
    } else {
      log.warn(`host key reddedildi: ${host}:${port}`)
    }
    return accepted
  }

  /** Renderer'dan gelen kullanıcı kararını uygular. */
  resolve(requestId: string, accept: boolean): void {
    const r = this.pending.get(requestId)
    if (r) {
      this.pending.delete(requestId)
      r(accept)
    }
  }
}

export const hostKeyVerifier = new HostKeyVerifier()
