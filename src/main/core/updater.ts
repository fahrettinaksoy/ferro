import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { createLogger } from './logger'

const log = createLogger('updater')

/**
 * Otomatik güncelleme. Yalnızca paketlenmiş (production) uygulamada çalışır.
 * Yayın hedefi electron-builder.yml `publish` alanından gelir; ulaşılamazsa sessizce geçer.
 */
export function initAutoUpdater(): void {
  if (is.dev) {
    log.debug('dev modunda auto-update atlandı')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => log.info('güncelleme kontrol ediliyor'))
  autoUpdater.on('update-available', (info) => log.info(`güncelleme bulundu: ${info.version}`))
  autoUpdater.on('update-not-available', () => log.debug('güncel'))
  autoUpdater.on('download-progress', (p) => log.debug(`indiriliyor: %${Math.round(p.percent)}`))
  autoUpdater.on('update-downloaded', (info) => log.info(`indirildi: ${info.version} (çıkışta kurulacak)`))
  autoUpdater.on('error', (err) => log.warn(`auto-update hatası: ${err.message}`))

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.warn(`güncelleme kontrolü başarısız: ${String(err)}`)
  })
}
