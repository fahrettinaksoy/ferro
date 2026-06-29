import { defineStore } from 'pinia'
import { invoke, FerroError } from '@renderer/lib/ipc'
import type { RemoteEntry } from '@shared/transfer'
import { useConnectionStore } from './connection'

interface RemoteFsState {
  cwd: string
  entries: RemoteEntry[]
  loading: boolean
  error: string | null
}

/** POSIX yol birleştirme (uzak sunucu yolları '/' kullanır). */
function joinPath(base: string, name: string): string {
  if (name === '..') {
    const parts = base.split('/').filter(Boolean)
    parts.pop()
    return '/' + parts.join('/')
  }
  return (base.endsWith('/') ? base : base + '/') + name
}

export const useRemoteFsStore = defineStore('remoteFs', {
  state: (): RemoteFsState => ({
    cwd: '/',
    entries: [],
    loading: false,
    error: null
  }),
  actions: {
    sessionId(): string {
      const conn = useConnectionStore()
      if (!conn.sessionId) throw new FerroError('NOT_CONNECTED', 'Bağlı değil')
      return conn.sessionId
    },

    async load(path?: string): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const sessionId = this.sessionId()
        if (path !== undefined) {
          const { cwd } = await invoke('fs:cwd', { sessionId, path })
          this.cwd = cwd
        } else {
          this.cwd = (await invoke('fs:pwd', { sessionId })).cwd
        }
        this.entries = sortEntries(await invoke('fs:list', { sessionId }))
      } catch (err) {
        this.error = err instanceof FerroError ? err.message : String(err)
      } finally {
        this.loading = false
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
      await invoke('fs:mkdir', { sessionId: this.sessionId(), path: joinPath(this.cwd, name) })
      await this.refresh()
    },

    async remove(entry: RemoteEntry): Promise<void> {
      const sessionId = this.sessionId()
      const path = joinPath(this.cwd, entry.name)
      if (entry.type === 'directory') await invoke('fs:rmdir', { sessionId, path })
      else await invoke('fs:delete', { sessionId, path })
      await this.refresh()
    },

    async rename(entry: RemoteEntry, newName: string): Promise<void> {
      await invoke('fs:rename', {
        sessionId: this.sessionId(),
        from: joinPath(this.cwd, entry.name),
        to: joinPath(this.cwd, newName)
      })
      await this.refresh()
    },

    async chmod(entry: RemoteEntry, mode: number): Promise<void> {
      await invoke('fs:chmod', {
        sessionId: this.sessionId(),
        path: joinPath(this.cwd, entry.name),
        mode
      })
      await this.refresh()
    },

    reset(): void {
      this.cwd = '/'
      this.entries = []
      this.error = null
    }
  }
})

function sortEntries(entries: RemoteEntry[]): RemoteEntry[] {
  return [...entries].sort((a, b) => {
    const ad = a.type === 'directory' ? 0 : 1
    const bd = b.type === 'directory' ? 0 : 1
    if (ad !== bd) return ad - bd
    return a.name.localeCompare(b.name)
  })
}
