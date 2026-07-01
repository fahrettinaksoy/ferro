import { app, dialog, BrowserWindow } from 'electron'
import { registerHandler } from '../router'
import { setBandwidthLimit } from '../../transfer/throttle'

export function registerAppHandlers(): void {
  registerHandler('app:ping', () => {
    return { pong: true, version: app.getVersion() }
  })

  // Yerel klasör seçici (Site Yöneticisi "Göz at" butonu).
  registerHandler('dialog:pickDirectory', async ({ defaultPath }, ctx) => {
    const win = BrowserWindow.fromWebContents(ctx.sender) ?? undefined
    const res = await (win
      ? dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath })
      : dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath }))
    return { path: res.canceled || !res.filePaths[0] ? null : res.filePaths[0] }
  })

  registerHandler('settings:setBandwidth', ({ bytesPerSec }) => {
    setBandwidthLimit(bytesPerSec)
    return { ok: true as const }
  })
}
