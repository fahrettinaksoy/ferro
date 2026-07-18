import { defineStore } from 'pinia'
import { invoke, FerroError } from '@renderer/lib/ipc'
import { joinPosix, joinLocalPath as joinLocal } from '@renderer/lib/paths'
import type { TransferJob } from '@shared/transfer'
import { useConnectionStore } from './connection'
import { useRemoteFsStore } from './remoteFs'
import { useLocalStore } from './local'

export const useTransferStore = defineStore('transfer', {
  state: (): { items: TransferJob[]; paused: boolean } => ({ items: [], paused: false }),
  getters: {
    active: (s): TransferJob[] =>
      s.items.filter((t) => t.status === 'active' || t.status === 'queued'),
    // Kuyruktakiler: aktif + bekleyen
    queued: (s): TransferJob[] =>
      s.items.filter((t) => t.status === 'active' || t.status === 'queued'),
    // Aktarılanlar: tamamlanan
    completed: (s): TransferJob[] => s.items.filter((t) => t.status === 'completed'),
    // Aktarılmayanlar: başarısız + iptal edilen
    failed: (s): TransferJob[] =>
      s.items.filter((t) => t.status === 'failed' || t.status === 'cancelled')
  },
  actions: {
    sessionId(): string {
      const conn = useConnectionStore()
      if (!conn.sessionId) throw new FerroError('NOT_CONNECTED', 'Bağlı değil')
      return conn.sessionId
    },

    /** Uzak dosyayı/klasörü geçerli yerel dizine indirmek üzere kuyruğa ekle. */
    async download(remoteName: string, isDirectory = false): Promise<void> {
      const remote = useRemoteFsStore()
      const local = useLocalStore()
      await invoke('transfer:enqueue', {
        sessionId: this.sessionId(),
        direction: 'download',
        remotePath: joinPosix(remote.cwd, remoteName),
        localPath: joinLocal(local.cwd, remoteName),
        name: remoteName,
        isDirectory
      })
    },

    /** Yerel dosyayı/klasörü geçerli uzak dizine yüklemek üzere kuyruğa ekle. */
    async upload(localName: string, localPath: string, isDirectory = false): Promise<void> {
      const remote = useRemoteFsStore()
      await invoke('transfer:enqueue', {
        sessionId: this.sessionId(),
        direction: 'upload',
        remotePath: joinPosix(remote.cwd, localName),
        localPath,
        name: localName,
        isDirectory
      })
    },

    async cancel(jobId: string): Promise<void> {
      await invoke('transfer:cancel', { jobId })
    },

    /** Kuyrukları duraklat/sürdür (app bar başlat/durdur düğmesi). */
    async setPaused(paused: boolean): Promise<void> {
      const res = await invoke('transfer:setPaused', { paused })
      this.paused = res.paused
    },

    /** main'den gelen transfer:update eventini uygula. */
    onUpdate(job: TransferJob): void {
      const idx = this.items.findIndex((t) => t.id === job.id)
      if (idx >= 0) this.items[idx] = job
      else this.items.unshift(job)

      // Tamamlanınca ilgili paneli tazele. Yükleme yalnızca işin ait olduğu
      // oturum etkinse uzak paneli tazeler (arka plan sekmesinin yanlış tazelenmesini önler).
      if (job.status === 'completed') {
        if (job.direction === 'download') void useLocalStore().refresh()
        else if (useConnectionStore().sessionId === job.sessionId) void useRemoteFsStore().refresh()
      }
    },

    clearFinished(): void {
      this.items = this.items.filter((t) => t.status === 'active' || t.status === 'queued')
    }
  }
})
