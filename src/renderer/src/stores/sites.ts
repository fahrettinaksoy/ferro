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

export const useSitesStore = defineStore('sites', {
  state: (): SitesState => ({ sites: [], encryptionAvailable: true, loaded: false }),
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
