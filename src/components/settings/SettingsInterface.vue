<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const { t } = useI18n()

const layoutOptions = computed(() => [
  { value: 'classic', title: t('settings.iface.layoutClassic') },
  { value: 'explorer', title: t('settings.iface.layoutExplorer') },
  { value: 'side-by-side', title: t('settings.iface.layoutSideBySide') },
  { value: 'top-bottom', title: t('settings.iface.layoutTopBottom') }
])
const msgLogOptions = computed(() => [
  { value: 'above-panes', title: t('settings.iface.msgLogAbove') },
  { value: 'as-tab', title: t('settings.iface.msgLogTab') },
  { value: 'hidden', title: t('settings.iface.msgLogHidden') }
])
const newConnOptions = computed(() => [
  { value: 'ask', title: t('settings.iface.newConnAsk') },
  { value: 'new-tab', title: t('settings.iface.newConnNewTab') },
  { value: 'current-tab', title: t('settings.iface.newConnCurrentTab') }
])
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Arayüz (üst sayfa) -->
  <fieldset class="section">
    <legend>{{ $t('settings.iface.layoutTitle') }}</legend>
    <div class="d-flex align-center ga-2">
      <span class="field-label">{{ $t('settings.iface.layoutLabel') }}</span>
      <v-select v-model="draft.iface.layout" :items="layoutOptions" style="max-width: 240px" />
    </div>
    <div class="d-flex align-center ga-2 mt-2">
      <span class="field-label">{{ $t('settings.iface.msgLogLabel') }}</span>
      <v-select
        v-model="draft.iface.messageLogPos"
        :items="msgLogOptions"
        style="max-width: 320px"
      />
    </div>
    <v-switch
      v-model="draft.iface.swapPanes"
      :label="$t('settings.iface.swapPanes')"
      class="mt-1"
    />
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.iface.behaviourTitle') }}</legend>
    <v-switch v-model="draft.iface.preventSleep" :label="$t('settings.iface.preventSleep')" />
    <div class="text-body-medium mt-2 mb-1">{{ $t('settings.iface.startupLabel') }}</div>
    <v-radio-group v-model="draft.iface.onStartup">
      <v-radio :label="$t('settings.iface.startupNormal')" value="normal" />
      <v-radio :label="$t('settings.iface.startupSiteManager')" value="site-manager" />
      <v-radio :label="$t('settings.iface.startupRestore')" value="restore-tabs" />
    </v-radio-group>
    <div class="text-body-medium mt-2 mb-1">{{ $t('settings.iface.newConnLabel') }}</div>
    <v-select
      v-model="draft.iface.newConnWhileConnected"
      :items="newConnOptions"
      style="max-width: 320px"
    />
    <v-switch
      v-model="draft.iface.forceRefreshOnSubfolderOps"
      :label="$t('settings.iface.forceRefresh')"
      class="mt-1"
    />
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.iface.queueTitle') }}</legend>
    <v-switch v-model="draft.iface.showInstantRate" :label="$t('settings.iface.showInstantRate')" />
  </fieldset>
</template>
