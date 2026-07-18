// Yol birleştirme yardımcıları — tek doğruluk kaynağı (önceden local/remoteFs/transfer
// store'larında üç ayrı kopya vardı).

/** POSIX yol birleştirme (uzak sunucu yolları '/'). '..' bir üst dizine çıkar. */
export function joinPosix(base: string, name: string): string {
  if (name === '..') {
    const parts = base.split('/').filter(Boolean)
    parts.pop()
    return '/' + parts.join('/')
  }
  return (base.endsWith('/') ? base : base + '/') + name
}

/** Yerel yol birleştirme — ayıracı mevcut yoldan sezer (Windows '\\' / POSIX '/'). */
export function joinLocalPath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/'
  return base.endsWith(sep) ? base + name : base + sep + name
}
