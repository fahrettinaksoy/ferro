import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'

// Ana süreç logger'ı: seviye bazlı, kapsamlı (scope), çift hedefli.
//  - Console: her zaman (dev'de okunur, prod'da görünmez ama zararsız).
//  - Dosya: initFileLog() çağrıldıktan sonra app.getPath('logs') altına, boyut
//    bazlı rotasyonla yazılır. init öncesi satırlar tamponlanır ve init'te boşaltılır.
//  - Redaksiyon: parola/anahtar içerebilecek kalıplar diske/konsola yazılmadan maskelenir.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

let maxFileBytes = 5 * 1024 * 1024 // 5 MB (Ayarlar → Günlük'ten değiştirilir)
const MAX_ROTATED_FILES = 5 // ferro.log + .1 … .4
const PREINIT_BUFFER_LIMIT = 500

let minLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'
let logDir: string | null = null
let logFile: string | null = null
let fileEnabled = true
let currentSize = 0
const preInitBuffer: string[] = []

export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

/** Dosya loglamasını (Ayarlar → Günlük) yapılandırır: aç/kapa + rotasyon boyutu. */
export function configureFileLogging(opts: { toFile: boolean; maxSizeMiB: number }): void {
  fileEnabled = opts.toFile
  maxFileBytes = Math.max(1, opts.maxSizeMiB) * 1024 * 1024
}

/** Kimlik bilgisi kalıplarını maskeler (FTP PASS/ACCT komutları, key=value alanları). */
export function redactSecrets(text: string): string {
  return (
    text
      // PASS/ACCT: satır sonuna kadar maskele — parola boşluk içerebilir.
      .replace(/\b((?:PASS|ACCT)\s+).+$/gim, '$1***')
      .replace(
        /(["']?(?:password|passphrase|secret|privateKey|pass)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi,
        '$1***'
      )
  )
}

function rotateIfNeeded(): void {
  if (!logFile || currentSize < maxFileBytes) return
  try {
    // ferro.log.4 silinir; .3→.4, .2→.3, .1→.2, ferro.log→.1
    const oldest = `${logFile}.${MAX_ROTATED_FILES - 1}`
    if (existsSync(oldest)) rmSync(oldest)
    for (let i = MAX_ROTATED_FILES - 2; i >= 1; i--) {
      const from = `${logFile}.${i}`
      if (existsSync(from)) renameSync(from, `${logFile}.${i + 1}`)
    }
    renameSync(logFile, `${logFile}.1`)
    currentSize = 0
  } catch {
    // rotasyon hatası log akışını durdurmasın
  }
}

function writeToFile(line: string): void {
  if (!fileEnabled) return
  if (!logFile) {
    if (preInitBuffer.length < PREINIT_BUFFER_LIMIT) preInitBuffer.push(line)
    return
  }
  try {
    rotateIfNeeded()
    appendFileSync(logFile, line + '\n', 'utf8')
    currentSize += Buffer.byteLength(line) + 1
  } catch {
    // disk hatası uygulamayı düşürmesin
  }
}

/**
 * Dosya loglamasını başlatır. index.ts, app hazır olduğunda
 * `initFileLog(app.getPath('logs'))` ile çağırır; tamponlanan satırlar boşaltılır.
 */
export function initFileLog(dir: string, fileName = 'ferro.log'): void {
  try {
    mkdirSync(dir, { recursive: true })
    logDir = dir
    logFile = join(dir, fileName)
    currentSize = existsSync(logFile) ? statSync(logFile).size : 0
    const buffered = preInitBuffer.splice(0)
    for (const line of buffered) writeToFile(line)
  } catch (err) {
    console.error('[logger] dosya loglaması başlatılamadı:', err)
  }
}

/** Etkin log dizini (kullanıcıya "logları aç" göstermek için). */
export function getLogDirectory(): string | null {
  return logDir
}

function formatMeta(meta: unknown): string {
  if (meta === undefined) return ''
  try {
    return ' ' + JSON.stringify(meta)
  } catch {
    return ' ' + String(meta)
  }
}

function emit(level: LogLevel, scope: string, msg: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
  const safeMsg = redactSecrets(msg)
  const safeMeta = redactSecrets(formatMeta(meta))
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${safeMsg}${safeMeta}`
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(line)
  writeToFile(line)
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
