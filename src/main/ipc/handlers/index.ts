import { registerAppHandlers } from './app'
import { registerConnectionHandlers } from './connection'
import { registerFsHandlers } from './fs'
import { registerLocalHandlers } from './local'
import { registerSiteHandlers } from './sites'
import { registerSyncHandlers } from './sync'
import { registerTeamHandlers } from './team'

/** Tüm IPC handler modüllerini kaydeder. Yeni handler eklendikçe buraya çağrı eklenir. */
export function registerAllHandlers(): void {
  registerAppHandlers()
  registerConnectionHandlers()
  registerFsHandlers()
  registerLocalHandlers()
  registerSiteHandlers()
  registerSyncHandlers()
  registerTeamHandlers()
}
