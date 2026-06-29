import { ipcMain, BrowserWindow, WebContents, IpcMainInvokeEvent } from 'electron'
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

/** Tek köprü kanalını (ferro:invoke) ipcMain'e bağlar; tüm çağrıları dispatch eder. */
export function installIpcRouter(): void {
  ipcMain.handle(
    BRIDGE.invoke,
    async (
      event: IpcMainInvokeEvent,
      channel: string,
      payload: unknown
    ): Promise<IpcResult<unknown>> => {
      const handler = handlers.get(channel as InvokeChannel)
      if (!handler) {
        const error = serializeError(
          new FerroError('IPC_HANDLER_MISSING', `Bilinmeyen IPC kanalı: ${channel}`)
        )
        log.warn(`handler bulunamadı: ${channel}`)
        return { ok: false, error }
      }
      try {
        const data = await handler(payload as never, { sender: event.sender })
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
