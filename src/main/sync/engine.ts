import { FerroError } from '@shared/errors'
import type { SyncBlobFile, SyncPayload, SyncPeekResult, SyncSettingsSnapshot } from '@shared/sync'
import { syncConfigStore } from '../store/syncConfig'
import { siteStore } from '../store/sites'
import { sitesImportFile } from '../ipc/validation'
import { encryptSyncPayload, decryptSyncPayload } from './crypto'
import { GistProvider, WebdavProvider, type SyncProvider } from './providers'
import { createLogger } from '../core/logger'

const log = createLogger('sync')

// ── Senkronizasyon motoru ──────────────────────────────────────────────────
// push: yerel veriyi (kullanıcı seçimine göre siteler + ayarlar) tek yükte
// toplar, sync parolasıyla şifreler ve sağlayıcıya yükler.
// pull: uzaktaki şifreli blob'u indirir, çözer; siteleri birleştirir
// (yinelenenler atlanır), ayarları renderer'a uygulanmak üzere döndürür.

function buildProvider(): SyncProvider {
  if (syncConfigStore.provider() === 'gist') {
    const { token, gistId } = syncConfigStore.gistCredentials()
    return new GistProvider(token, gistId)
  }
  const { url, user, password } = syncConfigStore.webdavCredentials()
  return new WebdavProvider(url, user, password)
}

function requireSyncPassword(): string {
  const password = syncConfigStore.syncPassword()
  if (!password) {
    throw new FerroError(
      'VALIDATION',
      'Sync parolası ayarlanmamış — Ayarlar → Senkronizasyon bölümünden belirleyin'
    )
  }
  return password
}

/**
 * Uzaktan gelen ayarlar anlık görüntüsünü süzer: yalnızca ferro.* anahtarlı
 * string değerler geçer. Blob bizim şifremizle imzalı olsa da içerik, başka
 * bir cihazın yazdığı veridir — renderer'a süzülmeden verilmez.
 */
function sanitizeSettings(raw: unknown): SyncSettingsSnapshot | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const out: SyncSettingsSnapshot = {}
  let count = 0
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k.startsWith('ferro.') || k.length > 64 || typeof v !== 'string') continue
    if (v.length > 200_000 || ++count > 100) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

export interface PushResult {
  updatedAt: string
  bytes: number
  sites: number
  settings: boolean
}

export async function syncPush(settings?: SyncSettingsSnapshot): Promise<PushResult> {
  const password = requireSyncPassword()
  const include = syncConfigStore.include()

  const payload: SyncPayload = {
    kind: 'ferro-sync-payload',
    version: 1,
    updatedAt: new Date().toISOString(),
    // Site parolaları DÜZ METİN olarak yüke girer — yük bir bütün olarak
    // cihazdan çıkmadan şifrelenir; uzak depo yalnızca şifreli blob'u görür.
    sites: include.sites ? siteStore.exportSites(true) : undefined,
    settings: include.settings ? settings : undefined
  }
  if (!payload.sites && !payload.settings) {
    throw new FerroError('VALIDATION', 'Eşitlenecek veri seçilmedi (siteler ve/veya ayarlar)')
  }

  const blob = encryptSyncPayload(payload, password)
  const content = JSON.stringify(blob, null, 2)
  const provider = buildProvider()
  const result = await provider.upload(content)
  if (result?.gistId) syncConfigStore.setGistId(result.gistId)
  syncConfigStore.markSynced('push', payload.updatedAt)
  log.info(
    `push tamam: ${payload.sites?.length ?? 0} site, ayarlar=${!!payload.settings}, ${content.length} bayt`
  )
  return {
    updatedAt: payload.updatedAt,
    bytes: content.length,
    sites: payload.sites?.length ?? 0,
    settings: !!payload.settings
  }
}

export interface PullResult {
  found: boolean
  updatedAt?: string
  sites?: { imported: number; skipped: number; total: number }
  settings?: SyncSettingsSnapshot
}

export async function syncPull(): Promise<PullResult> {
  const password = requireSyncPassword()
  const include = syncConfigStore.include()

  const provider = buildProvider()
  const content = await provider.download()
  if (content === null) return { found: false } // uzak kopya henüz yok

  let blob: SyncBlobFile
  try {
    blob = JSON.parse(content) as SyncBlobFile
  } catch (err) {
    throw new FerroError('VALIDATION', 'Uzak sync dosyası geçerli JSON değil', String(err))
  }
  const payload = decryptSyncPayload(blob, password)

  const result: PullResult = { found: true, updatedAt: payload.updatedAt }
  // Kullanıcı seçimi iki yönde de geçerlidir: yerelde kapalı kategori,
  // uzak yükte bulunsa bile uygulanmaz.
  if (include.sites && Array.isArray(payload.sites)) {
    // Uzak yük başka bir cihazın yazdığı veridir — site kayıtları, dosyadan
    // içe aktarma ile aynı zod sınırlarından geçmeden depoya girmez.
    const parsed = sitesImportFile.safeParse(payload.sites)
    if (!parsed.success) {
      throw new FerroError('VALIDATION', 'Uzak sync yükündeki site kayıtları geçersiz')
    }
    const entries = Array.isArray(parsed.data) ? parsed.data : parsed.data.sites
    const { imported, skipped } = siteStore.importSites(entries)
    result.sites = { imported, skipped, total: entries.length }
  }
  if (include.settings) result.settings = sanitizeSettings(payload.settings)
  syncConfigStore.markSynced('pull', payload.updatedAt)
  log.info(
    `pull tamam: site=${result.sites ? `${result.sites.imported}/${result.sites.total}` : '—'}, ayarlar=${!!result.settings}`
  )
  return result
}

/**
 * Uzak yükü indirir/çözer ama İÇE AKTARMAZ — yalnızca zaman damgasını döndürür.
 * Çakışma/bayatlık tespiti için: renderer bunu lastRemoteUpdatedAt ile
 * karşılaştırır. found=false → uzak kopya henüz yok.
 */
export async function syncPeek(): Promise<SyncPeekResult> {
  const password = requireSyncPassword()
  const provider = buildProvider()
  const content = await provider.download()
  if (content === null) return { found: false, updatedAt: null }
  let blob: SyncBlobFile
  try {
    blob = JSON.parse(content) as SyncBlobFile
  } catch (err) {
    throw new FerroError('VALIDATION', 'Uzak sync dosyası geçerli JSON değil', String(err))
  }
  const payload = decryptSyncPayload(blob, password)
  return { found: true, updatedAt: payload.updatedAt }
}
