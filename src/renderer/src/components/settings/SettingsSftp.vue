<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- Bağlantı → SFTP -->
  <fieldset class="section">
    <legend>{{ $t('settings.sftp.title') }}</legend>
    <p class="text-body-small text-medium-emphasis mt-0 mb-2">
      {{ $t('settings.sftp.hint') }}
    </p>
    <div class="text-body-medium mb-1">{{ $t('settings.sftp.keysLabel') }}</div>
    <v-table class="key-table">
      <thead>
        <tr>
          <th>{{ $t('settings.sftp.colFile') }}</th>
          <th>{{ $t('settings.sftp.colComment') }}</th>
          <th>{{ $t('settings.sftp.colType') }}</th>
          <th>{{ $t('settings.sftp.colFingerprint') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(k, i) in draft.sftp.keys" :key="i">
          <td>{{ k.path }}</td>
          <td>{{ k.comment }}</td>
          <td>{{ k.type }}</td>
          <td class="font-monospace text-body-small">{{ k.fingerprint }}</td>
        </tr>
        <tr v-if="!draft.sftp.keys.length">
          <td colspan="4" class="pa-0">
            <v-empty-state icon="mdi-key-outline" :text="$t('settings.sftp.empty')" size="32" />
          </td>
        </tr>
      </tbody>
    </v-table>
    <div class="d-flex ga-2 mt-2">
      <v-btn variant="outlined" size="small" disabled prepend-icon="mdi-key-plus">
        {{ $t('settings.sftp.addKey') }}
      </v-btn>
      <v-btn variant="outlined" size="small" disabled prepend-icon="mdi-key-remove">
        {{ $t('settings.sftp.removeKey') }}
      </v-btn>
    </div>
    <p class="text-body-small text-medium-emphasis mt-3 mb-0">
      {{ $t('settings.sftp.sshAgentHint') }}
    </p>
  </fieldset>
</template>
