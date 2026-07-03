import { Client, FileInfo, FileType, FTPError } from 'basic-ftp'
import type { Writable, Readable } from 'stream'
import { TLSSocket } from 'tls'
import { posix } from 'path'
import type { IFileTransferClient, TransferOptions, AdapterOptions } from '../IFileTransferClient'
import type { ConnectionConfig, RemoteEntry, EntryType } from '@shared/transfer'
import { FerroError, type FerroErrorCode } from '@shared/errors'
import { isAsciiTransfer } from '../transferType'
import { createLogger } from '../../core/logger'

const log = createLogger('ftp')

function mapType(t: FileType): EntryType {
  switch (t) {
    case FileType.File:
      return 'file'
    case FileType.Directory:
      return 'directory'
    case FileType.SymbolicLink:
      return 'symlink'
    default:
      return 'unknown'
  }
}

function mapPermissions(info: FileInfo): number | null {
  const p = info.permissions
  if (!p) return null
  // user/group/world her biri octal hane (Read=4, Write=2, Execute=1).
  return (p.user << 6) | (p.group << 3) | p.world
}

function mapEntry(info: FileInfo): RemoteEntry {
  return {
    name: info.name,
    type: mapType(info.type),
    size: info.size,
    modifiedAt: info.modifiedAt ? info.modifiedAt.getTime() : null,
    permissions: mapPermissions(info),
    // basic-ftp unix listelemelerinde kullanıcı/grup adlarını (string) verir.
    owner: info.user || null,
    group: info.group || null,
    linkTarget: info.link || undefined
  }
}

/**
 * Self-signed TLS sertifikasını onaylatır; true → güven, false → reddet.
 * fingerprint: sunucunun SHA-256 sertifika parmak izi (alınamadıysa null).
 * Doğrulayıcı bu parmak izini pinler; sonraki bağlantılarda sertifika değişirse
 * kullanıcı yeniden uyarılır (MITM koruması).
 */
export type TlsVerify = (
  host: string,
  port: number,
  detail: string,
  fingerprint: string | null
) => Promise<boolean>

function isCertError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /self.signed|unable to verify|certificate|CERT_|altname|hostname/i.test(m)
}

/** FTP / FTPS (explicit + implicit) adaptörü — basic-ftp tabanlı (yalnızca pasif mod). */
export class FtpAdapter implements IFileTransferClient {
  private client: Client
  private _connected = false
  private keepAliveTimer?: NodeJS.Timeout
  readonly supportsResume = true

  constructor(
    private readonly config: ConnectionConfig,
    private readonly tlsVerify?: TlsVerify,
    private readonly options: AdapterOptions = {}
  ) {
    if (options.proxy) {
      // basic-ftp soket enjeksiyonunu desteklemez; FTP proxy şimdilik yok sayılır.
      log.warn('FTP protokolünde vekil sunucu desteklenmiyor — proxy yok sayıldı')
    }
    this.client = this.buildClient()
  }

  private buildClient(): Client {
    const c = new Client(this.options.connectTimeoutMs || 30_000)
    c.ftp.encoding = (this.config.encoding ?? 'utf8') as typeof c.ftp.encoding
    if (this.protocolLog) {
      c.ftp.verbose = true
      c.ftp.log = this.protocolLog
    }
    return c
  }

  private protocolLog?: (line: string) => void

  get connected(): boolean {
    // İptal, bağlantıyı basic-ftp.close() ile kapatır (_connected güncellenmez);
    // client.closed kontrolü bayat "bağlı" görünümünü engeller.
    return this._connected && !this.client.closed
  }

  attachProtocolLog(cb: (line: string) => void): void {
    this.protocolLog = cb
    this.client.ftp.verbose = true
    this.client.ftp.log = cb
  }

  private async access(rejectUnauthorized: boolean): Promise<void> {
    const secure =
      this.config.protocol === 'ftps'
        ? true
        : this.config.protocol === 'ftps-implicit'
          ? 'implicit'
          : false
    await this.client.access({
      host: this.config.host,
      port: this.config.port,
      user: this.config.anonymous ? 'anonymous' : this.config.user,
      password: this.config.anonymous
        ? (this.config.password ?? 'anonymous@')
        : this.config.password,
      secure,
      secureOptions: { rejectUnauthorized }
    })
  }

