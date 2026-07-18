import { defineStore } from 'pinia'
import { invoke } from '@renderer/lib/ipc'
import type { ConnectionConfig, SavedSite } from '@shared/transfer'
import { useRemoteFsStore } from './remoteFs'
import { useLogStore } from './log'

/** Açık bir bağlantı sekmesi (oturum). */
export interface OpenSession {
  /** Sekmenin DEĞİŞMEZ kimliği (v-for :key). sessionId bağlanınca geçici
      kimlikten gerçek kimliğe dönüştüğünden :key olarak kullanılamaz — sekme
      sökülüp yeniden takılır ve v-tabs seçimi eski sekmeye geri yazar. */
  tabId: string
  sessionId: string
  config: ConnectionConfig
  /** Sekmede gösterilecek ad (site adı ya da host). */
  name: string
  /** Kaydedilmiş bir siteden açıldıysa site kimliği (yeniden bağlanmada kullanılır). */
  siteId?: string
  status: 'connecting' | 'connected' | 'error'
  error: string | null
}

/** Geçici (main'in kimliği henüz gelmemiş) bekleyen oturum sayacı. */
let pendingSeq = 0

interface ConnectionState {
  /** Açık oturumlar — her biri bir sekme. */
  sessions: OpenSession[]
  /** Etkin sekmenin oturum kimliği. */
  activeId: string | null
}

export const useConnectionStore = defineStore('connection', {
  state: (): ConnectionState => ({ sessions: [], activeId: null }),
  getters: {
    /** Etkin oturum (sekme) ya da yoksa null. */
    active: (s): OpenSession | null => s.sessions.find((x) => x.sessionId === s.activeId) ?? null,
    /** Etkin oturumun kimliği (uzak/transfer store'ları bunu kullanır). */
    sessionId(): string | null {
      return this.active?.sessionId ?? null
    },
    /** Etkin oturum bağlı mı? */
    isConnected(): boolean {
      return this.active?.status === 'connected'
    },
    /** Etkin oturumun yapılandırması. */
    config(): ConnectionConfig | null {
      return this.active?.config ?? null
    }
  },
  actions: {
    /** Etkin sekmeyi değiştirir (oturum kimliği ya da değişmez sekme kimliğiyle). */
    setActive(id: string): void {
      const s = this.sessions.find((x) => x.sessionId === id || x.tabId === id)
      if (s) this.activeId = s.sessionId
    },

    /**
     * Bağlantı denemesi için hemen bekleyen bir sekme açar ve etkinleştirir —
     * uzak panel "Bağlanıyor" durumunu, log paneli de canlı akışı gösterebilsin.
     * Dizideki reaktif nesne döndürülür; sonraki mutasyonlar UI'a yansır.
     */
    openPending(name: string, config: ConnectionConfig, siteId?: string): OpenSession {
      const tabId = `tab-${++pendingSeq}`
      this.sessions.push({
        tabId,
        sessionId: `pending-${pendingSeq}`,
        config,
        name,
        siteId,
        status: 'connecting',
        error: null
      })
      const s = this.sessions[this.sessions.length - 1]
      this.activeId = s.sessionId
      return s
    },

    /**
     * Main'den 'session:connecting' gelince bekleyen sekmeyi gerçek oturum
     * kimliğine bağlar; böylece o kimlikle akan session:log satırları
     * bağlantı kurulmadan önce log panelinde görünür.
     */
    bindPending(e: { sessionId: string; host: string; port: number }): void {
      const s = this.sessions.find(
        (x) =>
          x.status === 'connecting' &&
          x.sessionId.startsWith('pending-') &&
          x.config.host === e.host &&
          x.config.port === e.port
      )
      if (!s) return
      if (this.activeId === s.sessionId) this.activeId = e.sessionId
      s.sessionId = e.sessionId
    },

    /** Bekleyen oturumu sonuca bağlayan ortak akış. */
    async settlePending(
      s: OpenSession,
      p: Promise<{ sessionId: string; cwd: string }>
    ): Promise<string> {
      try {
        const { sessionId, cwd } = await p
        if (!this.sessions.includes(s)) {
          // Sekme bağlanma sürerken kapatıldı: main'de açılan oturumu sahipsiz bırakma.
          void invoke('connection:disconnect', { sessionId }).catch(() => {})
          throw new Error('Bağlantı iptal edildi')
        }
        s.sessionId = sessionId
        s.status = 'connected'
        s.error = null
        this.activeId = sessionId
        return cwd
      } catch (err) {
        // Sekme kalır: uzak panel ve log hatayı gösterir; kullanıcı X ile kapatır.
        s.status = 'error'
        s.error = err instanceof Error ? err.message : String(err)
        throw err
      }
    },

    /** Kaydedilmiş bir siteye bağlanır; YENİ sekme açar ve onu etkin yapar.
     *  password: "parola sorulsun" akışında o an girilen parola (saklanmaz). */
    async connectSite(site: SavedSite, password?: string): Promise<string> {
      const s = this.openPending(site.name || site.host, { ...site, password: undefined }, site.id)
      return this.settlePending(s, invoke('sites:connect', { id: site.id, password }))
    },

    /** Elle (hızlı) bağlantı; yeni sekme açar. */
    async connect(config: ConnectionConfig): Promise<string> {
      const s = this.openPending(config.host, config)
      return this.settlePending(s, invoke('connection:connect', config))
    },

    /**
     * Bir oturumu kapatır (varsayılan: etkin olan) ve ilgili uzak/günlük
     * durumunu temizler. Kapatılan etkin sekmeyse en son sekmeye geçilir.
     */
    async disconnect(sessionId?: string | null): Promise<void> {
      sessionId = sessionId ?? this.sessionId
      if (!sessionId) return
      const target = this.sessions.find((x) => x.sessionId === sessionId)
      try {
        // Hiç bağlanamamış (hata) sekmede main tarafında oturum yok — IPC gereksiz.
        if (!target || target.status === 'connected') {
          await invoke('connection:disconnect', { sessionId })
        }
      } finally {
        this.sessions = this.sessions.filter((x) => x.sessionId !== sessionId)
        if (this.activeId === sessionId) {
          this.activeId = this.sessions.length
            ? this.sessions[this.sessions.length - 1].sessionId
            : null
        }
        useRemoteFsStore().dropSession(sessionId)
        useLogStore().dropSession(sessionId)
      }
    }
  }
})
