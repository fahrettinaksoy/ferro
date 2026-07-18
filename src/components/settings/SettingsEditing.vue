<script setup lang="ts">
import { invoke } from '@renderer/lib/ipc'
import type { Draft } from './types'

const props = defineProps<{ draft: Draft }>()

async function browseEditor(): Promise<void> {
  const { path } = await invoke('settings:pickEditor', undefined)
  // eslint-disable-next-line vue/no-mutating-props -- draft parent'a ait reaktif taslak; alanları düzenlenir
  if (path) props.draft.editing.customEditorPath = path
}
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Dosya düzenleme -->
  <fieldset class="section">
    <legend>{{ $t('settings.editing.defaultTitle') }}</legend>
    <v-radio-group v-model="draft.editing.defaultEditor">
      <v-radio :label="$t('settings.editing.none')" value="none" />
      <v-radio :label="$t('settings.editing.system')" value="system" />
      <v-radio :label="$t('settings.editing.custom')" value="custom" />
    </v-radio-group>
    <div class="d-flex align-center ga-2 ms-8 mt-1">
      <v-text-field
        v-model="draft.editing.customEditorPath"
        :disabled="draft.editing.defaultEditor !== 'custom'"
        style="max-width: 320px"
      />
      <v-btn
        variant="outlined"
        size="small"
        :disabled="draft.editing.defaultEditor !== 'custom'"
        @click="browseEditor"
      >
        {{ $t('settings.editing.browse') }}
      </v-btn>
    </div>
    <p class="text-body-small text-medium-emphasis ms-8 mt-1 mb-0">
      {{ $t('settings.editing.quoteHint') }}
      <span class="text-primary">{{ $t('settings.editing.quoteRules') }}</span>
    </p>
  </fieldset>
  <fieldset class="section">
    <v-radio-group v-model="draft.editing.associationMode">
      <v-radio :label="$t('settings.editing.useAssoc')" value="use-associations" />
      <v-radio :label="$t('settings.editing.alwaysDefault')" value="always-default" />
    </v-radio-group>
  </fieldset>
  <v-switch v-model="draft.editing.watchChanges" :label="$t('settings.editing.watchChanges')" />
</template>
