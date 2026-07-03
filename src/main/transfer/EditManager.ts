import { shell } from 'electron'
import type { WebContents } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { createWriteStream, rmSync, existsSync } from 'fs'
import { mkdtemp } from 'fs/promises'
import { execFile } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { sessionManager } from './SessionManager'
import { editorSettings } from '../core/runtimeSettings'
import { createLogger } from '../core/logger'

const log = createLogger('edit')

/** Editör kaydından sonra yüklemeyi tetiklemeden önce beklenen sükûnet süresi. */
const SAVE_DEBOUNCE_MS = 800

interface WatchEntry {
  watcher: FSWatcher
  /** Geçici dizin — stopAll()'da diskten silinir (düz metin kalıntı bırakma). */
  dir: string
  timer?: NodeJS.Timeout
}

/**
 * Edit-in-place: uzak dosyayı geçici dizine indirir, sistem editöründe açar, dosyayı izler ve
 * her kayıtta otomatik olarak uzağa geri yükler (transfer kuyruğu üzerinden).
 */
class EditManager {
  private watchers = new Map<string, WatchEntry>()

  async open(
    sessionId: string,
    remotePath: string,
    name: string,
    sender: WebContents
  ): Promise<void> {
    const session = sessionManager.session(sessionId)
    const dir = await mkdtemp(join(tmpdir(), 'ferro-edit-'))
    const localPath = join(dir, name)

    // İlk indirme havuz bağlantısıyla (browsing bağlantısını bloklamadan).
    const pooled = await session.pool.acquire()
    try {
      await pooled.download(remotePath, createWriteStream(localPath))
    } finally {
      session.pool.release(pooled)
    }

    await this.openInEditor(localPath, sessionId, name, sender)

    // Aynı dosya ikinci kez açılırsa eski izleyici kapatılır (sızıntı önlenir).
    this.stop(localPath)

    // Dizini izle (editörlerin atomik kaydını yakalamak için dosya yerine klasör).
    const entry: WatchEntry = { dir, watcher: null as unknown as FSWatcher }
    entry.watcher = watch(dir, (_event, changed) => {
      if (changed !== name) return
      clearTimeout(entry.timer)
      entry.timer = setTimeout(() => {
        if (sender.isDestroyed()) return
        sessionManager.enqueueTransfer(sessionId, 'upload', remotePath, localPath, name)
        sessionManager.emitLog(sender, sessionId, 'info', `Değişiklik yüklendi: ${name}`)
      }, SAVE_DEBOUNCE_MS)
    })
    this.watchers.set(localPath, entry)
    log.info(`izleniyor: ${localPath} → ${remotePath}`)
  }

  /**
   * Dosyayı Ayarlar → Dosya düzenleme tercihine göre açar: 'custom' ise seçilen
   * editör çalıştırılır (execFile, detached); aksi halde sistem varsayılanı (openPath).
   */
  private async openInEditor(
    localPath: string,
    sessionId: string,
    name: string,
    sender: WebContents
  ): Promise<void> {
    const editor = editorSettings()
    if (editor.mode === 'custom' && editor.customPath) {
      if (!existsSync(editor.customPath)) {
        const msg = `Özel editör bulunamadı: ${editor.customPath}`
        log.warn(msg)
        sessionManager.emitLog(sender, sessionId, 'error', msg)
        return
      }
      try {
        const child = execFile(editor.customPath, [localPath], { windowsHide: false })
        child.unref()
        sessionManager.emitLog(sender, sessionId, 'info', `Düzenleme için açıldı: ${name}`)
      } catch (err) {
        const msg = `Editör çalıştırılamadı: ${String(err)}`
        log.warn(msg)
        sessionManager.emitLog(sender, sessionId, 'error', msg)
      }
      return
    }
    // 'system' / 'none' → OS varsayılan uygulaması. openPath fırlatmaz, mesaj döndürür.
    const openError = await shell.openPath(localPath)
    if (openError) {
      log.warn(`editör açılamadı: ${openError}`)
      sessionManager.emitLog(sender, sessionId, 'error', `Editör açılamadı: ${openError}`)
    } else {
      sessionManager.emitLog(sender, sessionId, 'info', `Düzenleme için açıldı: ${name}`)
    }
  }

  /** Tek bir dosyanın izlemesini kapatır (geçici dizin stopAll'a kadar kalır). */
  private stop(localPath: string): void {
    const entry = this.watchers.get(localPath)
    if (!entry) return
    clearTimeout(entry.timer)
    entry.watcher.close()
    this.watchers.delete(localPath)
  }

  /** Tüm izleyicileri kapatır ve geçici dizinleri diskten siler (çıkışta çağrılır). */
  stopAll(): void {
    for (const entry of this.watchers.values()) {
      clearTimeout(entry.timer)
      entry.watcher.close()
      try {
        rmSync(entry.dir, { recursive: true, force: true })
      } catch {
        // temp temizliği başarısız olsa da kapanışı engelleme
      }
    }
    this.watchers.clear()
  }
}

export const editManager = new EditManager()
