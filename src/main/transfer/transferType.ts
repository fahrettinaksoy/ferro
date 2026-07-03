import { posix } from 'path'
import type { TransferTypeConfig } from '@shared/transfer'

/**
 * Bir dosyanın FTP ASCII kipinde aktarılıp aktarılmayacağını belirler
 * (Ayarlar → FTP: Dosya türleri). 'binary' → asla; 'ascii' → daima;
 * 'auto' → uzantı/dotfile/uzantısız kurallarına göre.
 */
export function isAsciiTransfer(name: string, tt: TransferTypeConfig | undefined): boolean {
  if (!tt || tt.mode === 'binary') return false
  if (tt.mode === 'ascii') return true
  const base = posix.basename(name)
  if (base.startsWith('.')) return tt.dotfilesAsAscii
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return tt.noExtAsAscii
  return tt.asciiExtensions.includes(base.slice(dot + 1).toLowerCase())
}
