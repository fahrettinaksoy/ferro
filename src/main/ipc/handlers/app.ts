import { app } from 'electron'
import { registerHandler } from '../router'
import { setBandwidthLimit } from '../../transfer/throttle'

export function registerAppHandlers(): void {
  registerHandler('app:ping', () => {
    return { pong: true, version: app.getVersion() }
  })

  registerHandler('settings:setBandwidth', ({ bytesPerSec }) => {
    setBandwidthLimit(bytesPerSec)
    return { ok: true as const }
  })
}
