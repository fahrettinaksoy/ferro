import { deserializeError, FerroError } from '@shared/errors'
import type { InvokeChannel, InvokeReq, InvokeRes, EventChannel, EventMap } from '@shared/ipc'

// Renderer IPC istemcisi: zarfı açar, hata durumunda FerroError fırlatır.
// FerroError burada (renderer bağlamında) oluşturulduğu için `code` korunur.
export async function invoke<C extends InvokeChannel>(
  channel: C,
  payload: InvokeReq<C>
): Promise<InvokeRes<C>> {
  const res = await window.ferro.invoke(channel, payload)
  if (res.ok) return res.data
  throw deserializeError(res.error)
}

/** Main → renderer olay aboneliği. Aboneliği iptal eden fonksiyon döner. */
export function onEvent<E extends EventChannel>(
  event: E,
  listener: (payload: EventMap[E]) => void
): () => void {
  return window.ferro.on(event, listener)
}

export { FerroError }
