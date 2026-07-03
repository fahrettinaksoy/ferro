import SftpClient from 'ssh2-sftp-client'
import type { HostFingerprintVerifier } from 'ssh2'
import { PassThrough, type Writable, type Readable } from 'stream'
import { posix } from 'path'
import type { IFileTransferClient, TransferOptions, AdapterOptions } from '../IFileTransferClient'
import type { ConnectionConfig, RemoteEntry, EntryType } from '@shared/transfer'
import { FerroError, type FerroErrorCode } from '@shared/errors'
import { connectViaProxy } from '../proxy'
import { createLogger } from '../../core/logger'

const log = createLogger('sftp')

type SftpFileInfo = Awaited<ReturnType<SftpClient['list']>>[number]

function mapType(t: SftpFileInfo['type']): EntryType {
  switch (t) {
    case '-':
      return 'file'
    case 'd':
      return 'directory'
    case 'l':
      return 'symlink'
    default:
      return 'unknown'
  }
}

/** 'rwx' biçimli izin string'ini octal haneye çevirir. */
function rwxToDigit(s: string): number {
  let v = 0
  if (s[0] === 'r') v += 4
  if (s[1] === 'w') v += 2
  if (s[2] === 'x' || s[2] === 's' || s[2] === 't') v += 1
  return v
}

function mapEntry(info: SftpFileInfo): RemoteEntry {
  const r = info.rights
  const permissions =
    r && r.user !== undefined
      ? (rwxToDigit(r.user) << 6) | (rwxToDigit(r.group) << 3) | rwxToDigit(r.other)
      : null
  return {
    name: info.name,
    type: mapType(info.type),
    size: info.size,
    modifiedAt: info.modifyTime ?? null,
    permissions,
    // SFTP yalnızca sayısal uid/gid verir (isim çözümü protokolde yok).
    owner: info.owner != null ? String(info.owner) : null,
    group: info.group != null ? String(info.group) : null
  }
}

/** SFTP adaptörü — ssh2-sftp-client tabanlı. Aynı IFileTransferClient sözleşmesi arkasında. */
/** Parmak izini doğrular; true → güven, false → reddet. */
export type HostVerify = (fingerprint: string) => Promise<boolean>

export class SftpAdapter implements IFileTransferClient {
  private client = new SftpClient()
  private _connected = false
  private _cwd = '/'
  // Resume: indirmede readStreamOptions.start (offset), yüklemede append ('a') ile.
  readonly supportsResume = true

  constructor(
    private readonly config: ConnectionConfig,
    private readonly hostVerify?: HostVerify,
    private readonly options: AdapterOptions = {}
  ) {}

  get connected(): boolean {
    return this._connected
  }

