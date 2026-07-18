<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useVaultStore } from '@renderer/stores/vault'

// Açılışta: kimlik deposu master modda ve kilitliyse parolayı sorar. Kullanıcı
// "Sonra" derse sekmelerde bağlanırken parola yine sorulur (kilit açılmaz).
const vault = useVaultStore()
const password = ref('')
const error = ref(false)
const open = computed(() => vault.loaded && vault.mode === 'master' && vault.locked)

onMounted(() => {
  if (!vault.loaded) void vault.refresh().catch(() => undefined)
})

async function submit(): Promise<void> {
  error.value = false
  const ok = await vault.unlock(password.value).catch(() => false)
  if (ok) password.value = ''
  else error.value = true
}
</script>

<template>
  <v-dialog :model-value="open" max-width="440" persistent>
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-lock" color="primary" />
        {{ $t('vaultUnlock.title') }}
      </v-card-title>
      <v-card-text>
        <p class="mb-3">{{ $t('vaultUnlock.intro') }}</p>
        <v-text-field
          v-model="password"
          type="password"
          autofocus
          :label="$t('vaultUnlock.password')"
          :error="error"
          :error-messages="error ? $t('vaultUnlock.failed') : undefined"
          @keyup.enter="submit"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="vault.locked = false">{{ $t('vaultUnlock.later') }}</v-btn>
        <v-btn color="primary" :disabled="!password" @click="submit">
          {{ $t('vaultUnlock.unlock') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
