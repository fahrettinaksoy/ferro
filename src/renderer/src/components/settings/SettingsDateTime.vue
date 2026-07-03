<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Arayüz → Tarih/saat biçimi -->
  <fieldset class="section">
    <legend>{{ $t('settings.dateTime.dateTitle') }}</legend>
    <v-radio-group v-model="draft.dateTime.dateMode">
      <v-radio :label="$t('settings.dateTime.systemDefault')" value="system" />
      <v-radio :label="$t('settings.dateTime.isoDate')" value="iso" />
      <v-radio :label="$t('settings.dateTime.custom')" value="custom" />
      <div class="d-flex align-center ga-2 ms-8">
        <v-text-field
          v-model="draft.dateTime.dateCustom"
          :disabled="draft.dateTime.dateMode !== 'custom'"
          style="max-width: 160px"
        />
        <span class="text-caption text-medium-emphasis">{{
          $t('settings.dateTime.dateExample')
        }}</span>
      </div>
    </v-radio-group>
  </fieldset>
  <fieldset class="section">
    <legend>{{ $t('settings.dateTime.timeTitle') }}</legend>
    <v-radio-group v-model="draft.dateTime.timeMode">
      <v-radio :label="$t('settings.dateTime.systemDefault')" value="system" />
      <v-radio :label="$t('settings.dateTime.isoTime')" value="iso" />
      <v-radio :label="$t('settings.dateTime.custom')" value="custom" />
      <div class="d-flex align-center ga-2 ms-8">
        <v-text-field
          v-model="draft.dateTime.timeCustom"
          :disabled="draft.dateTime.timeMode !== 'custom'"
          style="max-width: 160px"
        />
        <span class="text-caption text-medium-emphasis">{{
          $t('settings.dateTime.timeExample')
        }}</span>
      </div>
    </v-radio-group>
  </fieldset>
  <p class="text-caption text-primary mb-0">{{ $t('settings.dateTime.moreInfo') }}</p>
</template>
