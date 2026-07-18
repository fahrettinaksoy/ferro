<script setup lang="ts">
import { computed } from 'vue'
import { formatSize } from '@renderer/lib/format'
import type { Draft } from './types'

const props = defineProps<{ draft: Draft }>()

// Boyut biçimi örnek önizlemesi — gerçek formatSize ile, taslaktaki tercihlerle
// (önizleme seçilen biçimi birebir yansıtır; locale UI dilini izler).
const sizeExamples = computed(() => {
  const nums = [12, 100, 1234, 1058817, 123456789, 63674225613426]
  return nums.map((n) => formatSize(n, props.draft.fileSize))
})
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Arayüz → Dosya boyutu biçimi -->
  <fieldset class="section">
    <legend>{{ $t('settings.fileSize.title') }}</legend>
    <v-radio-group v-model="draft.fileSize.format">
      <v-radio :label="$t('settings.fileSize.bytes')" value="bytes" />
      <v-radio :label="$t('settings.fileSize.iec')" value="iec" />
      <v-radio :label="$t('settings.fileSize.siBinary')" value="si-binary" />
      <v-radio :label="$t('settings.fileSize.siDecimal')" value="si-decimal" />
    </v-radio-group>
    <v-switch
      v-model="draft.fileSize.thousandsSep"
      :label="$t('settings.fileSize.thousandsSep')"
      class="mt-1"
    />
    <div class="d-flex align-center ga-2 mt-1">
      <span class="field-label">{{ $t('settings.fileSize.decimals') }}</span>
      <v-text-field
        v-model.number="draft.fileSize.decimalPlaces"
        type="number"
        min="0"
        max="3"
        :disabled="draft.fileSize.format === 'bytes'"
        style="max-width: 90px"
      />
    </div>
  </fieldset>
  <fieldset class="section">
    <legend>{{ $t('settings.fileSize.examplesTitle') }}</legend>
    <div class="text-right font-monospace">
      <div v-for="(ex, i) in sizeExamples" :key="i">{{ ex }}</div>
    </div>
  </fieldset>
</template>
