import { createI18n } from 'vue-i18n'
import { tr as vuetifyTr, en as vuetifyEn } from 'vuetify/locale'
import tr from '@renderer/locales/tr'
import en from '@renderer/locales/en'

export type Locale = 'tr' | 'en'

const saved = (localStorage.getItem('ferro.lang') as Locale | null) ?? 'tr'

// Vuetify'ın kendi bileşen metinleri ($vuetify.* — no-data, sayfalama vb.) aynı
// vue-i18n örneğine gömülür (best practice: tek i18n kaynağı). Vuetify bunları
// locale adapter'ı üzerinden kullanır (bkz. plugins/vuetify.ts).
export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: saved,
  fallbackLocale: 'en',
  messages: {
    tr: { ...tr, $vuetify: vuetifyTr },
    en: { ...en, $vuetify: vuetifyEn }
  }
})

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  localStorage.setItem('ferro.lang', locale)
}
