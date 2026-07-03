import type { EntryType } from '@shared/transfer'
import type { FileListsPrefs } from '@renderer/stores/ui'

// Dosya listesi sıralaması — tek doğruluk kaynağı (önceden local/remoteFs
// store'larında ve FilePane'de üç ayrı kopya vardı). Ayarlar → Dosya listeleri
// tercihlerine (sortMode, nameSort) saygı gösterir.

export interface EntryLike {
  name: string
  type: EntryType
}

/** Klasör/dosya gruplama sırası: dirs-first 0/1, files-first 1/0, mixed hep 0. */
export function dirRank(type: EntryType, sortMode: FileListsPrefs['sortMode']): number {
  if (sortMode === 'mixed') return 0
  const isDir = type === 'directory' ? 0 : 1
  return sortMode === 'files-first' ? 1 - isDir : isDir
}

/** Ad karşılaştırması — Ayarlar'daki ad sıralama kipine göre. */
export function compareNames(a: string, b: string, nameSort: FileListsPrefs['nameSort']): number {
  switch (nameSort) {
    case 'natural':
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    case 'case-insensitive':
      return a.localeCompare(b, undefined, { sensitivity: 'base' })
    default:
      return a < b ? -1 : a > b ? 1 : 0
  }
}
