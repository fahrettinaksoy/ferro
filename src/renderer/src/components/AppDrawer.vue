<script setup lang="ts">
// Yeniden kullanılabilir sağ panel (overlay). Layout'a bağlı DEĞİL — viewport'u
// tam kaplayan fixed bir katman olduğundan app-bar dahil HER ŞEYİN üstüne gelir.
// Header sabit, body esner, footer sabit. v-app içinde render edilir ki tema
// değişkenleri (--v-theme-*) geçerli olsun.
import { computed } from 'vue'
import { useHotkey } from 'vuetify'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    icon?: string
    width?: number | string
  }>(),
  { title: '', icon: '', width: 960 }
)
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

// Esc ile kapat — yalnızca panel açıkken kayıtlı (keys undefined => listener yok),
// böylece kapalıyken diğer Esc davranışlarına (dialoglar) karışmaz. inputs:true:
// bir alana odaklıyken de çalışsın. preventDefault:false: global Esc'i ezmesin.
useHotkey(
  computed(() => (props.modelValue ? 'escape' : undefined)),
  () => emit('update:modelValue', false),
  { inputs: true, preventDefault: false }
)
</script>

<template>
  <Transition name="app-drawer">
    <div v-if="modelValue" class="app-drawer-overlay">
      <!-- Scrim: tıklayınca kapanır -->
      <div class="app-drawer-scrim" @click="emit('update:modelValue', false)" />

      <!-- Panel -->
      <div
        class="app-drawer-panel"
        :style="{ width: typeof width === 'number' ? width + 'px' : width }"
      >
        <!-- Header -->
        <v-toolbar density="compact" color="surface" class="flex-grow-0">
          <v-icon v-if="icon" :icon="icon" class="ml-3" />
          <v-toolbar-title class="text-body-1">{{ title }}</v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" size="small" @click="emit('update:modelValue', false)" />
        </v-toolbar>
        <v-divider />

        <!-- Body -->
        <div class="app-drawer-body d-flex flex-grow-1">
          <slot />
        </div>

        <!-- Footer -->
        <template v-if="$slots.footer">
          <v-divider />
          <div class="d-flex align-center pa-2 flex-grow-0">
            <slot name="footer" />
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.app-drawer-overlay {
  position: fixed;
  inset: 0;
  /* app-bar/navigation-drawer (~1005) ÜSTÜNDE ama Vuetify overlay'lerinin
     (VOverlay tabanı 2000: select/menu/color-picker/dialog) ALTINDA kalır.
     Böylece panel içindeki açılır menüler panelin üstünde görünür (z-index sorunu). */
  z-index: 1500;
}
.app-drawer-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}
.app-drawer-panel {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
}
.app-drawer-body {
  min-height: 0;
}

/* Açılış/kapanış: scrim fade + panel sağdan kayma. */
.app-drawer-enter-active,
.app-drawer-leave-active {
  transition: opacity 0.2s ease;
}
.app-drawer-enter-active .app-drawer-panel,
.app-drawer-leave-active .app-drawer-panel {
  transition: transform 0.2s ease;
}
.app-drawer-enter-from,
.app-drawer-leave-to {
  opacity: 0;
}
.app-drawer-enter-from .app-drawer-panel,
.app-drawer-leave-to .app-drawer-panel {
  transform: translateX(100%);
}
</style>
