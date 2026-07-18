import { defineStore } from 'pinia'
import { invoke } from '@renderer/lib/ipc'
import type { SyncConfigInput, SyncConfigPublic, SyncSettingsSnapshot } from '@shared/sync'

// ── Kişisel senkronizasyon deposu ───────────────────────────────────────────
// Ayarlar'dan Ekipler paneline taşınan tek-kullanıcı (cihazlar arası) senkron.
// Siteleri VE uygulama ayarlarını uçtan uca şifreli olarak Gist/WebDAV'a taşır.
// Yapılandırma + sırlar main süreçte (sync.json, vault) durur; burada ince bir
// IPC sarmalayıcı + otomatik-senkron zamanlaması vardır. Sırlar renderer'a gelmez.

interface SyncState {
  config: SyncConfigPublic | null
  loaded: boolean
  /** Son sync:peek'ten gelen uzak zaman damgası (durum rozeti/çakışma için). */
  remoteUpdatedAt: string | null
  peeked: boolean
}

/** Otomatik itme debounce zamanlayıcısı (modül düzeyi — tek kanal). */
let autoPushTimer: ReturnType<typeof setTimeout> | null = null
const AUTO_PUSH_DELAY_MS = 4000

export const useSyncStore = defineStore('sync', {
  state: (): SyncState => ({
    config: null,
    loaded: false,
    remoteUpdatedAt: null,
    peeked: false
  }),
  getters: {
    /** Push/pull için gerekli asgari yapılandırma tam mı? */
    isConfigured(state): boolean {
      const c = state.config
      if (!c || !c.hasSyncPassword) return false
      return c.provider === 'gist' ? c.gist.hasToken : !!c.webdav.url && c.webdav.hasPassword
    },
    autoSync(state): boolean {
      return !!state.config?.autoSync
    },
    autoPush(state): boolean {
      return !!state.config?.autoPush
    },
    /**
     * Durum: uzakta bizim son gördüğümüzden farklı bir sürüm var mı?
     * (peek sonrası anlamlı; peek edilmemişse null = bilinmiyor.)
     */
    remoteChanged(state): boolean | null {
      if (!state.peeked || !state.config) return null
      // Uzak kopya yok → değişiklik yok.
      if (state.remoteUpdatedAt === null) return false
      return state.remoteUpdatedAt !== state.config.lastRemoteUpdatedAt
    }
  },
  actions: {
    async load(): Promise<void> {
      const { config } = await invoke('sync:getConfig', undefined)
      this.config = config
      this.loaded = true
    },

    async save(input: SyncConfigInput): Promise<void> {
      const { config } = await invoke('sync:setConfig', input)
      this.config = config
    },

    /** Eşitlenecek ayarlar: tüm ferro.* localStorage anahtarları. */
    settingsSnapshot(): SyncSettingsSnapshot {
      const out: SyncSettingsSnapshot = {}
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith('ferro.')) continue
        const value = localStorage.getItem(key)
        if (value !== null) out[key] = value
      }
      return out
    },

    /** Uzaktan gelen ayarları localStorage'a uygular; DEĞİŞEN anahtar oldu mu döner. */
    applySettings(settings: SyncSettingsSnapshot): boolean {
      let changed = false
      for (const [key, value] of Object.entries(settings)) {
        if (localStorage.getItem(key) !== value) {
          localStorage.setItem(key, value)
          changed = true
        }
      }
      return changed
    },

    async push(): Promise<{ sites: number; settings: boolean }> {
      const res = await invoke('sync:push', {
        settings: this.config?.include.settings ? this.settingsSnapshot() : undefined
      })
      // Yerel görünümü tazele (lastSyncAt / lastRemoteUpdatedAt güncellenir).
      await this.load()
      this.remoteUpdatedAt = res.updatedAt
      this.peeked = true
      return { sites: res.sites, settings: res.settings }
    },

    /** Uzak yükü çeker. applySettingsResult=true ise ayarları da uygular. */
    async pull(applySettingsToo = true): Promise<{
      found: boolean
      sites?: { imported: number; skipped: number; total: number }
      settingsChanged: boolean
    }> {
      const res = await invoke('sync:pull', undefined)
      await this.load()
      if (res.updatedAt) {
        this.remoteUpdatedAt = res.updatedAt
        this.peeked = true
      }
      let settingsChanged = false
      if (applySettingsToo && res.settings) {
        settingsChanged = this.applySettings(res.settings)
      }
      return { found: res.found, sites: res.sites, settingsChanged }
    },

    /** Uzak zaman damgasını çeker (içe aktarma yok) — durum/çakışma için. */
    async peek(): Promise<void> {
      const res = await invoke('sync:peek', undefined)
      this.remoteUpdatedAt = res.updatedAt
      this.peeked = true
    },

    /**
     * Açılışta otomatik çek (yalnızca autoSync açık + yapılandırılmışsa).
     * Ayarlar değiştiyse tek seferlik yeniden yükleme yapılır (döngü korumalı:
     * yalnızca gerçekten değişen anahtar varsa reload). Site içe aktarımı main'de
     * yapılır; renderer yalnızca listeyi tazelemek için siteStore.load çağırır.
     */
    async autoPullOnStartup(): Promise<boolean> {
      if (!this.autoSync || !this.isConfigured) return false
      try {
        const res = await this.pull(true)
        return res.settingsChanged // çağıran, gerekirse reload eder
      } catch {
        return false // sessiz: açılışta ağ hatası kullanıcıyı rahatsız etmesin
      }
    },

    /**
     * Site değişikliğinden sonra otomatik itmeyi zamanlar (debounce). Yalnızca
     * autoPush açık + yapılandırılmışsa iter. Kullanıcı kaynaklı mutasyonlardan
     * (siteStore.save/remove/renameGroup) çağrılır — otomatik çekmenin ürettiği
     * import bu yola girmez, geri besleme döngüsü oluşmaz.
     */
    scheduleAutoPush(): void {
      if (!this.autoPush || !this.isConfigured) return
      if (autoPushTimer) clearTimeout(autoPushTimer)
      autoPushTimer = setTimeout(() => {
        autoPushTimer = null
        void this.push().catch(() => {
          /* sessiz: otomatik itme hatası panelde son-eşitleme durumundan görülür */
        })
      }, AUTO_PUSH_DELAY_MS)
    }
  }
})
