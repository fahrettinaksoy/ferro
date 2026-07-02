<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSitesStore } from '@renderer/stores/sites'

/**
 * "Parola sorulsun" siteleri için bağlanma anında açılan parola diyaloğu
 * (FileZilla'nın "Parolayı yazın" penceresinin karşılığı). Parola kaydedilmez;
 * "hatırlansın" işaretliyse yalnızca uygulama kapanana dek bellekte tutulur.
 */
const sites = useSitesStore()

const password = ref('')
const remember = ref(true)

// Diyalog her açılışta temiz başlar (hatırlama tercihi varsayılan işaretli).
watch(
  () => sites.passwordPrompt,
  (site) => {
    if (site) {
      password.value = ''
      remember.value = true
    }
  }
)

function submit(): void {
  sites.resolvePassword({ password: password.value, remember: remember.value })
}
function cancel(): void {
  sites.resolvePassword(null)
}
</script>

<template>
  <v-dialog
    :model-value="!!sites.passwordPrompt"
    max-width="440"
    persistent
    @update:model-value="cancel()"
  >
    <v-card v-if="sites.passwordPrompt">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-form-textbox-password" />
        {{ $t('pwPrompt.title') }}
      </v-card-title>
      <v-card-text>
        <p class="mb-3">{{ $t('pwPrompt.intro') }}</p>
        <div class="info-grid mb-3">
          <span class="text-medium-emphasis">{{ $t('pwPrompt.name') }}</span>
          <span>{{ sites.passwordPrompt.name }}</span>
          <span class="text-medium-emphasis">{{ $t('pwPrompt.server') }}</span>
          <span>{{ sites.passwordPrompt.host }}:{{ sites.passwordPrompt.port }}</span>
          <span class="text-medium-emphasis">{{ $t('pwPrompt.user') }}</span>
          <span>{{ sites.passwordPrompt.user }}</span>
        </div>
        <v-text-field
          v-model="password"
          :label="$t('connect.password')"
          type="password"
          autofocus
          hide-details
          @keyup.enter="submit()"
        />
        <v-checkbox v-model="remember" :label="$t('pwPrompt.remember')" hide-details class="mt-1" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="cancel()">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="flat" @click="submit()">{{ $t('common.ok') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.info-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 24px;
  row-gap: 4px;
}
</style>
