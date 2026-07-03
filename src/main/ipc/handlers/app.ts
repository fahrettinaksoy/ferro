import { app, dialog, BrowserWindow, Menu } from 'electron'
import { registerHandler } from '../router'
import { setBandwidthLimit } from '../../transfer/throttle'
import { sessionManager } from '../../transfer/SessionManager'
import { setRuntimeSettings } from '../../core/runtimeSettings'
import { configureFileLogging } from '../../core/logger'
import { configureUpdater } from '../../core/updater'
import { vault } from '../../store/vault'
import { siteStore } from '../../store/sites'
import { FerroError } from '@shared/errors'

export function registerAppHandlers(): void {
  registerHandler('app:ping', () => {
    return { pong: true, version: app.getVersion() }
  })

  // Hakkında ekranı: uygulama + çalışma ortamı sürümleri.
  registerHandler('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
    platform: process.platform,
    arch: process.arch
  }))

  // Yerel klasör seçici (Site Yöneticisi "Göz at" butonu).
  registerHandler('dialog:pickDirectory', async ({ defaultPath }, ctx) => {
    const win = BrowserWindow.fromWebContents(ctx.sender) ?? undefined
    const res = await (win
      ? dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath })
      : dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath }))
    return { path: res.canceled || !res.filePaths[0] ? null : res.filePaths[0] }
  })

  // Uygulama geneli çalışma zamanı ayarları (Ayarlar penceresi) — tek noktada uygulanır.
  registerHandler('settings:apply', (settings) => {
    setRuntimeSettings(settings)
    setBandwidthLimit(settings.bandwidthBytesPerSec)
    sessionManager.setDefaultPoolSize(settings.maxConnections)
    configureFileLogging(settings.logging)
    configureUpdater(settings.updates)
    return { ok: true as const }
  })

  // Yerinde düzenleme için özel editör seçici.
  registerHandler('settings:pickEditor', async (_p, ctx) => {
    const win = BrowserWindow.fromWebContents(ctx.sender) ?? undefined
    const opts = { properties: ['openFile' as const] }
    const res = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
    return { path: res.canceled || !res.filePaths[0] ? null : res.filePaths[0] }
  })

  // ── Master parola (kimlik deposu kilidi) ──
  registerHandler('vault:status', () => ({
    mode: vault.mode(),
    locked: vault.isLocked(),
    hasMaster: vault.hasMaster()
  }))

  registerHandler('vault:setMaster', ({ current, next }) => {
    // Mevcut sırları ESKİ şemayla çöz → anahtarı değiştir → YENİ şemayla yaz.
    // Master zaten varsa önce açılır (current ile) ki dışa aktarım çözebilsin.
    if (vault.hasMaster()) {
      if (!current || !vault.unlock(current)) {
        throw new FerroError('AUTH_FAILED', 'Mevcut master parola hatalı')
      }
    }
    const plains = siteStore.exportSecrets()
    vault.setMaster(current, next)
    siteStore.importSecrets(plains)
    return { ok: true as const }
  })

  registerHandler('vault:unlock', ({ password }) => ({ ok: vault.unlock(password) }))

  registerHandler('vault:useOsKeychain', ({ current }) => {
    if (!vault.osEncryptionAvailable()) {
      throw new FerroError('VALIDATION', 'Bu sistemde OS keychain kullanılamıyor')
    }
    // master → os: sırları çöz, moda geç, safeStorage ile yeniden yaz.
    if (!vault.unlock(current)) throw new FerroError('AUTH_FAILED', 'Master parola hatalı')
    const plains = siteStore.exportSecrets()
    vault.disableMaster(current)
    siteStore.importSecrets(plains)
    return { ok: true as const }
  })

  // Panel görünürlükleri (app bar) → Görünüm menüsü onay imlerini eşitle.
  registerHandler('app:setPanelState', ({ servers, log, queue }) => {
    const menu = Menu.getApplicationMenu()
    const set = (id: string, checked: boolean): void => {
      const item = menu?.getMenuItemById(id)
      if (item) item.checked = checked
    }
    set('panel-servers', servers)
    set('panel-log', log)
    set('panel-queue', queue)
    return { ok: true as const }
  })

  // Bağlantı durumu → Sunucu menüsü öğelerinin etkinlik/onay durumları.
  registerHandler(
    'app:setConnState',
    ({ hasActive, connecting, connected, anyConnected, paused }) => {
      const menu = Menu.getApplicationMenu()
      const item = (id: string): Electron.MenuItem | null => menu?.getMenuItemById(id) ?? null
      const disconnect = item('srv-disconnect')
      if (disconnect) disconnect.enabled = hasActive
      const reconnect = item('srv-reconnect')
      if (reconnect) reconnect.enabled = hasActive && !connecting
      const sync = item('srv-sync')
      if (sync) sync.enabled = connected
      const transfers = item('srv-transfers')
      if (transfers) {
        transfers.enabled = anyConnected
        transfers.checked = paused
      }
      return { ok: true as const }
    }
  )
}
