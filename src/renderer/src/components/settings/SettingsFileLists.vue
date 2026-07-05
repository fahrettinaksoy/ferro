<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const { t } = useI18n()

const sortModeOptions = computed(() => [
  { value: 'dirs-first', title: t('settings.fileLists.sortDirsFirst') },
  { value: 'files-first', title: t('settings.fileLists.sortFilesFirst') },
  { value: 'mixed', title: t('settings.fileLists.sortMixed') }
])
const nameSortOptions = computed(() => [
  { value: 'case-sensitive', title: t('settings.fileLists.nameCaseSensitive') },
  { value: 'case-insensitive', title: t('settings.fileLists.nameCaseInsensitive') },
  { value: 'natural', title: t('settings.fileLists.nameNatural') }
])
const dblFileOptions = computed(() => [
  { value: 'transfer', title: t('settings.fileLists.dblTransfer') },
  { value: 'view-edit', title: t('settings.fileLists.dblViewEdit') },
  { value: 'none', title: t('settings.fileLists.dblNone') }
])
const dblDirOptions = computed(() => [
  { value: 'open', title: t('settings.fileLists.dblOpen') },
  { value: 'none', title: t('settings.fileLists.dblNone') }
])
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Arayüz → Dosya listeleri -->
  <fieldset class="section">
    <legend>{{ $t('settings.fileLists.sortTitle') }}</legend>
    <div class="d-flex align-center ga-2">
      <span class="field-label">{{ $t('settings.fileLists.sortMode') }}</span>
      <v-select
        v-model="draft.fileLists.sortMode"
        :items="sortModeOptions"
        style="max-width: 320px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.fileLists.nameSort') }}</span>
      <v-select
        v-model="draft.fileLists.nameSort"
        :items="nameSortOptions"
        style="max-width: 320px"
      />
    </div>
  </fieldset>
  <fieldset class="section">
    <legend>{{ $t('settings.fileLists.compareTitle') }}</legend>
    <p class="text-body-small text-medium-emphasis mt-0 mb-2">
      {{ $t('settings.fileLists.compareHint') }}
    </p>
    <div class="d-flex align-center ga-2">
      <span class="field-label">{{ $t('settings.fileLists.compareThreshold') }}</span>
      <v-text-field
        v-model.number="draft.fileLists.compareThresholdMin"
        type="number"
        min="0"
        style="max-width: 90px"
      />
    </div>
  </fieldset>
  <fieldset class="section">
    <legend>{{ $t('settings.fileLists.dblTitle') }}</legend>
    <div class="d-flex align-center ga-2">
      <span class="field-label">{{ $t('settings.fileLists.dblFile') }}</span>
      <v-select
        v-model="draft.fileLists.dblClickFile"
        :items="dblFileOptions"
        style="max-width: 280px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.fileLists.dblDir') }}</span>
      <v-select
        v-model="draft.fileLists.dblClickDir"
        :items="dblDirOptions"
        style="max-width: 280px"
      />
    </div>
  </fieldset>
</template>
