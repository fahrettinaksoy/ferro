import { homedir } from 'os'
import { normalize, isAbsolute, parse, resolve } from 'path'
import { FerroError } from '@shared/errors'

// Yerel yol güvenliği: router'daki şema doğrulaması tipi garanti eder; burada
// yol normalize edilir ve mutlaklık yeniden denetlenir ("../" dizileri
// normalize ile çözülür, göreli yol asla dosya sistemine ulaşmaz).

/** Normalize edilmiş, mutlak, null bayt içermeyen yerel yol döndürür. */
export function safeLocalPath(p: string): string {
  const n = normalize(p)
  if (!isAbsolute(n) || n.includes('\0')) {
    throw new FerroError('VALIDATION', 'Geçersiz yerel yol', p)
  }
  return n
}

/**
 * Yıkıcı işlemler (silme, taşıma kaynağı) için ek koruma: dosya sistemi kökü,
 * sürücü kökü ve kullanıcının ev dizininin kendisi hedef olamaz.
 */
export function safeDestructiveLocalPath(p: string): string {
  const n = safeLocalPath(p)
  const root = parse(n).root
  if (resolve(n) === resolve(root) || resolve(n) === resolve(homedir())) {
    throw new FerroError('VALIDATION', 'Bu yol üzerinde yıkıcı işlem yapılamaz', n)
  }
  return n
}
