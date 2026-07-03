import { app, ipcMain, BrowserWindow, WebContents, IpcMainInvokeEvent } from 'electron'
import {
  BRIDGE,
  type InvokeChannel,
  type InvokeReq,
  type InvokeRes,
  type EventChannel,
  type EventMap,
  type IpcResult
} from '@shared/ipc'
import { serializeError, FerroError } from '@shared/errors'
import { validatePayload, isKnownChannel } from './validation'
import { createLogger } from '../core/logger'

const log = createLogger('ipc')

export interface HandlerContext {
  sender: WebContents
}

type Handler<C extends InvokeChannel> = (
  payload: InvokeReq<C>,
  ctx: HandlerContext
) => Promise<InvokeRes<C>> | InvokeRes<C>

// Map içinde tip silme: payload: never (bottom) sayesinde her Handler<C> atanabilir.
type AnyHandler = (payload: never, ctx: HandlerContext) => unknown

const handlers = new Map<string, AnyHandler>()

/** Tip güvenli handler kaydı. Her kanal yalnızca bir kez kaydedilebilir. */
export function registerHandler<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  if (handlers.has(channel)) {
    throw new Error(`IPC handler zaten kayıtlı: ${channel}`)
  }
  handlers.set(channel, handler as AnyHandler)
}

/**
 * Çağrının uygulamanın kendi ana çerçevesinden geldiğini doğrular.
 * Alt çerçeveler ve beklenmeyen origin'ler (defense-in-depth) reddedilir.
 */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  if (!frame || frame !== event.sender.mainFrame) return false
  const url = frame.url
  if (url.startsWith('file://')) return true
  const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
  return devUrl !== undefined && devUrl !== '' && url.startsWith(devUrl)
}

/** Tek köprü kanalını (ferro:invoke) ipcMain'e bağlar; tüm çağrıları dispatch eder. */
export function installIpcRouter(): void {
  ipcMain.handle(
    BRIDGE.invoke,
    async (
      event: IpcMainInvokeEvent,
      channel: string,
      payload: unknown
    ): Promise<IpcResult<unknown>> => {
      if (!isTrustedSender(event)) {
        log.warn(`güvenilmeyen göndericiden IPC çağrısı reddedildi: ${channel}`)
        return {
          ok: false,
          error: serializeError(new FerroError('VALIDATION', 'IPC göndericisi doğrulanamadı'))
        }
      }
      if (!isKnownChannel(channel)) {
        const error = serializeError(
          new FerroError('IPC_HANDLER_MISSING', `Bilinmeyen IPC kanalı: ${channel}`)
        )
        log.warn(`handler bulunamadı: ${channel}`)
        return { ok: false, error }
      }
      const handler = handlers.get(channel)
      if (!handler) {
        const error = serializeError(
          new FerroError('IPC_HANDLER_MISSING', `Bilinmeyen IPC kanalı: ${channel}`)
        )
        log.warn(`handler bulunamadı: ${channel}`)
        return { ok: false, error }
      }
      try {
        // Şema doğrulama: geçersiz yük handler'a hiç ulaşmaz; bilinmeyen
        // alanlar süzülmüş (strip) kopya handler'a verilir.
        const validated = validatePayload(channel, payload)
        const data = await handler(validated as never, { sender: event.sender })
        return { ok: true, data }
      } catch (err) {
        const error = serializeError(err)
        log.error(`handler hatası [${channel}] ${error.code}: ${error.message}`, error.detail)
        return { ok: false, error }
      }
    }
  )
}

/** Main → renderer tip güvenli olay yayını. */
export function emitEvent<E extends EventChannel>(
  target: WebContents | BrowserWindow,
  event: E,
  payload: EventMap[E]
): void {
  const wc = target instanceof BrowserWindow ? target.webContents : target
  wc.send(BRIDGE.event, event, payload)
}
