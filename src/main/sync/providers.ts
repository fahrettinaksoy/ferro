import { FerroError } from '@shared/errors'
import { SYNC_FILE_NAME } from '@shared/sync'
import { createLogger } from '../core/logger'

const log = createLogger('sync')

// ── Uzak depo sağlayıcıları ────────────────────────────────────────────────
// Her sağlayıcı yalnızca ŞİFRELİ blob'u taşır; içerik hakkında bilgisi yoktur.
// download() null dönerse uzak dosya henüz yok demektir (ilk eşitleme).

export interface SyncProvider {
  /** Şifreli blob'u yükler. Dönen değer: kalıcılaştırılması gereken yeni durum
   *  (örn. ilk push'ta oluşturulan gist id) — yoksa null. */
  upload(content: string): Promise<{ gistId?: string } | null>
  download(): Promise<string | null>
}

const TIMEOUT_MS = 30_000

/** fetch hatalarını FerroError'a çevirir (ağ hatası → CONNECTION_FAILED). */
async function doFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    throw new FerroError('CONNECTION_FAILED', 'Sync sunucusuna ulaşılamadı', String(err))
  }
}

function authError(res: Response, what: string): FerroError {
  return new FerroError('AUTH_FAILED', `${what} kimlik doğrulaması başarısız (HTTP ${res.status})`)
}

// ── GitHub Gist ────────────────────────────────────────────────────────────

const GIST_API = 'https://api.github.com/gists'

export class GistProvider implements SyncProvider {
  constructor(
    private readonly token: string,
    private readonly gistId: string
  ) {
    if (!token) throw new FerroError('VALIDATION', 'GitHub token ayarlanmamış')
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ferro-sync'
    }
  }

  async upload(content: string): Promise<{ gistId?: string } | null> {
    const body = JSON.stringify({
      description: 'Ferro sync (encrypted)',
      public: false,
      files: { [SYNC_FILE_NAME]: { content } }
    })
    // Gist id yoksa ilk push: gizli gist oluştur, dönen id kalıcılaştırılır.
    const res = this.gistId
      ? await doFetch(`${GIST_API}/${encodeURIComponent(this.gistId)}`, {
          method: 'PATCH',
          headers: this.headers(),
          body
        })
      : await doFetch(GIST_API, { method: 'POST', headers: this.headers(), body })
    if (res.status === 401 || res.status === 403) throw authError(res, 'GitHub')
    if (res.status === 404 && this.gistId) {
      throw new FerroError('NOT_FOUND', 'Gist bulunamadı — kimliği kontrol edin')
    }
    if (!res.ok) {
      throw new FerroError('CONNECTION_FAILED', `Gist yazılamadı (HTTP ${res.status})`)
    }
    if (!this.gistId) {
      const created = (await res.json()) as { id?: string }
      if (created.id) {
        log.info(`sync gist oluşturuldu: ${created.id}`)
        return { gistId: created.id }
      }
    }
    return null
  }

  async download(): Promise<string | null> {
    if (!this.gistId) return null // ilk eşitleme: uzak kopya henüz yok
    const res = await doFetch(`${GIST_API}/${encodeURIComponent(this.gistId)}`, {
      headers: this.headers()
    })
    if (res.status === 404) return null
    if (res.status === 401 || res.status === 403) throw authError(res, 'GitHub')
    if (!res.ok) {
      throw new FerroError('CONNECTION_FAILED', `Gist okunamadı (HTTP ${res.status})`)
    }
    const gist = (await res.json()) as {
      files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>
    }
    const file = gist.files?.[SYNC_FILE_NAME]
    if (!file) return null
    // 1 MiB üstü içerikte API content'i kırpar — ham URL'den çekilir.
    if (file.truncated && file.raw_url) {
      const raw = await doFetch(file.raw_url, { headers: this.headers() })
      if (!raw.ok) {
        throw new FerroError('CONNECTION_FAILED', `Gist içeriği okunamadı (HTTP ${raw.status})`)
      }
      return raw.text()
    }
    return file.content ?? null
  }
}

// ── WebDAV ─────────────────────────────────────────────────────────────────

export class WebdavProvider implements SyncProvider {
  constructor(
    private readonly url: string,
    private readonly user: string,
    private readonly password: string
  ) {
    if (!url) throw new FerroError('VALIDATION', 'WebDAV adresi ayarlanmamış')
  }

  /** Yapılandırılan klasör adresi + sabit dosya adı. */
  private fileUrl(): string {
    return `${this.url.replace(/\/+$/, '')}/${SYNC_FILE_NAME}`
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {}
    if (this.user || this.password) {
      h.Authorization =
        'Basic ' + Buffer.from(`${this.user}:${this.password}`, 'utf8').toString('base64')
    }
    return h
  }

  async upload(content: string): Promise<{ gistId?: string } | null> {
    const put = (): Promise<Response> =>
      doFetch(this.fileUrl(), {
        method: 'PUT',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: content
      })
    let res = await put()
    // 409: üst koleksiyon yok — bir kez MKCOL ile oluşturmayı dene.
    if (res.status === 409) {
      await doFetch(this.url.replace(/\/+$/, ''), { method: 'MKCOL', headers: this.headers() })
      res = await put()
    }
    if (res.status === 401 || res.status === 403) throw authError(res, 'WebDAV')
    if (!res.ok) {
      throw new FerroError('CONNECTION_FAILED', `WebDAV'a yazılamadı (HTTP ${res.status})`)
    }
    return null
  }

  async download(): Promise<string | null> {
    const res = await doFetch(this.fileUrl(), { headers: this.headers() })
    if (res.status === 404) return null
    if (res.status === 401 || res.status === 403) throw authError(res, 'WebDAV')
    if (!res.ok) {
      throw new FerroError('CONNECTION_FAILED', `WebDAV'dan okunamadı (HTTP ${res.status})`)
    }
    return res.text()
  }
}
