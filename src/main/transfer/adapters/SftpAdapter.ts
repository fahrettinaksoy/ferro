import SftpClient from 'ssh2-sftp-client'
import type { HostFingerprintVerifier } from 'ssh2'
import { PassThrough, type Writable, type Readable } from 'stream'
import { posix } from 'path'
import type { IFileTransferClient, TransferOptions } from '../IFileTransferClient'
import type { ConnectionConfig, RemoteEntry, EntryType } from '@shared/transfer'
import { FerroError, type FerroErrorCode } from '@shared/errors'
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
  // SFTP resume için offset desteği şu an yok (overwrite). FTP'de mevcut.
  readonly supportsResume = false

  constructor(
    private readonly config: ConnectionConfig,
    private readonly hostVerify?: HostVerify
  ) {}

  get connected(): boolean {
    return this._connected
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.user,
        password: this.config.password,
        privateKey: this.config.privateKey,
        passphrase: this.config.passphrase,
        readyTimeout: 30_000,
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
    let total: number | null = null
    try {
      total = (await this.client.stat(target)).size
    } catch {
      total = null
    }
    const onAbort = (): void => void this.client.end()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      if (opts.onProgress) {
        const counter = this.countingPassThrough(opts, total)
        const finished = this.streamFinished(dest)
        counter.pipe(dest)
        await this.client.get(target, counter)
        await finished
      } else {
        await this.client.get(target, dest)
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
    const onAbort = (): void => void this.client.end()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      if (opts.onProgress) {
        const counter = this.countingPassThrough(opts, null)
        source.pipe(counter)
        await this.client.put(counter, target)
      } else {
        await this.client.put(source, target)
      }
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

  private translate(err: unknown, code: FerroErrorCode, message: string): FerroError {
    if (err instanceof FerroError) return err
    const detail = err instanceof Error ? err.message : String(err)
    if (/authentication|all configured authentication methods failed|password/i.test(detail)) {
      return new FerroError('AUTH_FAILED', 'Kimlik doğrulama başarısız', detail)
    }
    return new FerroError(code, message, detail)
  }
}
