import { homedir } from 'os'
import { readdir, stat, mkdir, rename, rm } from 'fs/promises'
import { join } from 'path'
import { registerHandler } from '../router'
import { FerroError } from '@shared/errors'
import type { LocalEntry, EntryType } from '@shared/transfer'

export function registerLocalHandlers(): void {
  registerHandler('local:home', () => ({ path: homedir() }))

  registerHandler('local:list', async ({ path }) => {
    let dirents
    try {
      dirents = await readdir(path, { withFileTypes: true })
    } catch (err) {
      throw new FerroError('FS_ERROR', `Yerel dizin okunamadı: ${path}`, String(err))
    }

    const entries: LocalEntry[] = []
    for (const d of dirents) {
      const full = join(path, d.name)
      let type: EntryType = d.isDirectory()
        ? 'directory'
        : d.isSymbolicLink()
          ? 'symlink'
          : d.isFile()
            ? 'file'
            : 'unknown'
      let size = 0
      let modifiedAt: number | null = null
      try {
        const s = await stat(full)
        size = s.size
        modifiedAt = s.mtimeMs
        if (type === 'symlink' && s.isDirectory()) type = 'directory'
      } catch {
        // erişilemeyen girdileri atla (boyut/tarih olmadan göster)
      }
      entries.push({ name: d.name, type, size, modifiedAt, path: full })
    }
    return { path, entries }
  })

  registerHandler('local:mkdir', async ({ path }) => {
    await mkdir(path, { recursive: false })
    return { ok: true as const }
  })

  registerHandler('local:delete', async ({ path }) => {
    await rm(path, { recursive: true, force: false })
    return { ok: true as const }
  })

  registerHandler('local:rename', async ({ from, to }) => {
    await rename(from, to)
    return { ok: true as const }
  })
}
