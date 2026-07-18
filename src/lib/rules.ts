import { useI18n } from 'vue-i18n'

/** Vuetify field `rules` prop signature: true = geçerli, string = hata metni. */
export type Rule = (value: unknown) => true | string

/** Ortak alan kuralları (Vuetify v-text-field/v-select `:rules` ile kullanılır). */
export function useRules(): {
  required: Rule
  minLength: (n: number) => Rule
  port: Rule
} {
  const { t } = useI18n()

  const required: Rule = (v) =>
    (v !== null && v !== undefined && String(v).trim() !== '') || t('validation.required')

  const minLength =
    (n: number): Rule =>
    (v) =>
      String(v ?? '').trim().length >= n || t('validation.minLength', { n })

  const port: Rule = (v) => {
    const num = Number(v)
    return (Number.isInteger(num) && num >= 1 && num <= 65535) || t('validation.port')
  }

  return { required, minLength, port }
}
