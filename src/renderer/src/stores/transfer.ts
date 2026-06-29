import { defineStore } from 'pinia'
import { invoke, FerroError } from '@renderer/lib/ipc'
import type { TransferJob } from '@shared/transfer'
import { useConnectionStore } from './connection'
import { useRemoteFsStore } from './remoteFs'
import { useLocalStore } from './local'

function joinPosix(base: string, name: string): string {
  return (base.endsWith('/') ? base : base + '/') + name
}
function joinLocal(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/'
  return base.endsWith(sep) ? base + name : base + sep + name
}

export const useTransferStore = defineStore('transfer', {
  state: (): { items: TransferJob[] } => ({ items: [] }),
  getters: {
    active: (s): TransferJob[] => s.items.filter((t) => t.status === 'active' || t.status === 'queued')
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

    /** main'den gelen transfer:update eventini uygula. */
    onUpdate(job: TransferJob): void {
      const idx = this.items.findIndex((t) => t.id === job.id)
      if (idx >= 0) this.items[idx] = job
      else this.items.unshift(job)

      // Tamamlanınca ilgili paneli tazele.
      if (job.status === 'completed') {
        if (job.direction === 'download') void useLocalStore().refresh()
        else void useRemoteFsStore().refresh()
      }
    },

    clearFinished(): void {
      this.items = this.items.filter((t) => t.status === 'active' || t.status === 'queued')
    }
  }
})
