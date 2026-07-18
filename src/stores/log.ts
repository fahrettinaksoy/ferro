import { defineStore } from 'pinia'
import type { EventMap } from '@shared/ipc'
import { useConnectionStore } from './connection'

export type LogEntry = EventMap['session:log'] & { id: number; time: string }

const MAX = 1000
let counter = 0

export const useLogStore = defineStore('log', {
  state: (): { bySession: Record<string, LogEntry[]> } => ({ bySession: {} }),
  getters: {
    /** Etkin oturumun günlük satırları (yoksa boş). */
    entries(): LogEntry[] {
      const id = useConnectionStore().sessionId
      return (id && this.bySession[id]) || []
    }
  },
  actions: {
    append(e: EventMap['session:log']): void {
      // Sistem locale'i: günlük zaman damgası OS biçimini izler (sabit tr-TR değil).
      const time = new Date().toLocaleTimeString()
      // `??=` ham nesne döndürür (bkz. remoteFs.slot) — proxy'den yeniden oku,
      // yoksa ilk satır ancak ikincisi gelince görünür.
      if (!this.bySession[e.sessionId]) this.bySession[e.sessionId] = []
      const list = this.bySession[e.sessionId]
      list.push({ ...e, id: ++counter, time })
      if (list.length > MAX) list.splice(0, list.length - MAX)
    },
    /** Etkin oturumun günlüğünü temizler. */
    clear(): void {
      const id = useConnectionStore().sessionId
      if (id) this.bySession[id] = []
    },
    /** Bir oturum kapatıldığında günlüğünü temizler. */
    dropSession(sessionId: string): void {
      delete this.bySession[sessionId]
    }
  }
})
