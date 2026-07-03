<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const { t } = useI18n()

const updateFreqOptions = computed(() => [
  { value: 'daily', title: t('settings.updates.freqDaily') },
  { value: 'weekly', title: t('settings.updates.freqWeekly') },
  { value: 'never', title: t('settings.updates.freqNever') }
])
const updateChannelOptions = computed(() => [
  { value: 'stable', title: t('settings.updates.chStable') },
  { value: 'beta', title: t('settings.updates.chBeta') },
  { value: 'nightly', title: t('settings.updates.chNightly') }
])
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Güncelleme -->
  <fieldset class="section">
    <legend>{{ $t('settings.updates.title') }}</legend>
    <div class="mb-1">{{ $t('settings.updates.frequency') }}</div>
    <v-select
      v-model="draft.updates.checkFrequency"
      :items="updateFreqOptions"
      style="max-width: 240px"
    />
    <div class="mt-3 mb-1">{{ $t('settings.updates.channel') }}</div>
    <v-select
      v-model="draft.updates.channel"
      :items="updateChannelOptions"
      style="max-width: 320px"
    />
    <p class="text-caption text-medium-emphasis mt-2 mb-0">
      {{ $t('settings.updates.recommendation') }}
    </p>
  </fieldset>
  <div class="text-center my-3">
    <v-btn variant="outlined" size="small" disabled prepend-icon="mdi-update">
      {{ $t('settings.updates.checkNow') }}
    </v-btn>
  </div>
  <p class="text-caption text-medium-emphasis mb-1">
    {{ $t('settings.updates.privacyHint') }}
  </p>
  <p class="text-caption text-primary mb-0">{{ $t('settings.updates.privacyPolicy') }}</p>
</template>
