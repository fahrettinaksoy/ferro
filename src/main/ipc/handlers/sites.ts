import { dialog, BrowserWindow } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'fs'
import { registerHandler } from '../router'
import { sitesImportFile } from '../validation'
import { siteStore } from '../../store/sites'
import { encryptionAvailable } from '../../store/vault'
import { sessionManager } from '../../transfer/SessionManager'
import { FerroError } from '@shared/errors'
import type { SitesExportFile } from '@shared/transfer'

/** İçe aktarılacak dosya için üst sınır — sites.json tipik olarak KB mertebesindedir. */
const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export function registerSiteHandlers(): void {
  registerHandler('sites:list', () => ({
    sites: siteStore.list(),
    encryptionAvailable: encryptionAvailable()
  }))

  registerHandler('sites:save', (input) => ({ id: siteStore.upsert(input) }))

  registerHandler('sites:delete', ({ id }) => {
    siteStore.remove(id)
    return { ok: true as const }
  })

  registerHandler('sites:renameGroup', ({ from, to }) => ({
    ok: true as const,
    count: siteStore.renameGroup(from, to)
  }))

  registerHandler('sites:connect', async ({ id, password }, ctx) => {
    const config = siteStore.buildConfig(id, password)
    if (!config) throw new FerroError('VALIDATION', 'Site bulunamadı')
    return sessionManager.connect(config, ctx.sender)
  })

  // Dışa aktar: kaydetme diyaloğu → sürümlü JSON zarfı yaz.
  // Parolalar yalnızca kullanıcı açıkça isterse ve DÜZ METİN olarak yazılır;
  // uyarı/onay renderer'daki dışa aktarma diyaloğunda alınır.
  registerHandler('sites:export', async ({ includePasswords }, ctx) => {
    const win = BrowserWindow.fromWebContents(ctx.sender) ?? undefined
    const opts: Electron.SaveDialogOptions = {
      defaultPath: `ferro-sites-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const res = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts))
    if (res.canceled || !res.filePath) return { path: null, count: 0 }

    const sites = siteStore.exportSites(includePasswords)
    const file: SitesExportFile = {
      app: 'ferro',
      kind: 'sites',
      version: 1,
      exportedAt: new Date().toISOString(),
      sites
    }
    try {
      writeFileSync(res.filePath, JSON.stringify(file, null, 2) + '\n', 'utf8')
    } catch (err) {
      throw new FerroError('VALIDATION', 'Dışa aktarma dosyası yazılamadı', String(err))
    }
    return { path: res.filePath, count: sites.length }
  })

  // İçe aktar: açma diyaloğu → JSON oku → şemayla doğrula → yinelenenleri
  // atlayarak birleştir. Dosya içeriği güvensiz girdi sayılır ve renderer
  // yükleriyle aynı zod sınırlarından geçer.
  registerHandler('sites:import', async (_p, ctx) => {
    const win = BrowserWindow.fromWebContents(ctx.sender) ?? undefined
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const res = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
    const path = res.canceled ? null : (res.filePaths[0] ?? null)
    if (!path) return { path: null, imported: 0, skipped: 0, total: 0 }

    let parsed: unknown
    try {
      if (statSync(path).size > MAX_IMPORT_BYTES) {
        throw new Error(`dosya çok büyük (>${MAX_IMPORT_BYTES / 1024 / 1024} MiB)`)
      }
      parsed = JSON.parse(readFileSync(path, 'utf8'))
    } catch (err) {
      throw new FerroError('VALIDATION', 'Dosya okunamadı ya da geçerli JSON değil', String(err))
    }

    const result = sitesImportFile.safeParse(parsed)
    if (!result.success) {
      const detail = result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(kök)'}: ${i.message}`)
        .join('; ')
      throw new FerroError('VALIDATION', 'Dosya geçerli bir site dışa aktarımı değil', detail)
    }

    const entries = Array.isArray(result.data) ? result.data : result.data.sites
    const { imported, skipped } = siteStore.importSites(entries)
    return { path, imported, skipped, total: entries.length }
  })
}
