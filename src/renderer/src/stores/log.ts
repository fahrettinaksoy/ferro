import { defineStore } from 'pinia'
import type { EventMap } from '@shared/ipc'

export type LogEntry = EventMap['session:log'] & { id: number; time: string }

const MAX = 1000
let counter = 0

export const useLogStore = defineStore('log', {
  state: (): { entries: LogEntry[] } => ({ entries: [] }),
  actions: {
    append(e: EventMap['session:log']): void {
      const time = new Date().toLocaleTimeString('tr-TR')
      this.entries.push({ ...e, id: ++counter, time })
      if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX)
    },
    clear(): void {
      this.entries = []
    }
  }
})
