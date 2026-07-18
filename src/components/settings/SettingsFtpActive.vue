<script setup lang="ts">
import type { Draft } from './types'

defineProps<{ draft: Draft }>()
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Bağlantı → FTP → Aktif kip -->
  <fieldset class="section">
    <legend>{{ $t('settings.ftpActive.portTitle') }}</legend>
    <v-switch v-model="draft.ftpActive.limitPorts" :label="$t('settings.ftpActive.limitPorts')" />
    <p class="text-body-small text-medium-emphasis mt-1 mb-2">
      {{ $t('settings.ftpActive.limitHint') }}
    </p>
    <div class="d-flex align-center ga-2">
      <span class="field-label">{{ $t('settings.ftpActive.portMin') }}</span>
      <v-text-field
        v-model.number="draft.ftpActive.portMin"
        type="number"
        :disabled="!draft.ftpActive.limitPorts"
        style="max-width: 110px"
      />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.ftpActive.portMax') }}</span>
      <v-text-field
        v-model.number="draft.ftpActive.portMax"
        type="number"
        :disabled="!draft.ftpActive.limitPorts"
        style="max-width: 110px"
      />
    </div>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.ftpActive.ipTitle') }}</legend>
    <p class="text-body-small text-medium-emphasis mt-0 mb-1">
      {{ $t('settings.ftpActive.ipHint') }}
    </p>
    <v-radio-group v-model="draft.ftpActive.externalIpMode">
      <v-radio :label="$t('settings.ftpActive.ipAskOs')" value="ask-os" />
      <v-radio :label="$t('settings.ftpActive.ipFixed')" value="fixed" />
      <v-text-field
        v-model="draft.ftpActive.fixedIp"
        :disabled="draft.ftpActive.externalIpMode !== 'fixed'"
        class="ms-8"
        style="max-width: 220px"
      />
      <p class="text-body-small text-medium-emphasis ms-8 mt-1 mb-1">
        {{ $t('settings.ftpActive.ipFixedHint') }}
      </p>
      <v-radio :label="$t('settings.ftpActive.ipUrl')" value="url" />
      <v-text-field
        v-model="draft.ftpActive.ipUrl"
        placeholder="http://ip.filezilla-project.org/ip.php"
        :disabled="draft.ftpActive.externalIpMode !== 'url'"
        class="ms-8"
        style="max-width: 320px"
      />
      <p class="text-body-small text-medium-emphasis ms-8 mt-1 mb-0">
        {{ $t('settings.ftpActive.ipUrlDefault') }}
      </p>
    </v-radio-group>
    <v-switch
      v-model="draft.ftpActive.noExternalIpForLocal"
      :label="$t('settings.ftpActive.noExternalForLocal')"
      :disabled="draft.ftpActive.externalIpMode === 'ask-os'"
      class="mt-1"
    />
  </fieldset>
</template>
