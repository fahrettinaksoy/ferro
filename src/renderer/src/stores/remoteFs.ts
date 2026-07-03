import { defineStore } from 'pinia'
import { invoke, FerroError } from '@renderer/lib/ipc'
import { joinPosix as joinPath } from '@renderer/lib/paths'
import type { RemoteEntry } from '@shared/transfer'
import { useConnectionStore } from './connection'

/** Tek bir oturumun uzak dosya sistemi durumu. */
interface RemoteFsSession {
  cwd: string
  entries: RemoteEntry[]
  loading: boolean
  error: string | null
}

interface RemoteFsState {
  /** Oturum kimliği → o oturumun uzak FS durumu. */
  bySession: Record<string, RemoteFsSession>
}

/** Bağlı oturum yokken okunan boş varsayılan (salt-okunur). */
const EMPTY: RemoteFsSession = { cwd: '/', entries: [], loading: false, error: null }

export const useRemoteFsStore = defineStore('remoteFs', {
  state: (): RemoteFsState => ({ bySession: {} }),
  getters: {
    /** Etkin oturumun FS dilimi (yoksa boş). */
    current(): RemoteFsSession {
      const id = useConnectionStore().sessionId
      return (id && this.bySession[id]) || EMPTY
    },
    cwd(): string {
      return this.current.cwd
    },
    entries(): RemoteEntry[] {
      return this.current.entries
    },
    loading(): boolean {
      return this.current.loading
    },
    error(): string | null {
      return this.current.error
    }
  },
  actions: {
    /** Etkin oturumun FS dilimini döndürür (yoksa oluşturur). */
    slot(): { id: string; s: RemoteFsSession } {
      const id = useConnectionStore().sessionId
      if (!id) throw new FerroError('NOT_CONNECTED', 'Bağlı değil')
      // DİKKAT: `??=` atama anında SAĞ tarafı (ham nesneyi) döndürür — reaktif
      // proxy'yi değil. Ham nesneye yazılanlar UI'ı tetiklemez (ilk yüklemede
      // panel sonsuza dek iskelette kalırdı). Atayıp proxy'den yeniden okuyoruz.
      if (!this.bySession[id]) {
        this.bySession[id] = { cwd: '/', entries: [], loading: false, error: null }
      }
      return { id, s: this.bySession[id] }
    },

    async load(path?: string): Promise<void> {
      const { id, s } = this.slot()
      s.loading = true
      s.error = null
      try {
        if (path !== undefined) {
          const { cwd } = await invoke('fs:cwd', { sessionId: id, path })
          s.cwd = cwd
        } else {
          s.cwd = (await invoke('fs:pwd', { sessionId: id })).cwd
        }
        // Sıralama panelde (FilePane) tercihlere göre yapılır — burada ham liste tutulur.
        s.entries = await invoke('fs:list', { sessionId: id })
      } catch (err) {
        s.error = err instanceof FerroError ? err.message : String(err)
      } finally {
        s.loading = false
      }
    },

    async open(entry: RemoteEntry): Promise<void> {
      if (entry.type === 'directory') await this.load(joinPath(this.cwd, entry.name))
    },

    async up(): Promise<void> {
      await this.load(joinPath(this.cwd, '..'))
    },

    async refresh(): Promise<void> {
      await this.load(this.cwd)
    },

    async makeDir(name: string): Promise<void> {
      const { id, s } = this.slot()
      await invoke('fs:mkdir', { sessionId: id, path: joinPath(s.cwd, name) })
      await this.refresh()
    },

    async remove(entry: RemoteEntry): Promise<void> {
      const { id, s } = this.slot()
      const path = joinPath(s.cwd, entry.name)
      if (entry.type === 'directory') await invoke('fs:rmdir', { sessionId: id, path })
      else await invoke('fs:delete', { sessionId: id, path })
      await this.refresh()
    },

    async rename(entry: RemoteEntry, newName: string): Promise<void> {
      const { id, s } = this.slot()
      await invoke('fs:rename', {
        sessionId: id,
        from: joinPath(s.cwd, entry.name),
        to: joinPath(s.cwd, newName)
      })
      await this.refresh()
    },

    async chmod(entry: RemoteEntry, mode: number): Promise<void> {
      const { id, s } = this.slot()
      await invoke('fs:chmod', { sessionId: id, path: joinPath(s.cwd, entry.name), mode })
      await this.refresh()
    },

    /** Bir oturum kapatıldığında FS dilimini temizler. */
    dropSession(sessionId: string): void {
      delete this.bySession[sessionId]
    }
  }
})
