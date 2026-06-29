import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { encryptSecret, decryptSecret } from './vault'
import type { ConnectionConfig, SavedSite, SiteInput } from '@shared/transfer'
import { createLogger } from '../core/logger'

const log = createLogger('sites')

interface StoredSite {
  id: string
  name: string
  folder?: string
  protocol: SavedSite['protocol']
  host: string
  port: number
  user: string
  anonymous?: boolean
  encoding?: string
  rejectUnauthorized?: boolean
  /** Şifrelenmiş parola (vault formatı). */
  secret?: string
}

class SiteStore {
  private cache: StoredSite[] | null = null

  private file(): string {
    return join(app.getPath('userData'), 'sites.json')
  }

  private load(): StoredSite[] {
    if (this.cache) return this.cache
    try {
      this.cache = JSON.parse(readFileSync(this.file(), 'utf8')) as StoredSite[]
    } catch {
      this.cache = []
    }
    return this.cache
  }

  private save(): void {
    try {
      const path = this.file()
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, JSON.stringify(this.cache ?? [], null, 2), 'utf8')
    } catch (err) {
      log.error('sites.json yazılamadı', String(err))
    }
  }

  private toPublic(s: StoredSite): SavedSite {
    return {
      id: s.id,
      name: s.name,
      folder: s.folder,
      protocol: s.protocol,
      host: s.host,
      port: s.port,
      user: s.user,
      anonymous: s.anonymous,
      encoding: s.encoding,
      rejectUnauthorized: s.rejectUnauthorized,
      hasPassword: !!s.secret
    }
  }

  list(): SavedSite[] {
    return this.load()
      .map((s) => this.toPublic(s))
      .sort((a, b) => (a.folder ?? '').localeCompare(b.folder ?? '') || a.name.localeCompare(b.name))
  }

  upsert(input: SiteInput): string {
    const store = this.load()
    const existing = input.id ? store.find((s) => s.id === input.id) : undefined
    const id = existing?.id ?? randomUUID()

    // Parola: yeni verildiyse şifrele; verilmediyse mevcut korunur.
    let secret = existing?.secret
    if (input.password !== undefined && input.password !== '') {
      secret = encryptSecret(input.password)
    } else if (input.password === '' && existing) {
      secret = undefined // boş parola → temizle
    }

    const record: StoredSite = {
      id,
      name: input.name,
      folder: input.folder || undefined,
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      user: input.user,
      anonymous: input.anonymous,
      encoding: input.encoding,
      rejectUnauthorized: input.rejectUnauthorized,
      secret
    }

    if (existing) store[store.indexOf(existing)] = record
    else store.push(record)
    this.save()
    return id
  }

  remove(id: string): void {
    this.cache = this.load().filter((s) => s.id !== id)
    this.save()
  }

  /** Bağlanmak için tam config (parola çözülmüş) üretir. */
  buildConfig(id: string): ConnectionConfig | null {
    const s = this.load().find((x) => x.id === id)
    if (!s) return null
    return {
      protocol: s.protocol,
      host: s.host,
      port: s.port,
      user: s.user,
      password: s.secret ? decryptSecret(s.secret) : undefined,
      anonymous: s.anonymous,
      encoding: s.encoding,
      rejectUnauthorized: s.rejectUnauthorized
    }
  }
}

export const siteStore = new SiteStore()
