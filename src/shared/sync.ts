// Uçtan uca şifreli senkronizasyon (Gist / WebDAV) ortak tipleri.
// Veri cihazdan çıkmadan sync parolasıyla şifrelenir — uzak depo yalnızca
// şifreli blob'u görür. Tipler main (motor) ↔ renderer (UI) arasında ortaktır.

import type { SiteExportEntry } from './transfer'

export type SyncProviderKind = 'gist' | 'webdav'

/** Kullanıcı seçimi: nelerin eşitleneceği. */
export interface SyncInclude {
  /** Site Yöneticisi kayıtları (parolalar dahil — blob içinde şifreli). */
  sites: boolean
  /** Uygulama ayarları (tema, dil, tercihler — renderer localStorage anlık görüntüsü). */
  settings: boolean
}

/** Renderer'a dönen yapılandırma görünümü — sır İÇERMEZ, yalnızca var/yok. */
export interface SyncConfigPublic {
  provider: SyncProviderKind
  include: SyncInclude
  gist: { gistId: string; hasToken: boolean }
  webdav: { url: string; user: string; hasPassword: boolean }
  hasSyncPassword: boolean
  lastSyncAt: string | null
  lastDirection: 'push' | 'pull' | null
}

/**
 * Yapılandırma kaydetme girdisi (renderer → main). Sır alanları opsiyoneldir:
 * undefined = mevcut korunur, boş olmayan değer = güncellenir
 * (site parolası deseniyle tutarlı).
 */
export interface SyncConfigInput {
  provider: SyncProviderKind
  include: SyncInclude
  gist: { gistId: string; token?: string }
  webdav: { url: string; user: string; password?: string }
  syncPassword?: string
}

/** Ayarlar anlık görüntüsü: renderer localStorage anahtarı → değer. */
export type SyncSettingsSnapshot = Record<string, string>

/** Şifrelenen (düz) yük — yalnızca şifreleme sınırının İÇİNDE bulunur. */
export interface SyncPayload {
  kind: 'ferro-sync-payload'
  version: 1
  updatedAt: string
  sites?: SiteExportEntry[]
  settings?: SyncSettingsSnapshot
}

/** Uzak depoya yazılan şifreli zarf. Şifreleme dışındaki alanlar sır içermez. */
export interface SyncBlobFile {
  app: 'ferro'
  kind: 'ferro-sync'
  version: 1
  updatedAt: string
  kdf: { algo: 'scrypt'; salt: string; N: number; r: number; p: number }
  cipher: 'aes-256-gcm'
  /** base64 IV (12 bayt). */
  iv: string
  /** base64 şifreli veri + GCM etiketi (son 16 bayt). */
  data: string
}

/** Uzak depodaki dosya adı (her iki sağlayıcıda da aynı). */
export const SYNC_FILE_NAME = 'ferro-sync.json'
