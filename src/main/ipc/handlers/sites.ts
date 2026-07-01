import { registerHandler } from '../router'
import { siteStore } from '../../store/sites'
import { encryptionAvailable } from '../../store/vault'
import { sessionManager } from '../../transfer/SessionManager'
import { FerroError } from '@shared/errors'

export function registerSiteHandlers(): void {
  registerHandler('sites:list', () => ({
    sites: siteStore.list(),
    encryptionAvailable: encryptionAvailable()
  }))

  registerHandler('sites:save', (input) => ({ id: siteStore.upsert(input) }))

  registerHandler('sites:delete', ({ id }) => {
    siteStore.remove(id)
    return { ok: true as const }
  })

  registerHandler('sites:renameGroup', ({ from, to }) => ({
    ok: true as const,
    count: siteStore.renameGroup(from, to)
  }))

  registerHandler('sites:connect', async ({ id }, ctx) => {
    const config = siteStore.buildConfig(id)
    if (!config) throw new FerroError('VALIDATION', 'Site bulunamadı')
    return sessionManager.connect(config, ctx.sender)
  })
}
