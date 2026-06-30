<script setup lang="ts">
import { useTheme } from 'vuetify'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import SettingsDialog from '@renderer/components/SettingsDialog.vue'

// Tema state'i uygulama kökünde uygulanır (v-app burada).
const ui = useUiStore()
const { theme } = storeToRefs(ui)
const vTheme = useTheme()
watch(theme, (t) => vTheme.change(t), { immediate: true })
</script>

<template>
  <v-app>
    <router-view />
    <!-- Sağdan açılan, her şeyin üzerine gelen genel panel(ler) -->
    <SettingsDialog />
  </v-app>
</template>

<style>
/* Masaüstü için sistem yazı tipi yığını (SASS $body-font-family yerine — bkz.
   vite.config: configFile devre dışı). Vuetify stilleri @layer içinde olduğundan
   bu katmansız kural önceliklidir. */
.v-application {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
</style>
