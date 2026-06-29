import { defineStore } from 'pinia'
import { invoke, FerroError } from '@renderer/lib/ipc'
import type { LocalEntry } from '@shared/transfer'

interface LocalState {
  cwd: string
  entries: LocalEntry[]
  loading: boolean
  error: string | null
}

export const useLocalStore = defineStore('local', {
  state: (): LocalState => ({
    cwd: '',
    entries: [],
    loading: false,
    error: null
  }),
  actions: {
    async init(): Promise<void> {
      const { path } = await invoke('local:home', undefined)
      await this.load(path)
    },

    async load(path: string): Promise<void> {
      this.loading = true
      this.error = null
      try {
        const res = await invoke('local:list', { path })
        this.cwd = res.path
        this.entries = sortEntries(res.entries)
      } catch (err) {
        this.error = err instanceof FerroError ? err.message : String(err)
      } finally {
        this.loading = false
      }
    },

    async open(entry: LocalEntry): Promise<void> {
      if (entry.type === 'directory') await this.load(entry.path)
    },

    async up(): Promise<void> {
      const parts = this.cwd.split('/').filter(Boolean)
      parts.pop()
      await this.load('/' + parts.join('/'))
    },

    async refresh(): Promise<void> {
      if (this.cwd) await this.load(this.cwd)
    },

    join(name: string): string {
      const sep = this.cwd.includes('\\') ? '\\' : '/'
      return this.cwd.endsWith(sep) ? this.cwd + name : this.cwd + sep + name
    },

    async makeDir(name: string): Promise<void> {
      await invoke('local:mkdir', { path: this.join(name) })
      await this.refresh()
    },

    async remove(entry: LocalEntry): Promise<void> {
      await invoke('local:delete', { path: entry.path })
      await this.refresh()
    },

    async rename(entry: LocalEntry, newName: string): Promise<void> {
      await invoke('local:rename', { from: entry.path, to: this.join(newName) })
      await this.refresh()
    }
  }
})

function sortEntries(entries: LocalEntry[]): LocalEntry[] {
  return [...entries].sort((a, b) => {
    const ad = a.type === 'directory' ? 0 : 1
    const bd = b.type === 'directory' ? 0 : 1
    if (ad !== bd) return ad - bd
    return a.name.localeCompare(b.name)
  })
}
