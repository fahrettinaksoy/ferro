<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir */
import type { Draft } from './types'

const props = defineProps<{ draft: Draft }>()

// ASCII uzantı listesi etkileşimi — metin kutusu/seçim durumu parent'ta tutulur
// (sayfa değişince kaybolmasın), draft üzerinde burada değiştirilir.
const newExt = defineModel<string>('newExt', { required: true })
const selectedExt = defineModel<string | null>('selectedExt', { required: true })

function addExt(): void {
  const e = newExt.value.trim().replace(/^\./, '').toLowerCase()
  if (e && !props.draft.transferTypes.asciiExtensions.includes(e)) {
    props.draft.transferTypes.asciiExtensions.push(e)
    props.draft.transferTypes.asciiExtensions.sort()
    selectedExt.value = e
  }
  newExt.value = ''
}
function removeExt(): void {
  if (!selectedExt.value) return
  const i = props.draft.transferTypes.asciiExtensions.indexOf(selectedExt.value)
  if (i >= 0) props.draft.transferTypes.asciiExtensions.splice(i, 1)
  selectedExt.value = null
}
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Aktarım → FTP: Dosya türleri -->
  <fieldset class="section">
    <legend>{{ $t('settings.transferTypes.defaultTitle') }}</legend>
    <v-radio-group v-model="draft.transferTypes.defaultType">
      <v-radio :label="$t('settings.transferTypes.auto')" value="auto" />
      <v-radio :label="$t('settings.transferTypes.ascii')" value="ascii" />
      <v-radio :label="$t('settings.transferTypes.binary')" value="binary" />
    </v-radio-group>
  </fieldset>

  <fieldset class="section">
    <legend>{{ $t('settings.transferTypes.autoTitle') }}</legend>
    <div class="text-body-medium mb-1">{{ $t('settings.transferTypes.asciiListLabel') }}</div>
    <div class="d-flex ga-3">
      <div class="ext-list">
        <v-list density="compact" nav>
          <v-list-item
            v-for="ext in draft.transferTypes.asciiExtensions"
            :key="ext"
            :active="selectedExt === ext"
            :title="ext"
            @click="selectedExt = ext"
          />
        </v-list>
      </div>
      <div class="d-flex flex-column ga-2" style="width: 160px">
        <div class="d-flex flex-column ga-1">
          <v-text-field v-model="newExt" @keyup.enter="addExt()" />
          <v-btn variant="outlined" size="small" :disabled="!newExt.trim()" @click="addExt()">
            {{ $t('settings.transferTypes.add') }}
          </v-btn>
          <v-btn variant="outlined" size="small" :disabled="!selectedExt" @click="removeExt()">
            {{ $t('settings.transferTypes.remove') }}
          </v-btn>
        </div>
        <p class="text-body-small text-medium-emphasis mb-0">
          {{ $t('settings.transferTypes.malformedHint') }}
        </p>
      </div>
    </div>
    <v-switch
      v-model="draft.transferTypes.noExtAsAscii"
      :label="$t('settings.transferTypes.noExt')"
      class="mt-2"
    />
    <v-switch
      v-model="draft.transferTypes.dotfilesAsAscii"
      :label="$t('settings.transferTypes.dotfiles')"
    />
    <p class="text-body-small text-medium-emphasis mt-1 mb-0">
      {{ $t('settings.transferTypes.dotfilesNote') }}
    </p>
  </fieldset>
</template>
