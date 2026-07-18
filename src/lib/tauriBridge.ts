import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  FerroBridge,
  InvokeChannel,
  InvokeReq,
  InvokeRes,
  EventChannel,
  EventMap,
  IpcResult
} from '@shared/ipc'

// window.ferro köprüsü — Tauri invoke/listen üzerine kurulur.
// Renderer'ın geri kalanı (lib/ipc.ts, store'lar) DEĞİŞMEZ: aynı FerroBridge
// yüzeyini görür. Tek fark, altta Tauri `invoke`/`listen` çalışır.
//
//  • invoke: Rust `bridge_invoke` komutu DAİMA bir zarf (IpcResult) döndürür —
//    promise asla reject edilmez; unwrap + FerroError fırlatma lib/ipc.ts'de.
//  • on: Tauri `listen` asenkron bir unlisten döndürür; sözleşme senkron bir
//    abonelik iptali beklediğinden köprü bu farkı gizler.

const bridge: FerroBridge = {
  async invoke<C extends InvokeChannel>(
    channel: C,
    payload: InvokeReq<C>
  ): Promise<IpcResult<InvokeRes<C>>> {
    // payload void ise Rust tarafına null gider (Value alanı zorunlu).
    return (await tauriInvoke('bridge_invoke', {
      channel,
      payload: payload ?? null
    })) as IpcResult<InvokeRes<C>>
  },

  on<E extends EventChannel>(event: E, listener: (payload: EventMap[E]) => void): () => void {
    let unlisten: (() => void) | null = null
    let cancelled = false
    void listen<EventMap[E]>(event, (e) => listener(e.payload)).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      if (unlisten) unlisten()
      unlisten = null
    }
  }
}

/** window.ferro'yu kurar. Uygulama oluşturulmadan ÖNCE çağrılmalı. */
export function installFerroBridge(): void {
  window.ferro = bridge
}
