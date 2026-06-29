import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { createLogger } from '../core/logger'

const log = createLogger('knownHosts')

// host:port → sha256 parmak izi. userData altında kalıcı saklanır.
type Store = Record<string, string>

class KnownHosts {
  private cache: Store | null = null

  private file(): string {
    return join(app.getPath('userData'), 'known_hosts.json')
  }

  private load(): Store {
    if (this.cache) return this.cache
    try {
      this.cache = JSON.parse(readFileSync(this.file(), 'utf8')) as Store
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  private save(): void {
    try {
      const path = this.file()
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, JSON.stringify(this.cache ?? {}, null, 2), 'utf8')
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
