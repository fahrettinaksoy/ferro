<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const { t } = useI18n()

const fileExistsActions = computed(() => [
  { value: 'ask', title: t('settings.fileExists.actAsk') },
  { value: 'overwrite', title: t('settings.fileExists.actOverwrite') },
  { value: 'overwrite-newer', title: t('settings.fileExists.actOverwriteNewer') },
  { value: 'overwrite-size', title: t('settings.fileExists.actOverwriteSize') },
  { value: 'resume', title: t('settings.fileExists.actResume') },
  { value: 'rename', title: t('settings.fileExists.actRename') },
  { value: 'skip', title: t('settings.fileExists.actSkip') }
])
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Aktarım → Dosya var işlemi -->
  <p class="text-body-2 mt-0 mb-3">{{ $t('settings.fileExists.intro') }}</p>
  <fieldset class="section">
    <legend>{{ $t('settings.fileExists.defaultTitle') }}</legend>
    <div class="d-flex align-center ga-2">
      <span class="field-label">{{ $t('settings.fileExists.download') }}</span>
      <v-select
        v-model="draft.fileExists.download"
        :items="fileExistsActions"
        style="max-width: 280px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.fileExists.upload') }}</span>
      <v-select
        v-model="draft.fileExists.upload"
        :items="fileExistsActions"
        style="max-width: 280px"
      />
    </div>
  </fieldset>
  <p class="text-caption text-medium-emphasis">{{ $t('settings.fileExists.timeHint') }}</p>
  <v-switch v-model="draft.fileExists.asciiResume" :label="$t('settings.fileExists.asciiResume')" />
  <p class="text-caption text-medium-emphasis mt-1 mb-0">
    {{ $t('settings.fileExists.asciiResumeHint') }}
  </p>
</template>
