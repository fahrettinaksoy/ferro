import { defineStore } from 'pinia'
import { invoke, FerroError } from '@renderer/lib/ipc'
import type { ConnectionConfig, SavedSite } from '@shared/transfer'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface ConnectionState {
  sessionId: string | null
  status: ConnectionStatus
  error: string | null
  config: ConnectionConfig | null
}

export const useConnectionStore = defineStore('connection', {
  state: (): ConnectionState => ({
    sessionId: null,
    status: 'idle',
    error: null,
    config: null
  }),
  getters: {
    isConnected: (s): boolean => s.status === 'connected' && s.sessionId !== null
  },
  actions: {
    /** Bağlanır; başarılıysa sessionId + ilk çalışma dizinini döndürür. */
    async connect(config: ConnectionConfig): Promise<string> {
      this.status = 'connecting'
      this.error = null
      this.config = config
      try {
        const { sessionId, cwd } = await invoke('connection:connect', config)
        this.sessionId = sessionId
        this.status = 'connected'
        return cwd
      } catch (err) {
        this.status = 'error'
        this.error = err instanceof FerroError ? err.message : String(err)
        this.sessionId = null
        throw err
      }
    },

    /** Kaydedilmiş bir siteye bağlanır (parola main tarafında çözülür). */
    async connectSite(site: SavedSite): Promise<string> {
      this.status = 'connecting'
      this.error = null
      this.config = { ...site, password: undefined }
      try {
        const { sessionId, cwd } = await invoke('sites:connect', { id: site.id })
        this.sessionId = sessionId
        this.status = 'connected'
        return cwd
      } catch (err) {
        this.status = 'error'
        this.error = err instanceof FerroError ? err.message : String(err)
        this.sessionId = null
        throw err
      }
    },

    async disconnect(): Promise<void> {
      if (!this.sessionId) return
      try {
        await invoke('connection:disconnect', { sessionId: this.sessionId })
      } finally {
        this.sessionId = null
        this.status = 'idle'
      }
    }
  }
})
