<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Dosya düzenleme → Dosya türü ilişkileri -->
  <div class="text-body-2 mb-1">{{ $t('settings.fileAssoc.label') }}</div>
  <v-textarea v-model="draft.fileAssoc.associations" rows="12" class="font-monospace" />
  <p class="text-caption text-medium-emphasis mt-2 mb-0">
    {{ $t('settings.fileAssoc.formatHint') }}
  </p>
  <p class="text-caption text-medium-emphasis font-monospace mt-1 mb-1">
    {{ $t('settings.fileAssoc.example') }}
  </p>
  <p class="text-caption text-primary mb-0">{{ $t('settings.fileAssoc.quoteRules') }}</p>
</template>
