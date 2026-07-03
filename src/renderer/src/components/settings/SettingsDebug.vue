<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const { t } = useI18n()

const debugLevels = computed(() => [
  { value: 0, title: t('settings.debug.lvl0') },
  { value: 1, title: t('settings.debug.lvl1') },
  { value: 2, title: t('settings.debug.lvl2') },
  { value: 3, title: t('settings.debug.lvl3') },
  { value: 4, title: t('settings.debug.lvl4') }
])
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Hata ayıklama -->
  <fieldset class="section">
    <legend>{{ $t('settings.debug.title') }}</legend>
    <v-switch v-model="draft.debug.showDebugMenu" :label="$t('settings.debug.showMenu')" />
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.debug.level') }}</span>
      <v-select v-model="draft.debug.debugLevel" :items="debugLevels" style="max-width: 200px" />
    </div>
    <p class="text-caption text-medium-emphasis mt-2 mb-1">
      {{ $t('settings.debug.levelHint') }}
    </p>
    <p class="text-caption text-medium-emphasis mb-2">
      {{ $t('settings.debug.reportHint') }}
    </p>
    <v-switch v-model="draft.debug.showRawListing" :label="$t('settings.debug.rawListing')" />
  </fieldset>
</template>
