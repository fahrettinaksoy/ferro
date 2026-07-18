<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Bağlantı → FTP → Pasif kip -->
  <fieldset class="section">
    <legend>{{ $t('settings.ftpPassive.title') }}</legend>
    <p class="text-body-small text-medium-emphasis mt-0 mb-1">
      {{ $t('settings.ftpPassive.hint') }}
    </p>
    <v-radio-group v-model="draft.ftpPassive.malformedReply">
      <v-radio :label="$t('settings.ftpPassive.useServerIp')" value="use-server-ip" />
      <v-radio :label="$t('settings.ftpPassive.fallbackActive')" value="fallback-active" />
    </v-radio-group>
  </fieldset>
</template>
