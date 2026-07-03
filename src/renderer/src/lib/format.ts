import type { EntryType } from '@shared/transfer'
import type { FileSizePrefs, DateTimePrefs } from '@renderer/stores/ui'
import { i18n } from '@renderer/plugins/i18n'

/** Etkin UI dilinin BCP-47 locale etiketi — tarih/sayı biçimleri UI dilini izler. */
export function localeTag(): string {
  return i18n.global.locale.value === 'tr' ? 'tr-TR' : 'en-US'
}

// ── Dosya boyutu (Ayarlar → Dosya boyutu biçimi tercihlerine saygılıdır) ──

const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
const SI_BINARY_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] // 1024 tabanlı, SI adları (FileZilla)
const SI_DECIMAL_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] // 1000 tabanlı

function scaled(bytes: number, base: number, units: string[], decimals: number): string {
  let v = bytes
  let i = 0
  while (v >= base && i < units.length - 1) {
    v /= base
    i++
  }
  const text = i === 0 ? String(v) : v.toFixed(decimals)
  return `${text} ${units[i]}`
}

export function formatSize(bytes: number, prefs?: FileSizePrefs): string {
  if (bytes <= 0) return '—'
  if (!prefs) return scaled(bytes, 1024, SI_BINARY_UNITS, 1)
  switch (prefs.format) {
    case 'iec':
      return scaled(bytes, 1024, IEC_UNITS, prefs.decimalPlaces)
    case 'si-binary':
      return scaled(bytes, 1024, SI_BINARY_UNITS, prefs.decimalPlaces)
    case 'si-decimal':
      return scaled(bytes, 1000, SI_DECIMAL_UNITS, prefs.decimalPlaces)
    default:
      // 'bytes': ham bayt sayısı; binlik ayıracı tercihe ve UI diline göre.
      return prefs.thousandsSep ? bytes.toLocaleString(localeTag()) : String(bytes)
  }
}

// ── Tarih/saat (Ayarlar → Tarih/saat biçimi tercihlerine saygılıdır) ──

/** Desteklenen strftime alt kümesi: %Y %y %m %d %H %M %S (FileZilla ile uyumlu). */
function strftime(pattern: string, d: Date): string {
  const p2 = (n: number): string => String(n).padStart(2, '0')
  return pattern
    .replace(/%Y/g, String(d.getFullYear()))
    .replace(/%y/g, p2(d.getFullYear() % 100))
    .replace(/%m/g, p2(d.getMonth() + 1))
    .replace(/%d/g, p2(d.getDate()))
    .replace(/%H/g, p2(d.getHours()))
    .replace(/%M/g, p2(d.getMinutes()))
    .replace(/%S/g, p2(d.getSeconds()))
}

function datePart(d: Date, prefs?: DateTimePrefs): string {
  if (prefs?.dateMode === 'iso') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (prefs?.dateMode === 'custom' && prefs.dateCustom.trim()) {
    return strftime(prefs.dateCustom, d)
  }
  return d.toLocaleDateString(localeTag(), { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function timePart(d: Date, prefs?: DateTimePrefs): string {
  if (prefs?.timeMode === 'iso') {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (prefs?.timeMode === 'custom' && prefs.timeCustom.trim()) {
    return strftime(prefs.timeCustom, d)
  }
  return d.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(ms: number | null, prefs?: DateTimePrefs): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${datePart(d, prefs)} ${timePart(d, prefs)}`
}

export function entryIcon(type: EntryType): string {
  switch (type) {
    case 'directory':
      return '$folder'
    case 'symlink':
      return '$symlink'
    default:
      return '$fileEntry'
  }
}

/** Octal izinleri rwx string'ine çevirir (örn. 0o755 → rwxr-xr-x). */
export function formatPermissions(mode: number | null): string {
  if (mode === null) return ''
  const map = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  return map[(mode >> 6) & 7] + map[(mode >> 3) & 7] + map[mode & 7]
}
