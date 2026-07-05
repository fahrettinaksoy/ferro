<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Bağlantı → FTP → FTP vekil sunucusu -->
  <fieldset class="section">
    <legend>{{ $t('settings.ftpProxy.title') }}</legend>
    <div class="text-body-medium mb-1">{{ $t('settings.ftpProxy.typeLabel') }}</div>
    <v-radio-group v-model="draft.ftpProxy.type">
      <v-radio :label="$t('settings.ftpProxy.none')" value="none" />
      <v-radio label="USER@HOST" value="user-host" />
      <v-radio label="SITE" value="site" />
      <v-radio label="OPEN" value="open" />
      <v-radio :label="$t('settings.ftpProxy.custom')" value="custom" />
    </v-radio-group>
    <v-textarea
      v-model="draft.ftpProxy.customFormat"
      :disabled="draft.ftpProxy.type !== 'custom'"
      rows="4"
      class="mt-2"
    />
    <div class="text-body-small text-medium-emphasis mt-2">
      <div class="font-weight-medium">{{ $t('settings.ftpProxy.specifiers') }}</div>
      <div class="font-monospace">{{ $t('settings.ftpProxy.spec1') }}</div>
      <div class="font-monospace">{{ $t('settings.ftpProxy.spec2') }}</div>
      <div class="font-monospace">{{ $t('settings.ftpProxy.spec3') }}</div>
    </div>
    <div class="d-flex align-center ga-2 mt-3">
      <span class="field-label">{{ $t('settings.ftpProxy.host') }}</span>
      <v-text-field
        v-model="draft.ftpProxy.host"
        :disabled="draft.ftpProxy.type === 'none'"
        style="max-width: 220px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.ftpProxy.user') }}</span>
      <v-text-field
        v-model="draft.ftpProxy.user"
        :disabled="draft.ftpProxy.type === 'none'"
        style="max-width: 220px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.ftpProxy.password') }}</span>
      <v-text-field
        v-model="draft.ftpProxy.password"
        :disabled="draft.ftpProxy.type === 'none'"
        type="password"
        style="max-width: 220px"
      />
    </div>
    <p class="text-body-small text-medium-emphasis mt-3 mb-0">
      {{ $t('settings.ftpProxy.note') }}
    </p>
  </fieldset>
</template>
