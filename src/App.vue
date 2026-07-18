<script setup lang="ts">
import { useTheme } from 'vuetify'
import { storeToRefs } from 'pinia'
import { watch, defineAsyncComponent } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useToastStore, type ToastColor, type ToastMessage } from '@renderer/stores/toast'
import { applyThemes, applyFonts } from '@renderer/lib/theme'
import MainView from '@renderer/views/MainView.vue'

// Ayarlar paneli tek başına 20 alt sayfa bileşeni içe aktarır (SettingsDialog.vue);
// "Hakkında" ve ana parola kilidi de çoğu oturumda hiç açılmaz. Üçü de ayrı
// chunk'a alınır — başlangıç paketi bu kodu yalnızca ilk açılışta indirir/derler.
const SettingsDialog = defineAsyncComponent(() => import('@renderer/components/SettingsDialog.vue'))
const AboutDialog = defineAsyncComponent(() => import('@renderer/components/AboutDialog.vue'))
const MasterUnlockDialog = defineAsyncComponent(
  () => import('@renderer/components/MasterUnlockDialog.vue')
)

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
/* .text-label-large = eski text-subtitle-2'nin yeni adı. text-subtitle-1
   kullanılmıyor; text-body-1 de (v-toolbar-title) v4'te aynı .text-body-large
   adına taşındığından bilinçli olarak dışarıda bırakıldı (araç çubuğu
   başlıkları önceden de gövde fontundaydı — davranış korunuyor). */
.v-application :is(h1, h2, h3, h4, h5, h6),
.v-application
  :is(
    .text-display-large,
    .text-display-medium,
    .text-display-small,
    .text-headline-large,
    .text-headline-medium,
    .text-headline-small
  ),
.v-application :is(.text-label-large) {
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
/* ── Anahtarlar (v-switch): kare + net kontrast ──
   Varsayılan inset anahtar, tonal kap zeminlerinde (surface-container*) soluk
   kalıp durumu belirsizleşiyordu. Kare köşe + KAPALIYKEN görünür outline'lı
   dolu track + AÇIKKEN belirgin primary dolgu ile her temada okunur ve
   açık/kapalı durumu net ayrışır. Kurallar @layer dışında olduğundan
   Vuetify'ın katmanlı stillerini ezer (App.vue font kuralıyla aynı gerekçe). */
.v-switch .v-switch__track {
  border-radius: 5px !important;
  opacity: 1 !important;
  background-color: rgb(var(--v-theme-surface-container-highest)) !important;
  border: 1.5px solid rgb(var(--v-theme-outline));
  box-sizing: border-box;
}
.v-switch .v-switch__thumb {
  border-radius: 3px !important;
  background-color: rgb(var(--v-theme-on-surface-variant)) !important;
  color: rgb(var(--v-theme-on-surface-variant)) !important;
  box-shadow: none;
}
/* Açık (seçili) durum: primary dolgu + üstünde belirgin açık thumb. */
.v-switch .v-selection-control--dirty .v-switch__track {
  background-color: rgb(var(--v-theme-primary)) !important;
  border-color: rgb(var(--v-theme-primary)) !important;
}
.v-switch .v-selection-control--dirty .v-switch__thumb {
  background-color: rgb(var(--v-theme-on-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
}
/* Devre dışı anahtar yine de okunur bir soluklukta kalsın (görünmez olmasın). */
.v-switch.v-input--disabled {
  opacity: 0.55;
}
</style>
