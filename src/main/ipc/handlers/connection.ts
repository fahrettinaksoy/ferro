import { registerHandler } from '../router'
import { sessionManager } from '../../transfer/SessionManager'
import { hostKeyVerifier } from '../../transfer/HostKeyVerifier'
import { tlsVerifier } from '../../transfer/TlsVerifier'

export function registerConnectionHandlers(): void {
  registerHandler('connection:connect', async (config, ctx) => {
    return sessionManager.connect(config, ctx.sender)
  })

  registerHandler('connection:disconnect', async ({ sessionId }) => {
    await sessionManager.disconnect(sessionId)
    return { closed: true as const }
  })

  registerHandler('hostkey:decision', async ({ requestId, accept }) => {
    hostKeyVerifier.resolve(requestId, accept)
    return { ok: true as const }
  })

  registerHandler('tls:decision', async ({ requestId, accept }) => {
    tlsVerifier.resolve(requestId, accept)
    return { ok: true as const }
  })
}
