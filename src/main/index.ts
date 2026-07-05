import { app, shell, BrowserWindow, Menu, nativeImage } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Uygulama adı: dev modunda Electron binary'sinden gelen "Electron" yerine
// menü çubuğu/dock'ta "Ferro" gösterilsin diye hazır olmadan önce ayarlanır.
app.setName('Ferro')

// Uygulama ikonu (dev + linux pencere ikonu). macOS/Windows paketlerinde
// ikon electron-builder tarafından build/icon.icns / build/icon.ico'dan gelir.
const appIcon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
import { installIpcRouter, emitEvent } from './ipc/router'
import { registerAllHandlers } from './ipc/handlers'
import { sessionManager } from './transfer/SessionManager'
import { editManager } from './transfer/EditManager'
import { initAutoUpdater } from './core/updater'
import { initFileLog, createLogger } from './core/logger'

const log = createLogger('main')

// Süreç seviyesi son savunma hattı: yakalanmamış hatalar sessizce kaybolmasın,
// dosya loguna düşsün. uncaughtException'da süreç bilinçli olarak AYAKTA tutulur —
// kullanıcının süren transferlerini tek bir hatayla düşürmek daha kötüdür; hata
// loglanır ve uygulama çalışmaya devam eder.
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { message: err.message, stack: err.stack })
})
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason
  log.error('unhandledRejection', err)
})

/** "Hakkında" tıklaması: renderer'daki M3 diyaloğunu açar (yerli about paneli yerine). */
function showAbout(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) emitEvent(win, 'app:showAbout', null)
}

/** Görünüm menüsü panel öğesi tıklandı: renderer ilgili paneli açıp kapatır. */
function togglePanel(panel: 'servers' | 'log' | 'queue'): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) emitEvent(win, 'app:togglePanel', { panel })
}

/** Menü eylemi: renderer ilgili diyalog/paneli açar ya da bağlantı eylemini çalıştırır. */
type MenuAction =
  | 'settings'
  | 'siteManager'
  | 'hotkeys'
  | 'connect'
  | 'disconnect'
  | 'reconnect'
  | 'sync'
  | 'teams'
  | 'cloudSync'
  | 'toggleTransfers'
function menuAction(action: MenuAction): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) emitEvent(win, 'app:menuAction', { action })
}

/**
 * Uygulama menüsü: standart rollere ek olarak "Hakkında" öğesi Electron'un
 * varsayılan about paneli yerine uygulamanın kendi diyaloğunu açar.
 */
function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const aboutItem: MenuItemConstructorOptions = {
    label: `${app.name} Hakkında`,
    click: showAbout
  }
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              aboutItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'Dosya',
      submenu: [
        {
          label: 'Site Yöneticisi',
          accelerator: 'CmdOrCtrl+S',
          click: () => menuAction('siteManager')
        },
        {
          label: 'Ekipler…',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => menuAction('teams')
        },
        {
          label: 'Senkronizasyon…',
          accelerator: 'CmdOrCtrl+Shift+Y',
          click: () => menuAction('cloudSync')
        },
        {
          label: 'Ayarlar…',
          accelerator: 'CmdOrCtrl+,',
          click: () => menuAction('settings')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      // App bar'daki bağlantı denetimlerinin menü karşılığı. enabled/checked
      // durumları renderer'dan 'app:setConnState' ile eşitlenir (id üzerinden).
      label: 'Sunucu',
      submenu: [
        { label: 'Bağlan…', click: () => menuAction('connect') },
        {
          id: 'srv-disconnect',
          label: 'Bağlantıyı Kes',
          enabled: false,
          click: () => menuAction('disconnect')
        },
        {
          id: 'srv-reconnect',
          label: 'Yeniden Bağlan',
          enabled: false,
          click: () => menuAction('reconnect')
        },
        { type: 'separator' },
        { id: 'srv-sync', label: 'Eşitle…', enabled: false, click: () => menuAction('sync') },
        {
          id: 'srv-transfers',
          label: 'Aktarımları Duraklat',
          type: 'checkbox',
          checked: false,
          enabled: false,
          click: () => menuAction('toggleTransfers')
        }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Görünüm',
      submenu: [
        // App bar'daki üç panel düğmesinin menü karşılığı. checked durumları
        // renderer'dan 'app:setPanelState' ile eşitlenir (id üzerinden).
        {
          id: 'panel-servers',
          label: 'Sunucular',
          type: 'checkbox',
          checked: true,
          click: () => togglePanel('servers')
        },
        {
          id: 'panel-log',
          label: 'Günlük',
          type: 'checkbox',
          checked: true,
          click: () => togglePanel('log')
        },
        {
          id: 'panel-queue',
          label: 'Transferler',
          type: 'checkbox',
          checked: true,
          click: () => togglePanel('queue')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Klavye Kısayolları',
          accelerator: 'CmdOrCtrl+/',
          click: () => menuAction('hotkeys')
        },
        { type: 'separator' },
        aboutItem
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Ferro',
    ...(appIcon.isEmpty() ? {} : { icon: appIcon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Geliştirme: renderer konsolunu ana sürece aktar (tanılama kolaylığı).
  if (is.dev) {
    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log('[renderer]', message)
    })
  }

  // Yeni pencere istekleri her zaman reddedilir; URL yalnızca güvenli şemalardan
  // biriyse sistem tarayıcısına devredilir (file://, smb:// vb. asla OS'a geçmez).
  const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)) {
        void shell.openExternal(details.url)
      }
    } catch {
      // geçersiz URL — yok say
    }
    return { action: 'deny' }
  })

  // Uygulama içi üst düzey gezinme kilidi: yalnızca kendi içeriğimiz yüklenebilir.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
    const allowed = url.startsWith('file://') || (devUrl !== undefined && url.startsWith(devUrl))
    if (!allowed) event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ferro.app')

  // Rotasyonlu dosya loglaması: app.getPath('logs') hazır olduğunda başlar;
  // öncesinde üretilen satırlar logger tamponundan boşaltılır.
  initFileLog(app.getPath('logs'))
  log.info(`Ferro ${app.getVersion()} başlıyor (${process.platform}/${process.arch})`)

  // macOS dock ikonu (dev'de; pakette .icns kullanılır).
  if (process.platform === 'darwin' && !appIcon.isEmpty()) {
    app.dock?.setIcon(appIcon)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC router + handler kayıtları pencereden önce kurulur.
  registerAllHandlers()
  installIpcRouter()

  buildAppMenu()
  createWindow()

  // Production'da güncelleme kontrolü (dev'de atlanır).
  initAutoUpdater()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  editManager.stopAll()
  void sessionManager.disconnectAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
