<script setup lang="ts">
// <v-locale-provider> ile sağlanan SCOPED locale'i okur (global app dilinden
// bağımsız). Ayarlar → Dil'de seçilen dilin canlı önizlemesi için kullanılır.
import { computed } from 'vue'
import { useLocale } from 'vuetify'

const { current, t } = useLocale()

// Locale'e duyarlı sayı biçimi (tr: 1.234.567,89 — en: 1,234,567.89).
const sampleNumber = computed(() => new Intl.NumberFormat(current.value).format(1234567.89))
</script>

<template>
  <div class="text-caption text-medium-emphasis">
    <div><strong>{{ current }}</strong> · {{ t('$vuetify.open') }} / {{ t('$vuetify.close') }}</div>
    <div>{{ sampleNumber }}</div>
  </div>
</template>