  async connect(): Promise<void> {
    try {
      // Vekil sunucu ayarlıysa hedefe proxy üzerinden soket kur ve ssh2'ye ver.
      const proxy = this.options.proxy
      const sock = proxy
        ? await connectViaProxy(proxy, this.config.host, this.config.port)
        : undefined
      const timeout = this.options.connectTimeoutMs ?? 30_000
      await this.client.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.user,
        password: this.config.password,
        privateKey: this.config.privateKey,
        passphrase: this.config.passphrase,
        ...(sock ? { sock } : {}),
        readyTimeout: timeout,
        // Keep-alive: ssh2 yerleşik (boşta zaman aşımını önler).
        keepaliveInterval: 20_000,
        keepaliveCountMax: 3,
        // TOFU host key doğrulaması (sha256 parmak izi). hostVerify verilmezse kabul edilir.
        hostHash: 'sha256',
        // hostHash ayarlıyken ssh2 fingerprint string'i geçer; tipler bunu tam modellemediği
        // için cast ediyoruz. Callback formu (length===2) async kullanılır, dönüş değeri yok sayılır.
        hostVerifier: ((fingerprint: string, cb: (valid: boolean) => void): void => {
          log.info(`host key parmak izi: SHA256:${fingerprint}`)
          const verify = this.hostVerify ?? ((): Promise<boolean> => Promise.resolve(true))
          verify(`SHA256:${fingerprint}`)
            .then((ok) => cb(ok))
            .catch(() => cb(false))
        }) as unknown as HostFingerprintVerifier
      })
      this._connected = true
      this._cwd = await this.client.cwd().catch(() => '/')
      log.info(`bağlandı: ${this.config.host}:${this.config.port}`)
    } catch (err) {
      throw this.translate(err, 'CONNECTION_FAILED', 'SFTP bağlantısı kurulamadı')
    }
  }

  async disconnect(): Promise<void> {
    await this.client.end().catch(() => undefined)
    this._connected = false
  }

  async pwd(): Promise<string> {
    return this._cwd
  }

  async cwd(path: string): Promise<void> {
    const target = this.resolve(path)
    const type = await this.client.exists(target)
    if (type !== 'd') throw new FerroError('FS_ERROR', `Dizin değil: ${target}`)
    this._cwd = target
  }

  async list(path?: string): Promise<RemoteEntry[]> {
    try {
      const items = await this.client.list(this.resolve(path ?? this._cwd))
      return items.map(mapEntry)
    } catch (err) {
      throw this.translate(err, 'FS_ERROR', 'Dizin listelenemedi')
    }
  }

  async stat(path: string): Promise<RemoteEntry> {
    const target = this.resolve(path)
    try {
      const s = await this.client.stat(target)
      return {
        name: posix.basename(target),
        type: s.isDirectory ? 'directory' : s.isSymbolicLink ? 'symlink' : 'file',
        size: s.size,
        modifiedAt: s.modifyTime ?? null,
        permissions: s.mode & 0o777,
        owner: s.uid != null ? String(s.uid) : null,
        group: s.gid != null ? String(s.gid) : null
      }
    } catch (err) {
      throw this.translate(err, 'FS_ERROR', `Bilgi alınamadı: ${target}`)
    }
  }

  async download(remotePath: string, dest: Writable, opts: TransferOptions = {}): Promise<void> {
    const target = this.resolve(remotePath)
    const total = await this.client
      .stat(target)
      .then((s) => s.size)
      .catch(() => null)
    // Zarif iptal: bağlantıyı öldürmek yerine hedef stream yok edilir; get()
    // hata ile döner, SSH oturumu sağlam kalır (havuz bağlantıyı yeniden kullanır).
    const sink: Writable = opts.onProgress ? this.countingPassThrough(opts, total) : dest
    const onAbort = (): void => {
      sink.destroy(new FerroError('CANCELLED', 'İndirme iptal edildi'))
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      // Resume: ssh2'nin createReadStream'i start (offset) destekler; paketin tip
      // tanımı bu alanı modellemediği için belgeli cast gerekir.
      const options: SftpClient.TransferOptions | undefined =
        opts.startAt && opts.startAt > 0
          ? {
              readStreamOptions: {
                start: opts.startAt
              } as unknown as SftpClient.TransferOptions['readStreamOptions']
            }
          : undefined
      if (sink === dest) {
        await this.client.get(target, dest, options)
      } else {
        const finished = this.streamFinished(dest)
        sink.pipe(dest)
        await this.client.get(target, sink, options)
        await finished
      }
    } catch (err) {
      if (opts.signal?.aborted) throw new FerroError('CANCELLED', 'İndirme iptal edildi')
      throw this.translate(err, 'TRANSFER_FAILED', 'İndirme başarısız')
    } finally {
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  async upload(source: Readable, remotePath: string, opts: TransferOptions = {}): Promise<void> {
    const target = this.resolve(remotePath)
    // Zarif iptal: kaynak stream yok edilir; put() hata ile döner, bağlantı sağlam kalır.
    const input: Readable = opts.onProgress ? this.countingPassThrough(opts, null) : source
    const onAbort = (): void => {
      source.destroy(new FerroError('CANCELLED', 'Yükleme iptal edildi'))
      if (input !== source) input.destroy(new FerroError('CANCELLED', 'Yükleme iptal edildi'))
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      // Resume: append modunda aç — kuyruk, kaynağı zaten offset'ten başlatır.
      const options =
        opts.startAt && opts.startAt > 0
          ? { writeStreamOptions: { flags: 'a' as const } }
          : undefined
      if (input !== source) source.pipe(input as PassThrough)
      await this.client.put(input, target, options)
    } catch (err) {
      if (opts.signal?.aborted) throw new FerroError('CANCELLED', 'Yükleme iptal edildi')
      throw this.translate(err, 'TRANSFER_FAILED', 'Yükleme başarısız')
    } finally {
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  async delete(path: string): Promise<void> {
    await this.client.delete(this.resolve(path))
  }

  async rename(from: string, to: string): Promise<void> {
    await this.client.rename(this.resolve(from), this.resolve(to))
  }

  async mkdir(path: string): Promise<void> {
    await this.client.mkdir(this.resolve(path))
  }

  async rmdir(path: string): Promise<void> {
    await this.client.rmdir(this.resolve(path))
  }

  async chmod(path: string, mode: number): Promise<void> {
    await this.client.chmod(this.resolve(path), mode)
  }

  /** Göreli yolları geçerli çalışma dizinine göre çözer (SFTP'de kalıcı cwd yoktur). */
  private resolve(path: string): string {
    if (path.startsWith('/')) return posix.normalize(path)
    return posix.normalize(posix.join(this._cwd, path))
  }

  private countingPassThrough(opts: TransferOptions, total: number | null): PassThrough {
    const pt = new PassThrough()
    let bytes = 0
    pt.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      opts.onProgress?.({ bytes, total })
    })
    return pt
  }

  private streamFinished(s: Writable): Promise<void> {
    return new Promise((resolve, reject) => {
      s.once('finish', resolve)
      s.once('error', reject)
    })
  }

  /**
   * Hata sınıflandırma: önce yapısal işaretler (ssh2-sftp-client hata kodları,
   * SFTP durum kodları, sistem errno), regex yalnızca son çare.
   */
  private translate(err: unknown, code: FerroErrorCode, message: string): FerroError {
    if (err instanceof FerroError) return err
    const detail = err instanceof Error ? err.message : String(err)
    const c = (err as { code?: string | number } | null)?.code

    // SFTP durum kodları: 2 = NO_SUCH_FILE, 3 = PERMISSION_DENIED.
    if (c === 'ENOENT' || c === 'ENOTDIR' || c === 'ERR_BAD_PATH' || c === 2) {
      return new FerroError('NOT_FOUND', 'Dosya/dizin bulunamadı', detail)
    }
    if (c === 'EACCES' || c === 3) {
      return new FerroError('PERMISSION_DENIED', 'İzin reddedildi', detail)
    }
    if (c === 'ERR_BAD_AUTH') {
      return new FerroError('AUTH_FAILED', 'Kimlik doğrulama başarısız', detail)
    }
    if (c === 'ERR_NOT_CONNECTED') {
      return new FerroError('NOT_CONNECTED', 'Bağlantı kapalı', detail)
    }
    if (c === 'ETIMEDOUT' || /\btime[d ]?out\b/i.test(detail)) {
      return new FerroError('TIMEOUT', 'İşlem zaman aşımına uğradı', detail)
    }
    if (c === 'ECONNREFUSED' || c === 'ENOTFOUND' || c === 'ECONNRESET' || c === 'EHOSTUNREACH') {
      return new FerroError('CONNECTION_FAILED', 'Sunucuya ulaşılamadı', detail)
    }
    if (/authentication|all configured authentication methods failed|password/i.test(detail)) {
      return new FerroError('AUTH_FAILED', 'Kimlik doğrulama başarısız', detail)
    }
    return new FerroError(code, message, detail)
  }
}
