import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { encryptSecret, decryptSecret } from './vault'
import { defaultPort } from '@shared/transfer'
import type {
  ConnectionConfig,
  Protocol,
  SavedSite,
  SiteAdvanced,
  SiteInput
} from '@shared/transfer'
import { createLogger } from '../core/logger'

const log = createLogger('sites')

/** Gelişmiş sekme alanlarının anahtarları — kayıt ↔ public eşlemesinde kullanılır. */
const ADVANCED_KEYS: (keyof SiteAdvanced)[] = [
  'comment',
  'colorLabel',
  'serverType',
  'bypassProxy',
  'localDir',
  'remoteDir',
  'syncBrowsing',
  'dirComparison',
  'timezoneHours',
  'timezoneMinutes',
  'transferMode',
  'limitConnections',
  'maxConnections'
]

/** Bir nesneden yalnızca tanımlı gelişmiş alanları seçer. */
function pickAdvanced(src: SiteAdvanced): SiteAdvanced {
  const out: SiteAdvanced = {}
  for (const k of ADVANCED_KEYS) {
    const v = src[k]
    if (v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v
  }
  return out
}

/**
 * sites.seed.json içindeki tek bir tohum kaydı. İki format desteklenir:
 *  - Düz metin: `password` verilir, içe aktarırken şifrelenir.
 *  - Hazır depo: `secret` (vault formatı, p0:/v1:) ve opsiyonel `id` verilir, aynen kullanılır.
 */
interface SeedSite {
  id?: string
  name: string
  folder?: string
  protocol: Protocol
  host: string
  port?: number
  user?: string
  password?: string
  secret?: string
  anonymous?: boolean
  encoding?: string
  rejectUnauthorized?: boolean
}

interface StoredSite extends SiteAdvanced {
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
      // sites.json yok/bozuk → ilk açılışta sites.seed.json'dan tohumla.
      this.cache = this.seed()
    }
    return this.cache
  }

  /** sites.seed.json'u arar (dev + paketlenmiş build). seed/ alt klasörü önceliklidir. */
  private seedFile(): string | null {
    const rel = ['seed/sites.seed.json', 'sites.seed.json']
    const roots = [process.resourcesPath ?? '', app.getAppPath(), join(app.getAppPath(), '..'), process.cwd()]
    const candidates = roots.flatMap((r) => rel.map((f) => (r ? join(r, f) : '')))
    return candidates.find((p) => p && existsSync(p)) ?? null
  }

  /**
   * sites.seed.json'daki kayıtları içe aktarır ve sites.json'a yazar.
   * Parola düz metin (`password`) ise şifreler; hazır `secret` verilmişse aynen
   * kullanır. `id` verilmişse korunur, yoksa üretilir. Dosya yoksa boş liste döner.
   */
  private seed(): StoredSite[] {
    const path = this.seedFile()
    if (!path) return []
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as SeedSite[]
      if (!Array.isArray(raw)) return []
      const records: StoredSite[] = raw.map((s) => ({
        id: s.id ?? randomUUID(),
        name: s.name,
        folder: s.folder || undefined,
        protocol: s.protocol,
        host: s.host,
        port: s.port ?? defaultPort(s.protocol),
        user: s.user ?? (s.anonymous ? 'anonymous' : ''),
        anonymous: s.anonymous,
        encoding: s.encoding,
        rejectUnauthorized: s.rejectUnauthorized,
        secret: s.secret ?? (s.password ? encryptSecret(s.password) : undefined)
      }))
      this.cache = records
      this.save()
      log.info(`${records.length} site ${path}'dan tohumlandı`)
      return records
    } catch (err) {
      log.error('sites.seed.json okunamadı', String(err))
      return []
    }
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
      hasPassword: !!s.secret,
      ...pickAdvanced(s)
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
      secret,
      ...pickAdvanced(input)
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
