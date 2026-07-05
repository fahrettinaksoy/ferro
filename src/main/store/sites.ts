import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { readJsonVersioned, writeJsonVersioned } from './jsonStore'
import { encryptSecret, decryptSecret } from './vault'
import { defaultPort } from '@shared/transfer'
import type {
  ConnectionConfig,
  Protocol,
  SavedSite,
  SiteAdvanced,
  SiteExportEntry,
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
  /** Parola kaydedilmez; her bağlanışta sorulur. */
  askPassword?: boolean
  encoding?: string
  rejectUnauthorized?: boolean
  /** Şifrelenmiş parola (vault formatı). */
  secret?: string
}

/** sites.json şema sürümü ({version, data} zarfı). */
const STORE_VERSION = 1

class SiteStore {
  private cache: StoredSite[] | null = null

  private file(): string {
    return join(app.getPath('userData'), 'sites.json')
  }

  private load(): StoredSite[] {
    if (this.cache) return this.cache
    this.cache = readJsonVersioned<StoredSite[]>(
      this.file(),
      STORE_VERSION,
      // Dosya yok → ilk açılış: sites.seed.json'dan tohumla.
      () => this.seed(),
      {
        // Zarf öncesi eski format: çıplak dizi.
        legacy: (parsed) => (Array.isArray(parsed) ? (parsed as StoredSite[]) : null),
        // Bozulma: dosya .corrupt olarak karantinaya alındı; kullanıcı verisinin
        // üzerine demo seed'i YAZMA — boş başla, kayıt kurtarılabilir kalsın.
        onCorrupt: () => []
      }
    )
    return this.cache
  }

