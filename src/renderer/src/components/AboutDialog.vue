<script setup lang="ts">
// Hakkında diyaloğu (M3): uygulama kimliği + sürüm + çalışma ortamı bilgileri.
// Uygulama menüsündeki "Ferro Hakkında" öğesi 'app:showAbout' olayıyla açar.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { onEvent, invoke } from '@renderer/lib/ipc'
import type { InvokeRes } from '@shared/ipc'

const open = ref(false)
const info = ref<InvokeRes<'app:info'> | null>(null)
let unsub: (() => void) | null = null

const PLATFORMS: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux'
}

async function show(): Promise<void> {
  if (!info.value) {
    try {
      info.value = await invoke('app:info', undefined)
    } catch {
      /* sürüm bilgisi alınamazsa diyalog yine açılır */
    }
  }
  open.value = true
}

onMounted(() => {
  unsub = onEvent('app:showAbout', () => void show())
})
onBeforeUnmount(() => unsub?.())
</script>

<template>
  <v-dialog v-model="open" max-width="400">
    <v-card class="about-card">
      <!-- Kimlik: tonal logo + ad + sürüm -->
      <div class="d-flex flex-column align-center pt-8 pb-4 px-6 text-center">
        <v-avatar size="72" rounded="lg" color="primary" variant="tonal" class="mb-4">
          <v-icon icon="$ferroLogo" size="40" />
        </v-avatar>
        <div class="text-headline-medium font-weight-bold">{{ info?.name ?? 'Ferro' }}</div>
        <v-chip size="small" variant="tonal" color="primary" class="mt-2">
          {{ $t('about.version', { v: info?.version ?? '—' }) }}
        </v-chip>
        <p class="text-body-medium text-medium-emphasis mt-4 mb-0">
          {{ $t('about.description') }}
        </p>
      </div>

      <!-- Çalışma ortamı: tonal kapta anahtar/değer satırları -->
      <div class="runtime mx-6 mb-4 pa-3">
        <div class="runtime-row">
          <span class="text-medium-emphasis">Electron</span>
          <span class="font-monospace">{{ info?.electron ?? '—' }}</span>
        </div>
        <div class="runtime-row">
          <span class="text-medium-emphasis">Chromium</span>
          <span class="font-monospace">{{ info?.chrome ?? '—' }}</span>
        </div>
        <div class="runtime-row">
          <span class="text-medium-emphasis">Node.js</span>
          <span class="font-monospace">{{ info?.node ?? '—' }}</span>
        </div>
        <div class="runtime-row">
          <span class="text-medium-emphasis">{{ $t('about.platform') }}</span>
          <span class="font-monospace">
            {{ (info && (PLATFORMS[info.platform] ?? info.platform)) ?? '—' }}
            {{ info?.arch ?? '' }}
          </span>
        </div>
      </div>

      <!-- Telif + lisans -->
      <div class="px-6 pb-2 text-center text-body-small text-medium-emphasis">
        {{ $t('about.copyright') }} · {{ $t('about.license') }}
      </div>

      <v-card-actions class="justify-center pb-4">
        <v-btn color="primary" variant="tonal" min-width="120" @click="open = false">
          {{ $t('common.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* M3 diyalog kabı: büyük köşe + tonal yüzey. */
.about-card {
  border-radius: 24px !important;
  background: rgb(var(--v-theme-surface-container-low)) !important;
}
/* Çalışma ortamı bilgileri: bir ton koyu kap. */
.runtime {
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container));
}
.runtime-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 0.8125rem;
  line-height: 1.6rem;
}
.font-monospace {
  font-family: monospace;
}
</style>