  /** Kontrol bağlantısının TLS soketinden SHA-256 sertifika parmak izini okur. */
  private peerFingerprint(): string | null {
    const socket = this.client.ftp.socket
    if (!(socket instanceof TLSSocket)) return null
    const cert = socket.getPeerCertificate()
    return cert && cert.fingerprint256 ? cert.fingerprint256 : null
  }

  /**
   * Kimlik bilgisi GÖNDERMEDEN yalnızca TLS el sıkışması yapar (sertifikayı
   * incelemek için). Login sonradan, sertifika onaylanırsa yapılır.
   */
  private async secureHandshake(rejectUnauthorized: boolean): Promise<void> {
    const secureOptions = { rejectUnauthorized }
    if (this.config.protocol === 'ftps-implicit') {
      await this.client.connectImplicitTLS(this.config.host, this.config.port, secureOptions)
    } else {
      await this.client.connect(this.config.host, this.config.port)
      await this.client.useTLS(secureOptions)
    }
  }

  private async loginAndSettings(): Promise<void> {
    await this.client.login(
      this.config.anonymous ? 'anonymous' : this.config.user,
      this.config.anonymous ? (this.config.password ?? 'anonymous@') : this.config.password
    )
    await this.client.useDefaultSettings()
  }

  async connect(): Promise<void> {
    const isSecure = this.config.protocol === 'ftps' || this.config.protocol === 'ftps-implicit'
    try {
      if (isSecure && this.tlsVerify) {
        // TLS TOFU + pinleme: önce katı doğrula (parola, doğrulanmamış
        // sertifikaya gönderilmez).
        try {
          await this.access(true)
        } catch (err) {
          if (!isCertError(err)) throw err
          const detail = err instanceof Error ? err.message : String(err)
          // Sertifikayı incelemek için kimlik bilgisi göndermeden gevşek el
          // sıkışması yap; parmak izi doğrulayıcıya (pin karşılaştırması +
          // gerekiyorsa kullanıcı onayı) gider.
          this.client.close()
          this.client = this.buildClient()
          await this.secureHandshake(false)
          const fingerprint = this.peerFingerprint()
          const ok = await this.tlsVerify(this.config.host, this.config.port, detail, fingerprint)
          if (!ok) {
            this.client.close()
            throw new FerroError('TLS_UNTRUSTED', 'Sertifika reddedildi', detail)
          }
          // Onaylandı — aynı (doğrulanmış) bağlantı üzerinden giriş yap.
          await this.loginAndSettings()
        }
      } else {
        await this.access(this.config.rejectUnauthorized ?? false)
      }

      this._connected = true
      // Keep-alive: yalnızca Ayarlar'dan açıksa boşta periyodik NOOP.
      // basic-ftp komutları serileştirir; transferlerle çakışmaz.
      if (this.options.keepAlive) {
        this.keepAliveTimer = setInterval(() => {
          this.client.send('NOOP').catch(() => undefined)
        }, 30_000)
      }
      log.info(`bağlandı: ${this.config.host}:${this.config.port}`)
    } catch (err) {
      throw this.translate(err, 'CONNECTION_FAILED', 'Bağlantı kurulamadı')
    }
  }

