import { defineStore } from 'pinia'
import { invoke } from '@renderer/lib/ipc'
import type { SavedSite, SiteInput } from '@shared/transfer'
import { useConnectionStore } from './connection'
import { useRemoteFsStore } from './remoteFs'

interface SitesState {
  sites: SavedSite[]
  encryptionAvailable: boolean
  loaded: boolean
  /** "Parola sorulsun" diyaloğunun hedefi (null = kapalı). */
  passwordPrompt: SavedSite | null
  /** Oturum boyunca hatırlanan parolalar (siteId → parola). BELLEKTE tutulur,
   *  hiçbir yere yazılmaz; uygulama kapanınca kaybolur. */
  sessionPasswords: Record<string, string>
}

/** Açık parola diyaloğunun sonucunu bekleyen çözümleyici (tek diyalog varsayımı). */
let promptResolve: ((r: { password: string; remember: boolean } | null) => void) | null = null

/** Bir grup (klasör) ve içindeki siteler. */
export interface SiteGroup {
  name: string
  sites: SavedSite[]
}

export const useSitesStore = defineStore('sites', {
  state: (): SitesState => ({
    sites: [],
    encryptionAvailable: true,
    loaded: false,
    passwordPrompt: null,
    sessionPasswords: {}
  }),
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

    /** Bir grubu (klasörü) yeniden adlandır: gruptaki tüm siteler taşınır. */
    async renameGroup(from: string, to: string): Promise<number> {
      const res = await invoke('sites:renameGroup', { from, to })
      await this.load()
      return res.count
    },

    /** Parola diyaloğunu açar; kullanıcının kararını döndürür (null = iptal). */
    askPassword(site: SavedSite): Promise<{ password: string; remember: boolean } | null> {
      return new Promise((resolve) => {
        promptResolve = resolve
        this.passwordPrompt = site
      })
    },

    /** Parola diyaloğu kapandı (PasswordDialog çağırır). */
    resolvePassword(r: { password: string; remember: boolean } | null): void {
      this.passwordPrompt = null
      promptResolve?.(r)
      promptResolve = null
    },

    /**
     * Siteye bağlan ve uzak paneli yükle. "Parola sorulsun" sitelerinde önce
     * diyalog açılır; iptal edilirse bağlantı başlatılmaz ve false döner.
     */
    async connect(site: SavedSite): Promise<boolean> {
      const conn = useConnectionStore()
      const remote = useRemoteFsStore()

      let password: string | undefined
      if (site.askPassword && !site.anonymous) {
        password = this.sessionPasswords[site.id]
        if (password === undefined) {
          const r = await this.askPassword(site)
          if (!r) return false // iptal — sekme açılmaz
          password = r.password
          if (r.remember) this.sessionPasswords[site.id] = password
        }
      }

      try {
        const cwd = await conn.connectSite(site, password)
        await remote.load(cwd)
        return true
      } catch (err) {
        // Parola yanlış olabilir: hatırlanan parolayı düşür ki bir sonraki
        // denemede yeniden sorulsun.
        if (site.askPassword) delete this.sessionPasswords[site.id]
        throw err
      }
    }
  }
})
