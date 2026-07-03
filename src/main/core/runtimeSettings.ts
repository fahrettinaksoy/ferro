import type {
  RuntimeSettings,
  FileExistsAction,
  ProxyConfig,
  TransferTypeConfig
} from '@shared/transfer'

// Renderer'dan (Ayarlar penceresi) itilen çalışma zamanı ayarlarının tek deposu.
// Pure singleton — transfer/adapter modüllerini import ETMEZ (döngü olmasın);
// tüketiciler buradan okur, uygulama (setBandwidth/pool/logger) IPC handler'ında yapılır.

const DEFAULTS: RuntimeSettings = {
  bandwidthBytesPerSec: 0,
  maxConnections: 3,
  connectTimeoutMs: 20_000,
  keepAlive: false,
  retryMaxAttempts: 3,
  retryDelayMs: 5_000,
  fileExistsDownload: 'resume',
  fileExistsUpload: 'resume',
  transferType: {
    mode: 'auto',
    asciiExtensions: [],
    noExtAsAscii: true,
    dotfilesAsAscii: true
  },
  editor: { mode: 'system', customPath: '' },
  proxy: { type: 'none', host: '', port: 0 },
  logging: { toFile: true, maxSizeMiB: 5 },
  updates: { frequency: 'weekly', channel: 'stable' }
}

let current: RuntimeSettings = DEFAULTS

export function getRuntimeSettings(): RuntimeSettings {
  return current
}

export function setRuntimeSettings(next: RuntimeSettings): void {
  current = next
}

// ── Tüketici kolaylık getter'ları ──
export function connectTimeoutMs(): number {
  return current.connectTimeoutMs
}
export function keepAliveEnabled(): boolean {
  return current.keepAlive
}
export function retryPolicy(): { maxAttempts: number; baseDelayMs: number } {
  return { maxAttempts: current.retryMaxAttempts, baseDelayMs: current.retryDelayMs }
}
export function fileExistsPolicy(direction: 'download' | 'upload'): FileExistsAction {
  return direction === 'download' ? current.fileExistsDownload : current.fileExistsUpload
}
export function transferTypeConfig(): TransferTypeConfig {
  return current.transferType
}
export function editorSettings(): RuntimeSettings['editor'] {
  return current.editor
}
export function activeProxy(): ProxyConfig | undefined {
  return current.proxy.type === 'none' || !current.proxy.host ? undefined : current.proxy
}
