import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { existsSync } from 'fs'
import { join } from 'path'
import { createLogger } from './logger'

const log = createLogger('updater')

let listenersBound = false
let feedAvailable = false

/** electron-updater kanal adı (yayın artefaktlarının kanalıyla eşleşmeli). */
function channelName(channel: 'stable' | 'beta' | 'nightly'): string {
  switch (channel) {
    case 'beta':
      return 'beta'
    case 'nightly':
      return 'alpha'
    default:
      return 'latest'
  }
}

/**
 * Olay dinleyicilerini bir kez bağlar. Yalnızca paketlenmiş uygulamada ve
 * app-update.yml mevcutsa etkinleşir (dev/--dir smoke build'lerinde sessiz).
 */
export function initAutoUpdater(): void {
  if (is.dev) {
    log.debug('dev modunda auto-update atlandı')
    return
  }
  const updateConfig = join(process.resourcesPath ?? '', 'app-update.yml')
  if (!existsSync(updateConfig)) {
    log.debug('app-update.yml yok (paketsiz build) — auto-update atlandı')
    return
  }
  feedAvailable = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => log.info('güncelleme kontrol ediliyor'))
  autoUpdater.on('update-available', (info) => log.info(`güncelleme bulundu: ${info.version}`))
  autoUpdater.on('update-not-available', () => log.debug('güncel'))
  autoUpdater.on('download-progress', (p) => log.debug(`indiriliyor: %${Math.round(p.percent)}`))
  autoUpdater.on('update-downloaded', (info) =>
    log.info(`indirildi: ${info.version} (çıkışta kurulacak)`)
  )
  autoUpdater.on('error', (err) => log.warn(`auto-update hatası: ${err.message}`))
  listenersBound = true
}

/**
 * Ayarlar → Güncelleme'den gelen kanal + frekansı uygular ve (frekans 'never'
 * değilse) güncelleme kontrolünü tetikler. Renderer settings:apply ile çağırır.
 */
export function configureUpdater(prefs: {
  frequency: 'daily' | 'weekly' | 'never'
  channel: 'stable' | 'beta' | 'nightly'
}): void {
  if (!feedAvailable || !listenersBound) return
  autoUpdater.channel = channelName(prefs.channel)
  autoUpdater.allowPrerelease = prefs.channel !== 'stable'
  if (prefs.frequency === 'never') {
    log.debug('güncelleme kontrolü kapalı (Ayarlar)')
    return
  }
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.warn(`güncelleme kontrolü başarısız: ${String(err)}`)
  })
}
