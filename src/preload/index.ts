import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  BRIDGE,
  type FerroBridge,
  type InvokeChannel,
  type InvokeReq,
  type InvokeRes,
  type EventChannel,
  type EventMap,
  type IpcResult
} from '@shared/ipc'

// Tip güvenli, sertleştirilmiş köprü. Renderer yalnızca invoke + on görür;
// ham ipcRenderer veya Node API'ları asla açığa çıkmaz.
// invoke zarfı olduğu gibi döndürür (unwrap renderer'da yapılır).
const api: FerroBridge = {
  async invoke<C extends InvokeChannel>(
    channel: C,
    payload: InvokeReq<C>
  ): Promise<IpcResult<InvokeRes<C>>> {
    return (await ipcRenderer.invoke(BRIDGE.invoke, channel, payload)) as IpcResult<InvokeRes<C>>
  },

  on<E extends EventChannel>(event: E, listener: (payload: EventMap[E]) => void): () => void {
    const handler = (_e: IpcRendererEvent, ch: string, payload: EventMap[E]): void => {
      if (ch === event) listener(payload)
    }
    ipcRenderer.on(BRIDGE.event, handler)
    return () => ipcRenderer.removeListener(BRIDGE.event, handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('ferro', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (yalnızca contextIsolation kapalıyken — üretimde kullanılmaz)
  window.electron = electronAPI
  // @ts-ignore
  window.ferro = api
}