  async disconnect(): Promise<void> {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer)
    this.client.close()
    this._connected = false
  }

  async pwd(): Promise<string> {
    return this.client.pwd()
  }

  async cwd(path: string): Promise<void> {
    await this.client.cd(path)
  }

  async list(path?: string): Promise<RemoteEntry[]> {
    try {
      const items = await this.client.list(path)
      return items.map(mapEntry)
    } catch (err) {
      throw this.translate(err, 'FS_ERROR', 'Dizin listelenemedi')
    }
  }

  async stat(path: string): Promise<RemoteEntry> {
    // FTP'de doğrudan stat yok; üst dizini listeleyip eşleşeni buluyoruz.
    const dir = posix.dirname(path)
    const base = posix.basename(path)
    const entries = await this.list(dir === '' ? '/' : dir)
    const found = entries.find((e) => e.name === base)
    if (!found) throw new FerroError('FS_ERROR', `Bulunamadı: ${path}`)
    return found
  }

  /** Bir sonraki transfer için TYPE (A=ASCII / I=binary) ayarlar. */
  private async setType(name: string): Promise<void> {
    if (!this.options.transferType || this.options.transferType.mode === 'binary') return
    const cmd = isAsciiTransfer(name, this.options.transferType) ? 'TYPE A' : 'TYPE I'
    await this.client.send(cmd).catch(() => undefined)
  }

  async download(remotePath: string, dest: Writable, opts: TransferOptions = {}): Promise<void> {
    const total = await this.client.size(remotePath).catch(() => null)
    await this.setType(remotePath)
    this.attachProgress(opts, total)
    const onAbort = (): void => this.client.close()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      await this.client.downloadTo(dest, remotePath, opts.startAt ?? 0)
    } catch (err) {
      if (opts.signal?.aborted) throw new FerroError('CANCELLED', 'İndirme iptal edildi')
      throw this.translate(err, 'TRANSFER_FAILED', 'İndirme başarısız')
    } finally {
      this.client.trackProgress()
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  async upload(source: Readable, remotePath: string, opts: TransferOptions = {}): Promise<void> {
    await this.setType(remotePath)
    this.attachProgress(opts, null)
    const onAbort = (): void => this.client.close()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      if (opts.startAt && opts.startAt > 0) {
        await this.client.appendFrom(source, remotePath)
      } else {
        await this.client.uploadFrom(source, remotePath)
      }
    } catch (err) {
      if (opts.signal?.aborted) throw new FerroError('CANCELLED', 'Yükleme iptal edildi')
      throw this.translate(err, 'TRANSFER_FAILED', 'Yükleme başarısız')
    } finally {
      this.client.trackProgress()
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  async delete(path: string): Promise<void> {
    await this.client.remove(path)
  }

  async rename(from: string, to: string): Promise<void> {
    await this.client.rename(from, to)
  }

  async mkdir(path: string): Promise<void> {
    await this.client.send('MKD ' + path)
  }

  async rmdir(path: string): Promise<void> {
    await this.client.send('RMD ' + path)
  }

  async chmod(path: string, mode: number): Promise<void> {
    try {
      await this.client.send(`SITE CHMOD ${mode.toString(8)} ${path}`)
    } catch (err) {
      throw this.translate(
        err,
        'FS_ERROR',
        'İzin değiştirilemedi (sunucu SITE CHMOD desteklemiyor olabilir)'
      )
    }
  }

  private attachProgress(opts: TransferOptions, total: number | null): void {
    if (!opts.onProgress) return
    this.client.trackProgress((info) => {
      opts.onProgress?.({ bytes: info.bytes, total })
    })
  }

  /**
   * Hata sınıflandırma: önce yapısal işaretler (FTP yanıt kodu, sistem errno),
   * regex yalnızca son çare. Böylece sınıflandırma sunucu/locale mesajlarına bağımlı kalmaz.
   */
  private translate(err: unknown, code: FerroErrorCode, message: string): FerroError {
    if (err instanceof FerroError) return err
    const detail = err instanceof Error ? err.message : String(err)
    const reply = err instanceof FTPError ? err.code : null
    const sys = (err as NodeJS.ErrnoException | null)?.code

    if (reply === 530 || reply === 331 || reply === 332) {
      return new FerroError('AUTH_FAILED', 'Kimlik doğrulama başarısız', detail)
    }
    if (reply === 550) {
      return new FerroError('NOT_FOUND', 'Dosya/dizin bulunamadı veya erişilemedi', detail)
    }
    if (reply === 553 || reply === 532) {
      return new FerroError('PERMISSION_DENIED', 'İzin reddedildi', detail)
    }
    if (reply === 421) {
      return new FerroError('CONNECTION_FAILED', 'Sunucu bağlantıyı kapattı', detail)
    }
    if (sys === 'ETIMEDOUT' || /\btime[d ]?out\b/i.test(detail)) {
      return new FerroError('TIMEOUT', 'İşlem zaman aşımına uğradı', detail)
    }
    if (
      sys === 'ECONNREFUSED' ||
      sys === 'ENOTFOUND' ||
      sys === 'ECONNRESET' ||
      sys === 'EHOSTUNREACH'
    ) {
      return new FerroError('CONNECTION_FAILED', 'Sunucuya ulaşılamadı', detail)
    }
    // Son çare: mesaj tabanlı kimlik doğrulama tespiti.
    if (/530|login|password/i.test(detail)) {
      return new FerroError('AUTH_FAILED', 'Kimlik doğrulama başarısız', detail)
    }
    return new FerroError(code, message, detail)
  }
}
