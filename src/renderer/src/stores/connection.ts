import { defineStore } from 'pinia'
import { invoke } from '@renderer/lib/ipc'
import type { ConnectionConfig, SavedSite } from '@shared/transfer'
import { useRemoteFsStore } from './remoteFs'
import { useLogStore } from './log'

/** Açık bir bağlantı sekmesi (oturum). */
export interface OpenSession {
  sessionId: string
  config: ConnectionConfig
  /** Sekmede gösterilecek ad (site adı ya da host). */
  name: string
  status: 'connected' | 'error'
  error: string | null
}

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
    },
    /** Verilen host/port için açık bir oturum (sekme) var mı? */
    hasOpen: (s) => (host: string, port: number): boolean =>
      s.sessions.some((x) => x.config.host === host && x.config.port === port)
  },
  actions: {
    /** Etkin sekmeyi değiştirir. */
    setActive(sessionId: string): void {
      if (this.sessions.some((x) => x.sessionId === sessionId)) this.activeId = sessionId
    },

    /** Kaydedilmiş bir siteye bağlanır; YENİ sekme açar ve onu etkin yapar. */
    async connectSite(site: SavedSite): Promise<string> {
      const { sessionId, cwd } = await invoke('sites:connect', { id: site.id })
      this.sessions.push({
        sessionId,
        config: { ...site, password: undefined },
        name: site.name || site.host,
        status: 'connected',
        error: null
      })
      this.activeId = sessionId
      return cwd
    },

    /** Elle (hızlı) bağlantı; yeni sekme açar. */
    async connect(config: ConnectionConfig): Promise<string> {
      const { sessionId, cwd } = await invoke('connection:connect', config)
      this.sessions.push({
        sessionId,
        config,
        name: config.host,
        status: 'connected',
        error: null
      })
      this.activeId = sessionId
      return cwd
    },

    /**
     * Bir oturumu kapatır (varsayılan: etkin olan) ve ilgili uzak/günlük
     * durumunu temizler. Kapatılan etkin sekmeyse en son sekmeye geçilir.
     */
    async disconnect(sessionId?: string | null): Promise<void> {
      sessionId = sessionId ?? this.sessionId
      if (!sessionId) return
      try {
        await invoke('connection:disconnect', { sessionId })
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
