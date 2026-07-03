<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type LangChoice } from '@renderer/stores/ui'
import LocalePreview from '@renderer/components/LocalePreview.vue'
import type { Draft } from './types'

const props = defineProps<{ draft: Draft }>()

const { t } = useI18n()

// Desteklenen diller (liste-kutusu için). Ferro şu an tr/en locale'ine sahip.
const languages = computed<{ value: LangChoice; title: string }[]>(() => [
  { value: 'system', title: t('settings.langPage.systemDefault') },
  { value: 'tr', title: 'Türkçe (tr)' },
  { value: 'en', title: 'English (en)' }
])

// Seçilen (taslak) dilin çözülmüş locale'i — <v-locale-provider> önizlemesi için.
// Henüz Kaydet'e basılmadığından global dilden farklı olabilir.
const previewLocale = computed(() => {
  const c = props.draft.languageChoice
  if (c === 'tr' || c === 'en') return c
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'
})
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Arayüz → Dil -->
  <div class="text-body-2 mb-1">{{ $t('settings.langPage.selectLabel') }}</div>
  <div class="lang-list">
    <v-list density="compact" nav>
      <v-list-item
        v-for="l in languages"
        :key="l.value"
        :active="draft.languageChoice === l.value"
        :title="l.title"
        @click="draft.languageChoice = l.value"
      />
    </v-list>
  </div>
  <p class="text-caption text-medium-emphasis mt-2 mb-2">
    {{ $t('settings.langPage.instantNote') }}
  </p>

  <!-- Seçilen dilin önizlemesi: <v-locale-provider> ile bu alt-ağaç,
       uygulamanın mevcut (global) dilinden BAĞIMSIZ olarak seçilen
       locale'de render edilir. Kaydet'ten önce dili görmeyi sağlar. -->
  <div class="text-body-2 mb-1">{{ $t('settings.langPage.previewLabel') }}</div>
  <v-locale-provider :locale="previewLocale">
    <div class="preview-box">
      <LocalePreview />
    </div>
  </v-locale-provider>
</template>
