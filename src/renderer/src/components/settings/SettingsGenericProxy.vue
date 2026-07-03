<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Bağlantı → Genel vekil sunucu -->
  <fieldset class="section">
    <legend>{{ $t('settings.genericProxy.title') }}</legend>
    <div class="text-body-2 mb-1">{{ $t('settings.genericProxy.typeLabel') }}</div>
    <v-radio-group v-model="draft.genericProxy.type">
      <v-radio :label="$t('settings.genericProxy.none')" value="none" />
      <v-radio :label="$t('settings.genericProxy.http')" value="http" />
      <v-radio :label="$t('settings.genericProxy.socks4')" value="socks4" />
      <v-radio :label="$t('settings.genericProxy.socks5')" value="socks5" />
    </v-radio-group>
    <div class="d-flex align-center ga-2 mt-3">
      <span class="field-label">{{ $t('settings.genericProxy.host') }}</span>
      <v-text-field
        v-model="draft.genericProxy.host"
        :disabled="draft.genericProxy.type === 'none'"
        style="max-width: 260px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.genericProxy.port') }}</span>
      <v-text-field
        v-model.number="draft.genericProxy.port"
        :disabled="draft.genericProxy.type === 'none'"
        type="number"
        style="max-width: 110px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.genericProxy.user') }}</span>
      <v-text-field
        v-model="draft.genericProxy.user"
        :disabled="draft.genericProxy.type === 'none'"
        style="max-width: 260px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.genericProxy.password') }}</span>
      <v-text-field
        v-model="draft.genericProxy.password"
        :disabled="draft.genericProxy.type === 'none'"
        type="password"
        style="max-width: 260px"
      />
    </div>
    <p class="text-caption text-medium-emphasis mt-3 mb-0">
      {{ $t('settings.genericProxy.note') }}
    </p>
  </fieldset>
</template>
