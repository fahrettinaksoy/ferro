import { ElectronAPI } from '@electron-toolkit/preload'
import type { FerroBridge } from '@shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    ferro: FerroBridge
  }
}

export {}
