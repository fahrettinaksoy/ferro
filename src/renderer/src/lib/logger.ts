// Renderer için hafif seviye bazlı logger (main'deki ile aynı arayüz şekli).
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(msg: string, meta?: unknown): void
  info(msg: string, meta?: unknown): void
  warn(msg: string, meta?: unknown): void
  error(msg: string, meta?: unknown): void
}

export function createLogger(scope: string): Logger {
  const fmt = (msg: string): string => `[${scope}] ${msg}`
  return {
    debug: (m, meta) => console.debug(fmt(m), meta ?? ''),
    info: (m, meta) => console.info(fmt(m), meta ?? ''),
    warn: (m, meta) => console.warn(fmt(m), meta ?? ''),
    error: (m, meta) => console.error(fmt(m), meta ?? '')
  }
}
