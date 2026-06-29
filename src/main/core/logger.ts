// Ana süreç için seviye bazlı yapısal logger. İleride dosyaya yazma eklenebilir.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

let minLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

function emit(level: LogLevel, scope: string, msg: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
  const line = `[${level.toUpperCase()}] [${scope}] ${msg}`
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  if (meta !== undefined) fn(line, meta)
  else fn(line)
}

export interface Logger {
  debug(msg: string, meta?: unknown): void
  info(msg: string, meta?: unknown): void
  warn(msg: string, meta?: unknown): void
  error(msg: string, meta?: unknown): void
  child(subScope: string): Logger
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, meta) => emit('debug', scope, m, meta),
    info: (m, meta) => emit('info', scope, m, meta),
    warn: (m, meta) => emit('warn', scope, m, meta),
    error: (m, meta) => emit('error', scope, m, meta),
    child: (sub) => createLogger(`${scope}:${sub}`)
  }
}