  /**
   * sites.seed.json'u arar (dev + paketlenmiş build). seed/ alt klasörü önceliklidir.
   * Bilinçli olarak yalnızca uygulamaya ait kökler taranır (resourcesPath + appPath);
   * process.cwd() taranmaz — paketli uygulama, başlatıldığı dizindeki rastgele bir
   * seed dosyasını içe aktarmamalıdır.
   */
  private seedFile(): string | null {
    const rel = ['seed/sites.seed.json', 'sites.seed.json']
    const roots = [process.resourcesPath ?? '', app.getAppPath(), join(app.getAppPath(), '..')]
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
        secret: s.secret ?? (s.password ? (encryptSecret(s.password) ?? undefined) : undefined)
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
      writeJsonVersioned(this.file(), STORE_VERSION, this.cache ?? [])
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
      askPassword: s.askPassword,
      encoding: s.encoding,
      rejectUnauthorized: s.rejectUnauthorized,
      hasPassword: !!s.secret,
      ...pickAdvanced(s)
    }
  }

  list(): SavedSite[] {
    return this.load()
      .map((s) => this.toPublic(s))
      .sort(
        (a, b) => (a.folder ?? '').localeCompare(b.folder ?? '') || a.name.localeCompare(b.name)
      )
  }

  upsert(input: SiteInput): string {
    const store = this.load()
    const existing = input.id ? store.find((s) => s.id === input.id) : undefined
    const id = existing?.id ?? randomUUID()

    // Parola: yeni verildiyse şifrele; verilmediyse mevcut korunur.
    // encryptSecret null dönerse (safeStorage yok) parola KALICI KAYDEDİLMEZ —
    // düz metin/base64 diske asla yazılmaz; kullanıcı bağlanırken parola girer.
    let secret = existing?.secret
    if (input.password !== undefined && input.password !== '') {
      secret = encryptSecret(input.password) ?? undefined
    } else if (input.password === '' && existing) {
      secret = undefined // boş parola → temizle
    }
    // "Parola sorulsun": parola asla saklanmaz.
    if (input.askPassword) secret = undefined

    const record: StoredSite = {
      id,
      name: input.name,
      folder: input.folder || undefined,
      protocol: input.protocol,
      host: input.host,
      port: input.port,
      user: input.user,
      anonymous: input.anonymous,
      askPassword: input.askPassword,
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

  /** Tüm site parolalarını düz metin olarak çözer (vault mod geçişi için).
   *  Yalnızca vault kilitli değilken anlamlı çalışır. */
  exportSecrets(): { id: string; plain: string }[] {
    return this.load()
      .filter((s) => s.secret)
      .map((s) => ({ id: s.id, plain: decryptSecret(s.secret as string) }))
      .filter((x) => x.plain !== '')
  }

  /** Verilen düz metin parolaları güncel vault şemasıyla yeniden şifreleyip yazar. */
  importSecrets(items: { id: string; plain: string }[]): void {
    const store = this.load()
    for (const { id, plain } of items) {
      const s = store.find((x) => x.id === id)
      if (!s) continue
      const enc = encryptSecret(plain)
      if (enc) s.secret = enc
    }
    this.save()
  }

  /**
   * Tüm siteleri dışa aktarma formatına dönüştürür (id'siz — hedefte yeni id üretilir).
   * includePasswords true ise parolalar DÜZ METİN çözülür; vault kilitliyse ya da
   * çözüm başarısızsa ilgili site parolasız aktarılır (hata fırlatılmaz).
   */
  exportSites(includePasswords: boolean): SiteExportEntry[] {
    return this.load().map((s) => {
      const entry: SiteExportEntry = {
        name: s.name,
        folder: s.folder,
        protocol: s.protocol,
        host: s.host,
        port: s.port,
        user: s.user,
        anonymous: s.anonymous,
        askPassword: s.askPassword,
        encoding: s.encoding,
        rejectUnauthorized: s.rejectUnauthorized,
        ...pickAdvanced(s)
      }
      if (includePasswords && s.secret) {
        const plain = decryptSecret(s.secret)
        if (plain) entry.password = plain
      }
      return entry
    })
  }

  /**
   * Verilen id'lere karşılık gelen siteleri dışa aktarma formatına çevirir
   * (ekiple paylaşım için). Parolalar DÜZ METİN çözülür (vault kilitliyse ilgili
   * site parolasız gider). folderOverride verilirse tüm kayıtların folder alanı
   * onunla değiştirilir — ekip siteleri hedefte ekip adıyla gruplanır.
   */
  exportSitesByIds(ids: string[], folderOverride?: string): SiteExportEntry[] {
    const wanted = new Set(ids)
    return this.load()
      .filter((s) => wanted.has(s.id))
      .map((s) => {
        const entry: SiteExportEntry = {
          name: s.name,
          folder: folderOverride !== undefined ? folderOverride || undefined : s.folder,
          protocol: s.protocol,
          host: s.host,
          port: s.port,
          user: s.user,
          anonymous: s.anonymous,
          askPassword: s.askPassword,
          encoding: s.encoding,
          rejectUnauthorized: s.rejectUnauthorized,
          ...pickAdvanced(s)
        }
        if (s.secret) {
          const plain = decryptSecret(s.secret)
          if (plain) entry.password = plain
        }
        return entry
      })
  }

  /**
   * Dışa aktarma kayıtlarını içe aktarır. Yinelenenler atlanır: mevcut bir
   * siteyle protokol+host+port+kullanıcı+ad beşlisi aynıysa kayıt eklenmez
   * (host büyük/küçük harf duyarsız). Her yeni kayda taze id üretilir; düz
   * metin parolalar vault ile şifrelenir ("parola sorulsun" işaretliyse
   * parola yok sayılır — mevcut upsert kuralıyla tutarlı).
   */
  importSites(entries: SiteExportEntry[]): { imported: number; skipped: number } {
    const store = this.load()
    const key = (s: Pick<StoredSite, 'protocol' | 'host' | 'port' | 'user' | 'name'>): string =>
      [s.protocol, s.host.toLowerCase(), s.port, s.user, s.name].join(' ')
    const seen = new Set(store.map(key))
    let imported = 0
    let skipped = 0
    for (const e of entries) {
      const k = key(e)
      if (seen.has(k)) {
        skipped++
        continue
      }
      seen.add(k)
      store.push({
        id: randomUUID(),
        name: e.name,
        folder: e.folder || undefined,
        protocol: e.protocol,
        host: e.host,
        port: e.port,
        user: e.user,
        anonymous: e.anonymous,
        askPassword: e.askPassword,
        encoding: e.encoding,
        rejectUnauthorized: e.rejectUnauthorized,
        secret: !e.askPassword && e.password ? (encryptSecret(e.password) ?? undefined) : undefined,
        ...pickAdvanced(e)
      })
      imported++
    }
    if (imported) this.save()
    log.info(`site içe aktarımı: ${imported} eklendi, ${skipped} yinelenen atlandı`)
    return { imported, skipped }
  }

  /** Bir grubu (klasörü) yeniden adlandırır: o klasördeki tüm sitelerin folder
   *  alanını günceller. Boş hedef → siteler grupsuz olur. Diğer alanlar (parola,
   *  gelişmiş ayarlar) korunur. Etkilenen site sayısını döndürür. */
  renameGroup(from: string, to: string): number {
    const store = this.load()
    const target = from.trim()
    const next = to.trim() || undefined
    let count = 0
    for (const s of store) {
      if ((s.folder ?? '').trim() === target) {
        s.folder = next
        count++
      }
    }
    if (count) this.save()
    return count
  }

  /** Bağlanmak için tam config (parola çözülmüş) üretir.
   *  passwordOverride: "parola sorulsun" akışında o an girilen parola. */
  buildConfig(id: string, passwordOverride?: string): ConnectionConfig | null {
    const s = this.load().find((x) => x.id === id)
    if (!s) return null
    return {
      protocol: s.protocol,
      host: s.host,
      port: s.port,
      user: s.user,
      password: passwordOverride ?? (s.secret ? decryptSecret(s.secret) : undefined),
      anonymous: s.anonymous,
      encoding: s.encoding,
      rejectUnauthorized: s.rejectUnauthorized,
      // Site ayarı: "bağlantı sayısını sınırla" işaretliyse havuz boyutuna yansır.
      maxConnections: s.limitConnections ? s.maxConnections : undefined
    }
  }
}

export const siteStore = new SiteStore()
