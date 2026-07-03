import { readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync } from 'fs'
import { dirname } from 'path'
import { createLogger } from '../core/logger'

const log = createLogger('store')

// ── Dayanıklı JSON deposu ──────────────────────────────────────────────────
// Tüm kalıcı depolar (sites, known_hosts, trusted_certs) için ortak kurallar:
//  1. Atomik yazma: önce .tmp'ye yaz, sonra rename — yarım yazım ana dosyayı bozamaz.
//  2. Sürümlü zarf: { version, data } — ileride şema değişince migrate edilebilir.
//  3. Bozulma karantinası: parse edilemeyen dosya .corrupt olarak SAKLANIR
//     (üzerine yazılıp veri kaybedilmez), depo boş/varsayılan olarak açılır.

interface Envelope {
  version: number
  data: unknown
}

function isEnvelope(v: unknown): v is Envelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as Envelope).version === 'number' &&
    'data' in v
  )
}

/** Değeri {version, data} zarfıyla atomik olarak (tmp + rename) yazar. */
export function writeJsonVersioned(path: string, version: number, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify({ version, data } satisfies Envelope, null, 2), 'utf8')
  renameSync(tmp, path)
}

export interface ReadOptions<T> {
  /**
   * Zarf öncesi eski (çıplak) formatı güncel şemaya taşır. Tanıyamazsa null
   * döndürmelidir; null → dosya bozuk kabul edilir ve karantinaya alınır.
   */
  legacy?: (parsed: unknown) => T | null
  /** Eski zarf sürümünü güncel şemaya taşır. Tanıyamazsa null döndürmelidir. */
  migrate?: (fileVersion: number, data: unknown) => T | null
  /**
   * Bozuk dosya karantinaya alındıktan sonra dönecek değer. Verilmezse
   * onMissing() kullanılır. "İlk çalıştırma" ile "bozulma"nın farklı davranması
   * gerektiğinde (örn. bozulmada seed İÇE AKTARMAMAK için) kullanılır.
   */
  onCorrupt?: () => T
}

/**
 * Sürümlü depoyu okur.
 *  - Dosya yoksa: onMissing() (ilk çalıştırma).
 *  - Güncel sürümse: data.
 *  - Eski zarf sürümü / eski çıplak format: migrate()/legacy() ile taşınır.
 *  - Bozuksa: dosya `.corrupt` kopyasına alınır ve onMissing() döner — böylece
 *    bozulan veri bir sonraki save()'de sessizce silinmez, kurtarılabilir kalır.
 */
export function readJsonVersioned<T>(
  path: string,
  version: number,
  onMissing: () => T,
  opts: ReadOptions<T> = {}
): T {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return onMissing() // dosya yok → ilk çalıştırma
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (isEnvelope(parsed)) {
      if (parsed.version === version) return parsed.data as T
      const migrated = opts.migrate?.(parsed.version, parsed.data) ?? null
      if (migrated !== null) {
        log.info(`${path}: v${parsed.version} → v${version} taşındı`)
        return migrated
      }
      throw new Error(`desteklenmeyen depo sürümü: ${parsed.version}`)
    }
    const legacy = opts.legacy?.(parsed) ?? null
    if (legacy !== null) {
      log.info(`${path}: eski format güncel şemaya taşındı`)
      return legacy
    }
    throw new Error('tanınmayan depo biçimi')
  } catch (err) {
    const quarantine = `${path}.corrupt`
    try {
      copyFileSync(path, quarantine)
      log.error(`${path} bozuk — kopya ${quarantine} olarak saklandı`, String(err))
    } catch (copyErr) {
      log.error(`${path} bozuk ve karantinaya alınamadı`, String(copyErr))
    }
    return (opts.onCorrupt ?? onMissing)()
  }
}
