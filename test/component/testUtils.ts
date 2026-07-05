import { defineComponent, h, type Component } from 'vue'
import { vi } from 'vitest'
import { createPinia, type Pinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import { VApp } from 'vuetify/components'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { en as vuetifyEn } from 'vuetify/locale'
import { mount, type MountingOptions, type VueWrapper } from '@vue/test-utils'
import en from '@renderer/locales/en'
import { appAliases } from '@renderer/plugins/vuetify'

/** Testlerde kullanılan gerçek i18n mesajları — üretimdeki metinlerle birebir. */
export function createTestI18n(): ReturnType<typeof createI18n> {
  return createI18n({
    legacy: false,
    globalInjection: true,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en: { ...en, $vuetify: vuetifyEn } }
  })
}

/**
 * Pinia + i18n + Vuetify ile donatılmış mount — gerçek app kablolamasına yakın.
 * VNavigationDrawer/VAppBar gibi bileşenler Vuetify'ın layout enjeksiyonunu
 * (yalnızca <v-app> sağlar) gerektirdiğinden test edilen bileşen bir VApp
 * içine sarmalanır; olay/emit doğrulaması bu yüzden dönen wrapper'ın kendisi
 * yerine `wrapper.findComponent(component)` üzerinden yapılmalıdır.
 */
export function mountWithPlugins<T extends Component>(
  component: T,
  options: MountingOptions<Record<string, unknown>> & { pinia?: Pinia } = {}
): VueWrapper {
  const vuetify = createVuetify({
    icons: { defaultSet: 'mdi', aliases: { ...aliases, ...appAliases }, sets: { mdi } }
  })
  const i18n = createTestI18n()
  const { global, props, slots, pinia, ...rest } = options

  const Host = defineComponent({
    name: 'TestHost',
    inheritAttrs: false,
    setup(_, ctx) {
      return () => h(VApp, null, { default: () => h(component, ctx.attrs, ctx.slots) })
    }
  })

  return mount(Host, {
    props,
    slots,
    global: {
      // Bir `pinia` verilirse (örn. mount öncesi store durumu hazırlamak için
      // useUiStore(pinia) ile) o örnek kullanılır; aksi halde yeni/boş bir tane oluşturulur.
      plugins: [pinia ?? createPinia(), i18n, vuetify],
      ...global
    },
    ...rest
  }) as VueWrapper
}

/**
 * `window.ferro.invoke` (preload köprüsü) için sahte uygulama — Pinia store'ları
 * gerçek IPC yerine bu yanıtları görür. `handlers` anahtarları invoke kanal
 * adıdır (örn. 'team:list'); değeri, payload alıp yanıt verisini döndüren fonksiyon.
 */
export function stubFerro(handlers: Record<string, (payload: unknown) => unknown>): void {
  window.ferro = {
    invoke: vi.fn(async (channel: string, payload: unknown) => {
      const handler = handlers[channel]
      if (!handler) throw new Error(`stubFerro: no handler registered for channel "${channel}"`)
      return { ok: true, data: await handler(payload) }
    }),
    on: vi.fn(() => () => {})
  } as unknown as Window['ferro']
}
