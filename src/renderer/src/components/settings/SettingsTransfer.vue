<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const { t } = useI18n()

const tolerances = computed(() => [
  { value: 'low', title: t('settings.transferOpts.tolLow') },
  { value: 'normal', title: t('settings.transferOpts.tolNormal') },
  { value: 'high', title: t('settings.transferOpts.tolHigh') }
])
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Aktarım -->
  <fieldset class="section">
    <legend>{{ $t('settings.transferOpts.concurrentTitle') }}</legend>
    <div class="d-flex align-center ga-2">
      <span class="field-label">{{ $t('settings.transferOpts.concurrent') }}</span>
      <v-text-field
        v-model.number="draft.transfer.concurrentTransfers"
        type="number"
        min="1"
        max="10"
        style="max-width: 90px"
      />
      <span class="text-body-small text-medium-emphasis">
        {{ $t('settings.transferOpts.concurrentRange') }}
      </span>
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.transferOpts.concurrentDownload') }}</span>
      <v-text-field
        v-model.number="draft.transfer.concurrentDownloads"
        type="number"
        min="0"
        style="max-width: 90px"
      />
      <span class="text-body-small text-medium-emphasis">
        {{ $t('settings.transferOpts.unlimitedZero') }}
      </span>
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.transferOpts.concurrentUpload') }}</span>
      <v-text-field
        v-model.number="draft.transfer.concurrentUploads"
        type="number"
        min="0"
        style="max-width: 90px"
      />
      <span class="text-body-small text-medium-emphasis">
        {{ $t('settings.transferOpts.unlimitedZero') }}
      </span>
    </div>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.transferOpts.speedTitle') }}</legend>
    <v-switch
      v-model="draft.transfer.enableSpeedLimit"
      :label="$t('settings.transferOpts.enableSpeed')"
    />
    <div class="d-flex align-center ga-2 mt-1">
      <span class="field-label">{{ $t('settings.transferOpts.downloadLimit') }}</span>
      <v-text-field
        v-model.number="draft.transfer.downloadLimitKiB"
        type="number"
        min="0"
        :disabled="!draft.transfer.enableSpeedLimit"
        style="max-width: 110px"
      />
      <span class="text-body-small text-medium-emphasis">{{
        $t('settings.transferOpts.kibs')
      }}</span>
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.transferOpts.uploadLimit') }}</span>
      <v-text-field
        v-model.number="draft.transfer.uploadLimitKiB"
        type="number"
        min="0"
        :disabled="!draft.transfer.enableSpeedLimit"
        style="max-width: 110px"
      />
      <span class="text-body-small text-medium-emphasis">{{
        $t('settings.transferOpts.kibs')
      }}</span>
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.transferOpts.tolerance') }}</span>
      <v-select
        v-model="draft.transfer.tolerance"
        :items="tolerances"
        :disabled="!draft.transfer.enableSpeedLimit"
        style="max-width: 160px"
      />
    </div>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.transferOpts.invalidTitle') }}</legend>
    <p class="text-body-small text-medium-emphasis mt-0 mb-2">
      {{ $t('settings.transferOpts.invalidHint') }}
    </p>
    <div class="d-flex align-center ga-2">
      <v-switch
        v-model="draft.transfer.replaceInvalidChars"
        :label="$t('settings.transferOpts.replaceWith')"
      />
      <v-text-field
        v-model="draft.transfer.replacementChar"
        :disabled="!draft.transfer.replaceInvalidChars"
        maxlength="1"
        style="max-width: 60px"
      />
    </div>
    <div class="text-body-small text-medium-emphasis mt-1">
      {{ $t('settings.transferOpts.charToReplace') }}
    </div>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.transferOpts.preallocTitle') }}</legend>
    <v-switch v-model="draft.transfer.preallocate" :label="$t('settings.transferOpts.prealloc')" />
  </fieldset>
</template>
