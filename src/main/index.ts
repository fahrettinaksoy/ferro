import { app, shell, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Uygulama adı: dev modunda Electron binary'sinden gelen "Electron" yerine
// menü çubuğu/dock'ta "Ferro" gösterilsin diye hazır olmadan önce ayarlanır.
app.setName('Ferro')

// Uygulama ikonu (dev + linux pencere ikonu). macOS/Windows paketlerinde
// ikon electron-builder tarafından build/icon.icns / build/icon.ico'dan gelir.
const appIcon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
import { installIpcRouter } from './ipc/router'
import { registerAllHandlers } from './ipc/handlers'
import { sessionManager } from './transfer/SessionManager'
import { editManager } from './transfer/EditManager'
import { initAutoUpdater } from './core/updater'

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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ferro.app')

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
