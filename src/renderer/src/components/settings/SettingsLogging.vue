<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Günlük -->
  <fieldset class="section">
    <legend>{{ $t('settings.pages.logging') }}</legend>
    <v-switch v-model="draft.logging.timestamps" :label="$t('settings.logging.timestamps')" />
    <v-switch v-model="draft.logging.logToFile" :label="$t('settings.logging.toFile')" />
    <div class="d-flex align-center ga-2 mt-1">
      <span class="field-label">{{ $t('settings.logging.fileName') }}</span>
      <v-text-field
        v-model="draft.logging.fileName"
        :disabled="!draft.logging.logToFile"
        style="max-width: 280px"
      />
      <v-btn variant="outlined" size="small" disabled>{{ $t('settings.logging.browse') }}</v-btn>
    </div>
    <v-switch
      v-model="draft.logging.limitSize"
      :label="$t('settings.logging.limitSize')"
      :disabled="!draft.logging.logToFile"
      class="mt-1"
    />
    <div class="d-flex align-center ga-2">
      <span class="field-label">{{ $t('settings.logging.limit') }}</span>
      <v-text-field
        v-model.number="draft.logging.maxSizeMiB"
        type="number"
        min="1"
        :disabled="!draft.logging.logToFile || !draft.logging.limitSize"
        style="max-width: 90px"
      />
      <span class="text-caption text-medium-emphasis">{{ $t('settings.logging.mib') }}</span>
    </div>
    <p class="text-caption text-medium-emphasis mt-2 mb-0">
      {{ $t('settings.logging.rotateHint') }}
    </p>
  </fieldset>
</template>
