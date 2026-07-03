import { app } from 'electron'
import { join } from 'path'
import { readJsonVersioned, writeJsonVersioned } from './jsonStore'
import { createLogger } from '../core/logger'

const log = createLogger('knownHosts')

// host:port → sha256 parmak izi. userData altında sürümlü + atomik saklanır.
// Bozulma durumunda dosya .corrupt olarak karantinaya alınır ve depo boş açılır;
// böylece güvenilen anahtarlar sessizce yeni bir TOFU turuna indirgenmez,
// kayıt kurtarılabilir kalır.
type Store = Record<string, string>

const STORE_VERSION = 1

function isLegacyStore(v: unknown): v is Store {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every((x) => typeof x === 'string')
  )
}

class KnownHosts {
  private cache: Store | null = null

  private file(): string {
    return join(app.getPath('userData'), 'known_hosts.json')
  }

  private load(): Store {
    if (this.cache) return this.cache
    this.cache = readJsonVersioned<Store>(this.file(), STORE_VERSION, () => ({}), {
      legacy: (parsed) => (isLegacyStore(parsed) ? parsed : null)
    })
    return this.cache
  }

  private save(): void {
    try {
      writeJsonVersioned(this.file(), STORE_VERSION, this.cache ?? {})
    } catch (err) {
      log.warn('known_hosts yazılamadı', String(err))
    }
  }

  private key(host: string, port: number): string {
    return `${host}:${port}`
  }

  get(host: string, port: number): string | null {
    return this.load()[this.key(host, port)] ?? null
  }

  set(host: string, port: number, fingerprint: string): void {
    const store = this.load()
    store[this.key(host, port)] = fingerprint
    this.save()
  }
}

export const knownHosts = new KnownHosts()
