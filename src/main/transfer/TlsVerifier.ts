import type { WebContents } from 'electron'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { emitEvent } from '../ipc/router'
import { createLogger } from '../core/logger'

const log = createLogger('tls')

/**
 * FTPS self-signed sertifika onayı (TOFU benzeri). Doğrulama başarısız olduğunda kullanıcıya
 * açık onay diyaloğu gösterir; kabul edilen host:port'lar kalıcı olarak güvenilir sayılır.
 */
class TlsVerifier {
  private pending = new Map<string, (accept: boolean) => void>()
  private counter = 0
  private trusted: Set<string> | null = null

  private file(): string {
    return join(app.getPath('userData'), 'trusted_certs.json')
  }

  private loadTrusted(): Set<string> {
    if (this.trusted) return this.trusted
    try {
      this.trusted = new Set(JSON.parse(readFileSync(this.file(), 'utf8')) as string[])
    } catch {
      this.trusted = new Set()
    }
    return this.trusted
  }

  private persist(): void {
    try {
      const path = this.file()
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, JSON.stringify([...this.loadTrusted()], null, 2), 'utf8')
    } catch (err) {
      log.warn('trusted_certs yazılamadı', String(err))
    }
  }

  isTrusted(host: string, port: number): boolean {
    return this.loadTrusted().has(`${host}:${port}`)
  }

  async verify(host: string, port: number, detail: string, sender: WebContents): Promise<boolean> {
    if (this.isTrusted(host, port)) return true

    const requestId = `tls${++this.counter}`
    const decision = new Promise<boolean>((resolve) => this.pending.set(requestId, resolve))
    emitEvent(sender, 'tls:verify', { requestId, host, port, detail })

    const accepted = await decision
    if (accepted) {
      this.loadTrusted().add(`${host}:${port}`)
      this.persist()
      log.info(`sertifika güvenildi: ${host}:${port}`)
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
