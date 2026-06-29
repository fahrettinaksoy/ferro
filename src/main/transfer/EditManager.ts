import { shell } from 'electron'
import type { WebContents } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { createWriteStream } from 'fs'
import { mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { sessionManager } from './SessionManager'
import { createLogger } from '../core/logger'

const log = createLogger('edit')

/**
 * Edit-in-place: uzak dosyayı geçici dizine indirir, sistem editöründe açar, dosyayı izler ve
 * her kayıtta otomatik olarak uzağa geri yükler (transfer kuyruğu üzerinden).
 */
class EditManager {
  private watchers = new Map<string, FSWatcher>()

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

    await shell.openPath(localPath)
    sessionManager.emitLog(sender, sessionId, 'info', `Düzenleme için açıldı: ${name}`)

    // Dizini izle (editörlerin atomik kaydını yakalamak için dosya yerine klasör).
    let timer: NodeJS.Timeout | undefined
    const watcher = watch(dir, (_event, changed) => {
      if (changed !== name) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (sender.isDestroyed()) return
        sessionManager.enqueueTransfer(sessionId, 'upload', remotePath, localPath, name)
        sessionManager.emitLog(sender, sessionId, 'info', `Değişiklik yüklendi: ${name}`)
      }, 800)
    })
    this.watchers.set(localPath, watcher)
    log.info(`izleniyor: ${localPath} → ${remotePath}`)
  }

  stopAll(): void {
    for (const w of this.watchers.values()) w.close()
    this.watchers.clear()
  }
}

export const editManager = new EditManager()
