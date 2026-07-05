<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@renderer/stores/vault'
import { useToastStore, errText } from '@renderer/stores/toast'
import type { Draft } from './types'

defineProps<{ draft: Draft }>()

const { t } = useI18n()
const vault = useVaultStore()
const toast = useToastStore()

// Master parola alanları — kalıcı saklanmaz; durum parent'ta tutulur (defineModel)
// ki sayfalar arasında gezinirken kaybolmasın.
const masterPw = defineModel<string>('masterPw', { required: true })
const masterPwConfirm = defineModel<string>('masterPwConfirm', { required: true })
const currentPw = defineModel<string>('currentMasterPw', { required: true })

onMounted(() => {
  if (!vault.loaded) void vault.refresh().catch(() => undefined)
})

async function applyMaster(): Promise<void> {
  if (masterPw.value !== masterPwConfirm.value) {
    toast.error(t('settings.passwords.mismatch'))
    return
  }
  if (!masterPw.value) return
  try {
    await vault.setMaster(masterPw.value, vault.hasMaster ? currentPw.value : undefined)
    toast.success(t('settings.passwords.masterSet'))
    masterPw.value = ''
    masterPwConfirm.value = ''
    currentPw.value = ''
  } catch (err) {
    toast.error(errText(err))
  }
}

async function switchToOs(): Promise<void> {
  try {
    await vault.useOsKeychain(currentPw.value)
    toast.success(t('settings.passwords.switchedOs'))
    currentPw.value = ''
  } catch (err) {
    toast.error(errText(err))
  }
}
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- draft, parent'a ait reaktif taslak nesnesidir; alanları burada doğrudan düzenlenir -->
  <!-- Arayüz → Parolalar -->
  <fieldset class="section">
    <legend>{{ $t('settings.pages.passwords') }}</legend>
    <v-radio-group v-model="draft.passwords.mode">
      <v-radio :label="$t('settings.passwords.save')" value="save" />
      <v-radio :label="$t('settings.passwords.dontSave')" value="dont-save" />
      <v-radio :label="$t('settings.passwords.master')" value="master" />
    </v-radio-group>

    <div v-if="draft.passwords.mode === 'master'" class="mt-2">
      <v-alert v-if="vault.hasMaster" type="info" variant="tonal" density="compact" class="mb-3">
        {{ $t('settings.passwords.masterActive') }}
      </v-alert>

      <div v-if="vault.hasMaster" class="d-flex align-center ga-2 mb-2">
        <span class="field-label">{{ $t('settings.passwords.currentMasterPw') }}</span>
        <v-text-field v-model="currentPw" type="password" style="max-width: 280px" />
      </div>

      <div class="d-flex align-center ga-2">
        <span class="field-label">{{ $t('settings.passwords.masterPw') }}</span>
        <v-text-field v-model="masterPw" type="password" style="max-width: 280px" />
      </div>
      <div class="d-flex align-center ga-2 mt-2">
        <span class="field-label">{{ $t('settings.passwords.masterPwConfirm') }}</span>
        <v-text-field v-model="masterPwConfirm" type="password" style="max-width: 280px" />
      </div>

      <div class="d-flex ga-2 mt-3">
        <v-btn color="primary" size="small" :disabled="!masterPw" @click="applyMaster">
          {{
            vault.hasMaster
              ? $t('settings.passwords.changeMaster')
              : $t('settings.passwords.setMaster')
          }}
        </v-btn>
        <v-btn v-if="vault.hasMaster" variant="outlined" size="small" @click="switchToOs">
          {{ $t('settings.passwords.useOsKeychain') }}
        </v-btn>
      </div>

      <p class="text-body-small text-warning mt-2 mb-0">
        {{ $t('settings.passwords.masterWarning') }}
      </p>
    </div>
  </fieldset>
</template>
