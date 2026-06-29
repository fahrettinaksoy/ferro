import { createI18n } from 'vue-i18n'
import tr from '@renderer/locales/tr'
import en from '@renderer/locales/en'

export type Locale = 'tr' | 'en'

const saved = (localStorage.getItem('ferro.lang') as Locale | null) ?? 'tr'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: saved,
  fallbackLocale: 'en',
  messages: { tr, en }
})

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  localStorage.setItem('ferro.lang', locale)
}
