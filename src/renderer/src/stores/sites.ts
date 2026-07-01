import { defineStore } from 'pinia'
import { invoke } from '@renderer/lib/ipc'
import type { SavedSite, SiteInput } from '@shared/transfer'
import { useConnectionStore } from './connection'
import { useRemoteFsStore } from './remoteFs'

interface SitesState {
  sites: SavedSite[]
  encryptionAvailable: boolean
  loaded: boolean
}

/** Bir grup (klasör) ve içindeki siteler. */
export interface SiteGroup {
  name: string
  sites: SavedSite[]
}

export const useSitesStore = defineStore('sites', {
  state: (): SitesState => ({ sites: [], encryptionAvailable: true, loaded: false }),
  getters: {
    /** Kullanımdaki benzersiz grup adları (alfabetik) — form seçimi için. */
    groupNames(state): string[] {
      const names = new Set<string>()
      for (const s of state.sites) {
        const g = (s.folder ?? '').trim()
        if (g) names.add(g)
      }
      return [...names].sort((a, b) => a.localeCompare(b))
    },
    /** Siteleri gruplara ayırır: grupsuzlar üstte, gruplar alfabetik. */
    grouped(state): { ungrouped: SavedSite[]; groups: SiteGroup[] } {
      const ungrouped: SavedSite[] = []
      const map = new Map<string, SavedSite[]>()
      for (const s of state.sites) {
        const g = (s.folder ?? '').trim()
        if (!g) {
          ungrouped.push(s)
        } else {
          const arr = map.get(g)
          if (arr) arr.push(s)
          else map.set(g, [s])
        }
      }
      const groups = [...map.entries()]
        .map(([name, sites]) => ({ name, sites }))
        .sort((a, b) => a.name.localeCompare(b.name))
      return { ungrouped, groups }
    }
  },
  actions: {
    async load(): Promise<void> {
      const res = await invoke('sites:list', undefined)
      this.sites = res.sites
      this.encryptionAvailable = res.encryptionAvailable
      this.loaded = true
    },

    async save(input: SiteInput): Promise<void> {
      await invoke('sites:save', input)
      await this.load()
    },

    async remove(id: string): Promise<void> {
      await invoke('sites:delete', { id })
      await this.load()
    },

    /** Siteye bağlan ve uzak paneli yükle. */
    async connect(site: SavedSite): Promise<void> {
      const conn = useConnectionStore()
      const remote = useRemoteFsStore()
      const cwd = await conn.connectSite(site)
      await remote.load(cwd)
    }
  }
})
