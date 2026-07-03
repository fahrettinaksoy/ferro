import type { FerroBridge } from '@shared/ipc'

declare global {
  interface Window {
    ferro: FerroBridge
  }
}

export {}
