// Protokol-agnostik, IPC üzerinden serileştirilebilir hata modeli.
// Main tarafında fırlatılır, preload'da yeniden Error'a dönüştürülür.

export type FerroErrorCode =
  | 'UNKNOWN'
  | 'IPC_HANDLER_MISSING'
  | 'VALIDATION'
  | 'CONNECTION_FAILED'
  | 'AUTH_FAILED'
  | 'NOT_CONNECTED'
  | 'TLS_UNTRUSTED'
  | 'HOST_KEY_UNTRUSTED'
  | 'TRANSFER_FAILED'
  | 'FS_ERROR'
  | 'CANCELLED'

export interface SerializedError {
  name: 'FerroError'
  code: FerroErrorCode
  /** Kullanıcıya gösterilebilir mesaj. */
  message: string
  /** Teknik ayrıntı (log/diagnostik). */
  detail?: string
}

export class FerroError extends Error {
  readonly code: FerroErrorCode
  readonly detail?: string

  constructor(code: FerroErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'FerroError'
    this.code = code
    this.detail = detail
  }

  toSerialized(): SerializedError {
    return { name: 'FerroError', code: this.code, message: this.message, detail: this.detail }
  }

  static from(err: unknown): FerroError {
    if (err instanceof FerroError) return err
    if (err instanceof Error) {
      return new FerroError('UNKNOWN', err.message, err.stack)
    }
    return new FerroError('UNKNOWN', String(err))
  }
}

export function serializeError(err: unknown): SerializedError {
  return FerroError.from(err).toSerialized()
}

/** Preload'da: serileştirilmiş hatayı yeniden Error nesnesine dönüştürür. */
export function deserializeError(e: SerializedError): FerroError {
  return new FerroError(e.code, e.message, e.detail)
}
