<script setup lang="ts">
import type { TlsVersion } from '@renderer/stores/ui'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const tlsVersions: { value: TlsVersion; title: string }[] = [
  { value: '1.0', title: 'TLS 1.0' },
  { value: '1.1', title: 'TLS 1.1' },
  { value: '1.2', title: 'TLS 1.2' },
  { value: '1.3', title: 'TLS 1.3' }
]
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Bağlantı -->
  <fieldset class="section">
    <legend>{{ $t('settings.connection.timeoutTitle') }}</legend>
    <div class="d-flex align-center ga-2">
      <span>{{ $t('settings.connection.timeoutLabel') }}</span>
      <v-text-field
        v-model.number="draft.connection.timeoutSec"
        type="number"
        style="max-width: 90px"
      />
      <span class="text-body-small text-medium-emphasis">
        {{ $t('settings.connection.timeoutRange') }}
      </span>
    </div>
    <p class="text-body-small text-medium-emphasis mt-2 mb-0">
      {{ $t('settings.connection.timeoutHint') }}
    </p>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.connection.reconnectTitle') }}</legend>
    <div class="d-flex align-center ga-2">
      <span class="reconnect-label">{{ $t('settings.connection.maxRetries') }}</span>
      <v-text-field
        v-model.number="draft.connection.maxRetries"
        type="number"
        style="max-width: 90px"
      />
      <span class="text-body-small text-medium-emphasis">
        {{ $t('settings.connection.maxRetriesRange') }}
      </span>
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="reconnect-label">{{ $t('settings.connection.retryDelay') }}</span>
      <v-text-field
        v-model.number="draft.connection.retryDelaySec"
        type="number"
        style="max-width: 90px"
      />
      <span class="text-body-small text-medium-emphasis">
        {{ $t('settings.connection.retryDelayRange') }}
      </span>
    </div>
    <p class="text-body-small text-medium-emphasis mt-2 mb-0">
      {{ $t('settings.connection.reconnectHint') }}
    </p>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.connection.tlsTitle') }}</legend>
    <div class="d-flex align-center ga-2">
      <span>{{ $t('settings.connection.tlsMinVersion') }}</span>
      <v-select
        v-model="draft.connection.tlsMinVersion"
        :items="tlsVersions"
        style="max-width: 140px"
      />
    </div>
    <v-switch
      v-model="draft.connection.tlsUseSystemTrust"
      :label="$t('settings.connection.tlsSystemTrust')"
      class="mt-1"
    />
  </fieldset>
</template>
