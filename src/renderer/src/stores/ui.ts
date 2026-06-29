import { defineStore } from 'pinia'
import { setLocale, type Locale } from '@renderer/plugins/i18n'
import { invoke } from '@renderer/lib/ipc'

export type ThemeName = 'ferroLight' | 'ferroDark'

interface UiState {
  theme: ThemeName
  language: Locale
  /** Bant genişliği sınırı (KB/s). 0 = sınırsız. */
  bandwidthKBs: number
}

function loadTheme(): ThemeName {
  return (localStorage.getItem('ferro.theme') as ThemeName | null) ?? 'ferroDark'
}
function loadLang(): Locale {
  return (localStorage.getItem('ferro.lang') as Locale | null) ?? 'tr'
}
function loadBandwidth(): number {
  return Number(localStorage.getItem('ferro.bandwidth') ?? '0') || 0
}

// Uygulama geneli UI durumu (tema + dil), localStorage'da kalıcı.
export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    theme: loadTheme(),
    language: loadLang(),
    bandwidthKBs: loadBandwidth()
  }),
  actions: {
    toggleTheme(): void {
      this.theme = this.theme === 'ferroDark' ? 'ferroLight' : 'ferroDark'
      localStorage.setItem('ferro.theme', this.theme)
    },
    setLanguage(lang: Locale): void {
      this.language = lang
      setLocale(lang)
    },
    /** Bant genişliği sınırını uygular (KB/s; 0 = sınırsız) ve kalıcılaştırır. */
    async setBandwidth(kbs: number): Promise<void> {
      const v = Math.max(0, Math.floor(kbs || 0))
      this.bandwidthKBs = v
      localStorage.setItem('ferro.bandwidth', String(v))
      await invoke('settings:setBandwidth', { bytesPerSec: v * 1024 })
    },
    /** Uygulama açılışında saklı sınırı main'e bildir. */
    async applyBandwidth(): Promise<void> {
      await invoke('settings:setBandwidth', { bytesPerSec: this.bandwidthKBs * 1024 })
    }
  }
})
