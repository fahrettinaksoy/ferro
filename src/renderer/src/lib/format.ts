import type { EntryType } from '@shared/transfer'

export function formatSize(bytes: number): string {
  if (bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`
}

export function formatDate(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function entryIcon(type: EntryType): string {
  switch (type) {
    case 'directory':
      return 'mdi-folder'
    case 'symlink':
      return 'mdi-link-variant'
    default:
      return 'mdi-file-outline'
  }
}

/** Octal izinleri rwx string'ine çevirir (örn. 0o755 → rwxr-xr-x). */
export function formatPermissions(mode: number | null): string {
  if (mode === null) return ''
  const map = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  return map[(mode >> 6) & 7] + map[(mode >> 3) & 7] + map[mode & 7]
}
