<script setup lang="ts">
import { useTheme } from 'vuetify'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useToastStore, type ToastColor, type ToastMessage } from '@renderer/stores/toast'
import { applyThemes, applyFonts } from '@renderer/lib/theme'
import SettingsDialog from '@renderer/components/SettingsDialog.vue'
import AboutDialog from '@renderer/components/AboutDialog.vue'
import MasterUnlockDialog from '@renderer/components/MasterUnlockDialog.vue'
import MainView from '@renderer/views/MainView.vue'

// Tema state'i uygulama kökünde uygulanır (v-app burada).
const ui = useUiStore()
const { theme, themeSeed, themeScheme, fonts } = storeToRefs(ui)
const vTheme = useTheme()

// Aktif tema (mode + kontrast) değişince uygula.
watch(theme, (t) => vTheme.change(t), { immediate: true })

// Kaynak renk / şema değişince 6 temayı yeniden üret ve canlı uygula.
watch(
  [themeSeed, themeScheme],
  () => applyThemes(vTheme.themes.value, ui.themeSeed, ui.themeScheme),
  { immediate: true }
)

// Yazı tipleri değişince (başlık/gövde/kök boyut) uygula.
watch(fonts, (f) => applyFonts(f), { immediate: true, deep: true })

// Global bildirim kuyruğu (oluşturma/kaydetme/silme/bağlantı vb.).
const toast = useToastStore()

// Bildirim rengine göre ikon (mesaj nesnesinde extra prop tutmamak için slot'ta türetilir).
const TOAST_ICON: Record<ToastColor, string> = {
  success: '$success',
  error: '$error',
  warning: '$warning',
  info: '$info'
}
function toastIcon(item: unknown): string {
  return TOAST_ICON[(item as ToastMessage).color] ?? '$info'
}
function toastText(item: unknown): string {
  return (item as ToastMessage).text
}
</script>

<template>
  <v-app>
    <!-- Tek görünümlü uygulama: router gereksizdi, MainView doğrudan çizilir. -->
    <MainView />
    <!-- Sağdan açılan, her şeyin üzerine gelen genel panel(ler) -->
    <SettingsDialog />
    <!-- Uygulama menüsü "Hakkında" ile açılır (app:showAbout). -->
    <AboutDialog />
    <!-- Kimlik deposu master modda kilitliyse açılışta parola sorar. -->
    <MasterUnlockDialog />

    <!-- Global bildirim kuyruğu: tüm CRUD/bağlantı işlemleri buraya düşer.
         İkon, mesajın color'ından #text slot'unda türetilir (extra prop yok). -->
    <v-snackbar-queue v-model="toast.messages" location="bottom right" closable>
      <template #text="{ item }">
        <span class="d-inline-flex align-center">
          <v-icon :icon="toastIcon(item)" size="small" class="mr-2" />
          {{ toastText(item) }}
        </span>
      </template>
    </v-snackbar-queue>
  </v-app>
</template>

<style>
/* Yazı tipleri Ayarlar → Temalar'dan gelen CSS değişkenleriyle sürülür
   (applyFonts). Değişken yoksa masaüstü sistem yığınına düşer. Vuetify stilleri
   @layer içinde olduğundan bu katmansız kurallar önceliklidir. */
.v-application {
  font-family: var(
    --ferro-font-body,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif
  );
}
.v-application :is(h1, h2, h3, h4, h5, h6),
.v-application :is(.text-h1, .text-h2, .text-h3, .text-h4, .text-h5, .text-h6),
.v-application :is(.text-subtitle-1, .text-subtitle-2) {
  font-family: var(--ferro-font-heading, var(--ferro-font-body, inherit));
}
/* M3 tonal yüzey kabı: paneller sınır çizgisiyle değil, zeminden bir ton açık
   kap rengi (surface-container-low) ve 12px köşeyle ayrışır. */
.m3-surface {
  background: rgb(var(--v-theme-surface-container-low)) !important;
  border-radius: 12px;
  overflow: hidden;
}
/* Tooltip: M3 ters yüzey (inverse-surface) — açık temada koyu, koyu temada açık
   balon; zemin/yazı çifti aynı rolden geldiği için her temada okunur kalır. */
.v-tooltip > .v-overlay__content {
  background: rgb(var(--v-theme-inverse-surface)) !important;
  color: rgb(var(--v-theme-inverse-on-surface)) !important;
  font-size: 0.75rem;
  font-weight: 500;
}
</style>
