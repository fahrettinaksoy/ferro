<script setup lang="ts">
// Yeniden kullanılabilir sağ panel — Vuetify v-navigation-drawer (temporary).
// M3 "modal navigation drawer": panellerle aynı tonal kap, açık kenarda
// yuvarlatılmış köşeler, scrim tıklamasıyla kapanır. Header sabit, body esner,
// footer sabit. v-app layout'una kaydolduğundan v-app altında render edilmelidir.
import { computed } from 'vue'
import { useHotkey } from 'vuetify'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    /** Başlığın altında görünen kısa açıklama satırı (opsiyonel). */
    subtitle?: string
    icon?: string
    width?: number | string
  }>(),
  { title: '', subtitle: '', icon: '', width: 960 }
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
  <!-- order=-1: layout'a app-bar'dan ÖNCE kaydolur → tam yükseklik kaplar ve
       z-sıralamasında app-bar'ın üstünde kalır (drawer çubuğun altına girmez). -->
  <v-navigation-drawer
    :model-value="modelValue"
    location="right"
    temporary
    :width="width"
    :order="-1"
    class="app-drawer border-0"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="d-flex flex-column fill-height">
      <!-- Header: belirgin primary blok — solda büyük ikon, yanında başlık
           (açıklamadan belirgin büyük) + kısa açıklama, sağda kapat. -->
      <div class="app-drawer-header bg-primary flex-grow-0 d-flex align-center pa-4">
        <v-icon v-if="icon" :icon="icon" size="40" class="mr-4 flex-shrink-0" />
        <div class="flex-grow-1" style="min-width: 0">
          <div class="header-title">{{ title }}</div>
          <div v-if="subtitle" class="text-body-medium header-subtitle text-truncate">
            {{ subtitle }}
          </div>
        </div>
        <v-btn
          icon
          variant="text"
          size="small"
          class="align-self-start flex-shrink-0"
          @click="emit('update:modelValue', false)"
        >
          <v-icon icon="mdi-close" />
          <v-tooltip activator="parent" location="bottom">{{ $t('common.close') }}</v-tooltip>
        </v-btn>
      </div>

      <!-- Body -->
      <div class="app-drawer-body d-flex flex-grow-1">
        <slot />
      </div>

      <!-- Footer: çizgi yerine bir ton koyu kap — M3 tonal ayrışma. -->
      <template v-if="$slots.footer">
        <div class="app-drawer-footer d-flex align-center pa-2 flex-grow-0">
          <slot name="footer" />
        </div>
      </template>
    </div>
  </v-navigation-drawer>
</template>

<style scoped>
/* M3 modal drawer: tonal kap + açık kenarda (solda) 16px köşe. */
.app-drawer {
  background: rgb(var(--v-theme-surface-container-low)) !important;
  overflow: hidden;
  max-width: 100%;
}
/* İçerik yüksekliği: drawer'ın kendi content sarmalayıcısı tam boy olsun. */
.app-drawer :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.app-drawer-body {
  min-height: 0;
  overflow: hidden;
}
/* Başlık: açıklamadan belirgin büyük ve ağır. */
.header-title {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.6rem;
}
/* Başlık açıklaması: on-primary üzerinde hafif yumuşatılmış vurgu. */
.header-subtitle {
  opacity: 0.85;
}
/* Alt eylem şeridi: çizgisiz, bir ton farklı kap. */
.app-drawer-footer {
  background: rgb(var(--v-theme-surface-container));
}
</style>
