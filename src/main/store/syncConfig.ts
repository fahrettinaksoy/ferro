import { app } from 'electron'
import { join } from 'path'
import { readJsonVersioned, writeJsonVersioned } from './jsonStore'
import { encryptSecret, decryptSecret } from './vault'
import type { SyncConfigInput, SyncConfigPublic, SyncProviderKind } from '@shared/sync'
import { createLogger } from '../core/logger'

const log = createLogger('sync-config')

// ── Senkronizasyon yapılandırma deposu ─────────────────────────────────────
// Sağlayıcı seçimi + kimlik bilgileri + kullanıcı seçimi (neler eşitlenecek).
// SIRLAR (GitHub token, WebDAV parolası, sync parolası) vault formatında
// şifreli saklanır — sites.json'daki site parolalarıyla aynı güvence.

interface StoredSyncConfig {
  provider: SyncProviderKind
  include: { sites: boolean; settings: boolean }
  gist: { gistId: string; tokenSecret?: string }
  webdav: { url: string; user: string; passwordSecret?: string }
  /** Sync (uçtan uca şifreleme) parolası — vault ile şifreli. */
  syncPasswordSecret?: string
  /** Açılışta otomatik çek. */
  autoSync?: boolean
  /** Değişiklikte otomatik it (debounce renderer'da). */
  autoPush?: boolean
  lastSyncAt?: string
  lastDirection?: 'push' | 'pull'
  /** En son görülen uzak yük zaman damgası (çakışma tespiti). */
  lastRemoteUpdatedAt?: string
}

const STORE_VERSION = 1

function defaults(): StoredSyncConfig {
  return {
    provider: 'gist',
    include: { sites: true, settings: true },
    gist: { gistId: '' },
    webdav: { url: '', user: '' }
  }
}

class SyncConfigStore {
  private cache: StoredSyncConfig | null = null

  private file(): string {
    return join(app.getPath('userData'), 'sync.json')
  }

  private load(): StoredSyncConfig {
    if (this.cache) return this.cache
    this.cache = readJsonVersioned<StoredSyncConfig>(this.file(), STORE_VERSION, defaults)
    return this.cache
  }

  private save(): void {
    try {
      writeJsonVersioned(this.file(), STORE_VERSION, this.cache ?? defaults())
    } catch (err) {
      log.error('sync.json yazılamadı', String(err))
    }
  }

  /** Renderer görünümü: sırlar yalnızca var/yok olarak döner. */
  toPublic(): SyncConfigPublic {
    const c = this.load()
    return {
      provider: c.provider,
      include: { ...c.include },
      gist: { gistId: c.gist.gistId, hasToken: !!c.gist.tokenSecret },
      webdav: { url: c.webdav.url, user: c.webdav.user, hasPassword: !!c.webdav.passwordSecret },
      hasSyncPassword: !!c.syncPasswordSecret,
      autoSync: !!c.autoSync,
      autoPush: !!c.autoPush,
      lastSyncAt: c.lastSyncAt ?? null,
      lastDirection: c.lastDirection ?? null,
      lastRemoteUpdatedAt: c.lastRemoteUpdatedAt ?? null
    }
  }

  /**
   * Yapılandırmayı günceller. Sır alanları: undefined = mevcut korunur,
   * boş olmayan değer = vault ile şifrelenip yazılır. encryptSecret null
   * dönerse (şifreleme yok) sır KAYDEDİLMEZ — düz metin diske yazılmaz.
   */
  update(input: SyncConfigInput): void {
    const c = this.load()
    c.provider = input.provider
    c.include = { ...input.include }
    c.gist.gistId = input.gist.gistId.trim()
    if (input.gist.token) c.gist.tokenSecret = encryptSecret(input.gist.token) ?? undefined
    c.webdav.url = input.webdav.url.trim()
    c.webdav.user = input.webdav.user
    if (input.webdav.password) {
      c.webdav.passwordSecret = encryptSecret(input.webdav.password) ?? undefined
    }
    if (input.syncPassword) {
      c.syncPasswordSecret = encryptSecret(input.syncPassword) ?? undefined
    }
    if (input.autoSync !== undefined) c.autoSync = input.autoSync
    if (input.autoPush !== undefined) c.autoPush = input.autoPush
    this.save()
  }

  /** Push/pull sonrası son eşitleme bilgisini işler.
   *  remoteUpdatedAt: o an uzağa yazılan / uzaktan görülen yük zaman damgası. */
  markSynced(direction: 'push' | 'pull', remoteUpdatedAt?: string): void {
    const c = this.load()
    c.lastSyncAt = new Date().toISOString()
    c.lastDirection = direction
    if (remoteUpdatedAt) c.lastRemoteUpdatedAt = remoteUpdatedAt
    this.save()
  }

  /** Gist ilk push'ta oluşturulunca dönen kimliği kalıcılaştırır. */
  setGistId(id: string): void {
    const c = this.load()
    c.gist.gistId = id
    this.save()
  }

  // ── Motorun ihtiyaç duyduğu çözülmüş değerler (renderer'a asla dönmez) ──

  provider(): SyncProviderKind {
    return this.load().provider
  }

  include(): { sites: boolean; settings: boolean } {
    return { ...this.load().include }
  }

  syncPassword(): string {
    const s = this.load().syncPasswordSecret
    return s ? decryptSecret(s) : ''
  }

  gistCredentials(): { gistId: string; token: string } {
    const c = this.load()
    return {
      gistId: c.gist.gistId,
      token: c.gist.tokenSecret ? decryptSecret(c.gist.tokenSecret) : ''
    }
  }

  webdavCredentials(): { url: string; user: string; password: string } {
    const c = this.load()
    return {
      url: c.webdav.url,
      user: c.webdav.user,
      password: c.webdav.passwordSecret ? decryptSecret(c.webdav.passwordSecret) : ''
    }
  }
}

export const syncConfigStore = new SyncConfigStore()
