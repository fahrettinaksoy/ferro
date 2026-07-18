import type { FerroBridge } from '@shared/ipc'

// window.ferro köprü tipi. Runtime'da lib/tauriBridge.ts kurar (preload yerine).
declare global {
  interface Window {
    ferro: FerroBridge
  }
}

export {}
