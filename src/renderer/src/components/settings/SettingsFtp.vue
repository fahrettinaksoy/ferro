<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Bağlantı → FTP -->
  <fieldset class="section">
    <legend>{{ $t('settings.ftp.generalTitle') }}</legend>
    <p class="text-body-small text-medium-emphasis mt-0 mb-2">
      {{ $t('settings.ftp.generalHint') }}
    </p>
    <v-btn variant="outlined" size="small" disabled prepend-icon="mdi-cog-sync">
      {{ $t('settings.ftp.wizardBtn') }}
    </v-btn>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.ftp.modeTitle') }}</legend>
    <v-radio-group v-model="draft.ftp.transferMode">
      <v-radio :label="$t('settings.ftp.passive')" value="passive" />
      <v-radio :label="$t('settings.ftp.active')" value="active" />
    </v-radio-group>
    <v-switch
      v-model="draft.ftp.fallbackOnFailure"
      :label="$t('settings.ftp.fallback')"
      class="mt-1"
    />
    <p class="text-body-small text-medium-emphasis mt-2 mb-0">
      {{ $t('settings.ftp.modeHint') }}
    </p>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.ftp.keepAliveTitle') }}</legend>
    <v-switch v-model="draft.ftp.keepAlive" :label="$t('settings.ftp.keepAlive')" />
    <p class="text-body-small text-medium-emphasis mt-2 mb-0">
      {{ $t('settings.ftp.keepAliveHint') }}
    </p>
  </fieldset>
</template>
