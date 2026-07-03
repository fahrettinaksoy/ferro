import type { Writable, Readable } from 'stream'
import type {
  RemoteEntry,
  TransferProgress,
  ProxyConfig,
  TransferTypeConfig
} from '@shared/transfer'

/** Adaptör kurulum seçenekleri (uygulama geneli çalışma zamanı ayarlarından). */
export interface AdapterOptions {
  /** Bağlantı zaman aşımı (ms); 0 = kapalı. */
  connectTimeoutMs?: number
  /** FTP keep-alive (NOOP) gönderilsin mi. */
  keepAlive?: boolean
  /** Vekil sunucu (SFTP). */
  proxy?: ProxyConfig
  /** FTP ASCII/binary kuralları. */
  transferType?: TransferTypeConfig
}

export interface TransferOptions {
  /** İlerleme geri çağrısı. */
  onProgress?: (p: TransferProgress) => void
  /** İptal sinyali. */
  signal?: AbortSignal
  /** Kaldığı yerden devam (resume) — başlangıç offset'i (bayt). */
  startAt?: number
}

/**
 * Tüm protokollerin (FTP/FTPS/SFTP) uyduğu ortak sözleşme.
 * UI ve transfer motoru yalnızca bu arayüzü bilir; protokol ayrıntıları adaptörlerde gizlidir.
 * Yol parametreleri uzak sunucu yollarıdır (POSIX tarzı, '/').
 */
export interface IFileTransferClient {
  readonly connected: boolean
  /** Adaptör offset (REST) ile transferi sürdürmeyi destekliyor mu? */
  readonly supportsResume?: boolean

  connect(): Promise<void>
  disconnect(): Promise<void>

  /** Geçerli çalışma dizinini döndürür. */
  pwd(): Promise<string>
  /** Çalışma dizinini değiştirir. */
  cwd(path: string): Promise<void>

  /** Bir dizini listeler (verilmezse geçerli dizin). */
  list(path?: string): Promise<RemoteEntry[]>
  /** Tek bir girdinin bilgisini döndürür. */
  stat(path: string): Promise<RemoteEntry>

  /** Uzak dosyayı yerel writable stream'e indirir. */
  download(remotePath: string, dest: Writable, opts?: TransferOptions): Promise<void>
  /** Yerel readable stream'i uzak dosyaya yükler. */
  upload(source: Readable, remotePath: string, opts?: TransferOptions): Promise<void>

  delete(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  mkdir(path: string): Promise<void>
  rmdir(path: string): Promise<void>
  /** İzin değiştir (chmod) — protokol desteklemiyorsa FerroError('FS_ERROR') fırlatır. */
  chmod(path: string, mode: number): Promise<void>

  /** Opsiyonel: protokol komut/yanıt akışını dinle (log paneli için). */
  attachProtocolLog?(cb: (line: string) => void): void
}
