import { defineStore } from 'pinia'
import { invoke } from '@renderer/lib/ipc'

interface VaultState {
  mode: 'os' | 'master'
  locked: boolean
  hasMaster: boolean
  loaded: boolean
}

/** Kimlik deposu (master parola) durumu ve işlemleri. */
export const useVaultStore = defineStore('vault', {
  state: (): VaultState => ({ mode: 'os', locked: false, hasMaster: false, loaded: false }),
  actions: {
    async refresh(): Promise<void> {
      const s = await invoke('vault:status', undefined)
      this.mode = s.mode
      this.locked = s.locked
      this.hasMaster = s.hasMaster
      this.loaded = true
    },
    /** Master parolayı ayarlar/değiştirir (mevcut sırlar yeni anahtara taşınır). */
    async setMaster(next: string, current?: string): Promise<void> {
      await invoke('vault:setMaster', { next, current })
      await this.refresh()
    },
    /** Master parolayla depoyu açar; başarılıysa true. */
    async unlock(password: string): Promise<boolean> {
      const { ok } = await invoke('vault:unlock', { password })
      if (ok) await this.refresh()
      return ok
    },
    /** OS keychain moduna döner (master parolayı kaldırır). */
    async useOsKeychain(current: string): Promise<void> {
      await invoke('vault:useOsKeychain', { current })
      await this.refresh()
    }
  }
})
