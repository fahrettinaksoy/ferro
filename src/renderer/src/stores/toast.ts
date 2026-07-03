import { defineStore } from 'pinia'
import { FerroError } from '@shared/errors'
import { i18n } from '@renderer/plugins/i18n'

export type ToastColor = 'success' | 'error' | 'warning' | 'info'

/**
 * v-snackbar-queue mesajı. Vuetify 4'te queue, dizinin elemanlarını sırayla
 * (FIFO) VSnackbar prop'u olarak gösterir; gösterimi biteni diziden kendisi çıkarır.
 * Bu sürümün queue'su promise/success/error DESTEKLEMEZ — o akış store'da yürütülür
 * (bkz. `promise`). Yalnızca geçerli VSnackbar prop'ları konur (text/color/timeout/
 * timer); ikon, `color`'dan türetilip queue'nun #text slot'unda gösterilir.
 */
export interface ToastMessage {
  text: string
  color: ToastColor
  timeout?: number
  /** İlerleme/geri sayım çubuğu. */
  timer?: boolean | 'top' | 'bottom'
}

const TIMEOUT: Record<ToastColor, number> = {
  success: 2500,
  info: 3000,
  warning: 4000,
  error: 5000
}

export function errText(err: unknown): string {
  // FerroError kodları UI dilinde çevrilir (main süreç mesajları tek dillidir);
  // teknik ayrıntı log panelinde kalır. Katalogda olmayan kod ham mesaja düşer.
  if (err instanceof FerroError) {
    const key = `errors.${err.code}`
    if (i18n.global.te(key)) return i18n.global.t(key)
    return err.message
  }
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String((err as { message?: string })?.message ?? err)
}

export const useToastStore = defineStore('toast', {
  state: (): { messages: ToastMessage[] } => ({ messages: [] }),
  actions: {
    notify(color: ToastColor, text: string, opts: Partial<ToastMessage> = {}): void {
      this.messages.push({ text, color, timeout: TIMEOUT[color], timer: true, ...opts })
    },

    success(text: string, opts?: Partial<ToastMessage>): void {
      this.notify('success', text, opts)
    },
    error(text: string, opts?: Partial<ToastMessage>): void {
      this.notify('error', text, opts)
    },
    warning(text: string, opts?: Partial<ToastMessage>): void {
      this.notify('warning', text, opts)
    },
    info(text: string, opts?: Partial<ToastMessage>): void {
      this.notify('info', text, opts)
    },

    /**
     * Bir promise'i izler: çözülünce başarı, reddedilince hata toast'ı gösterir.
     * Promise'in sonucunu döndürür / hatasını yeniden fırlatır — çağıran await edip
     * dallanabilir. "Ateşle-unut" çağrılar `.catch(() => {})` eklemelidir.
     * (Bu sürümün queue'su promise prop'unu desteklemediği için akış burada yürütülür.)
     */
    async promise<T>(
      text: string,
      p: Promise<T>,
      o: {
        success?: string | ((data: T) => string)
        error?: string | ((err: unknown) => string)
      } = {}
    ): Promise<T> {
      // Bekleme bildirimi GÖSTERİLMEZ: kuyruk (FIFO) her mesajı tam süresince
      // oynattığından art arda işlemlerde bildirimler birikip gecikir.
      // Süren işin geri bildirimi çağıran arayüzün işidir (spinner, panel, log).
      try {
        const data = await p
        this.success(typeof o.success === 'function' ? o.success(data) : (o.success ?? text))
        return data
      } catch (err) {
        this.error(typeof o.error === 'function' ? o.error(err) : (o.error ?? errText(err)))
        throw err
      }
    }
  }
})
