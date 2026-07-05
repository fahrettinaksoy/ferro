import { registerHandler } from '../router'
import { syncConfigStore } from '../../store/syncConfig'
import { syncPush, syncPull, syncPeek } from '../../sync/engine'

export function registerSyncHandlers(): void {
  registerHandler('sync:getConfig', () => ({ config: syncConfigStore.toPublic() }))

  registerHandler('sync:setConfig', (input) => {
    syncConfigStore.update(input)
    return { config: syncConfigStore.toPublic() }
  })

  registerHandler('sync:push', ({ settings }) => syncPush(settings))

  registerHandler('sync:pull', () => syncPull())

  registerHandler('sync:peek', () => syncPeek())
}
