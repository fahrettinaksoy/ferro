<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTransferStore } from '@renderer/stores/transfer'
import { useConnectionStore } from '@renderer/stores/connection'
import type { TransferJob } from '@shared/transfer'
import { formatSize } from '@renderer/lib/format'

const transfer = useTransferStore()
const conn = useConnectionStore()
const tab = ref<'queued' | 'completed' | 'failed'>('queued')

// İş → ait olduğu sunucunun adı (kapanmış oturumlarda host'a düşer).
function serverName(sessionId: string): string {
  const s = conn.sessions.find((x) => x.sessionId === sessionId)
  return s?.name ?? s?.config.host ?? '—'
}

const rows = computed<TransferJob[]>(() => {
  if (tab.value === 'completed') return transfer.completed
  if (tab.value === 'failed') return transfer.failed
  return transfer.queued
})

function percent(bytes: number, total: number | null): number {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.round((bytes / total) * 100))
}

// Sekme başına farklı ikon/metin: kullanıcı boş sekmenin NEDENİNİ ayırt eder
// ("failed" sekmesinin boş olması iyi haber — check-circle ile olumlu çerçevelenir).
const EMPTY_STATE: Record<'queued' | 'completed' | 'failed', { icon: string; key: string }> = {
  // $queuePanel (mdi-tray-full): düz 'mdi-tray' sığ/açık bir U çizdiğinden 44px'te
  // yarım kesilmiş gibi görünüyordu — panelin zaten kullandığı dolu tepsi ikonuyla değiştirildi.
  queued: { icon: '$queuePanel', key: 'transfer.emptyQueued' },
  completed: { icon: 'mdi-history', key: 'transfer.emptyCompleted' },
  failed: { icon: 'mdi-shield-check-outline', key: 'transfer.emptyFailed' }
}
const emptyState = computed(() => EMPTY_STATE[tab.value])

const statusIcon: Record<string, string> = {
  queued: '$queuePanel',
  active: 'mdi-progress-upload',
  completed: 'mdi-check-circle',
  failed: 'mdi-alert-circle',
  cancelled: 'mdi-cancel'
}
const statusColor: Record<string, string> = {
  queued: 'secondary',
  active: 'primary',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning'
}
</script>

<template>
  <v-card variant="flat" class="d-flex flex-column fill-height m3-surface">
    <!-- Sekme şeridi ile "temizle" butonu ayrı: buton sabit genişlikli yuvada
         durur; böylece sekme genişlikleri (grow) tüm sekmelerde aynı kalır. -->
    <!-- Kart başlığı olarak sekmeler: diğer panellerle aynı 44px yükseklik. -->
    <div class="d-flex align-center tab-header">
      <v-tabs v-model="tab" density="compact" color="primary" height="44" class="flex-grow-1">
        <v-tab value="queued">
          {{ $t('transfer.queued') }}
          <v-chip v-if="transfer.queued.length" size="x-small" class="ml-2" color="primary">
            {{ transfer.queued.length }}
          </v-chip>
        </v-tab>
        <v-tab value="completed">
          {{ $t('transfer.completed') }}
          <v-chip v-if="transfer.completed.length" size="x-small" class="ml-2" color="success">
            {{ transfer.completed.length }}
          </v-chip>
        </v-tab>
        <v-tab value="failed">
          {{ $t('transfer.failed') }}
          <v-chip v-if="transfer.failed.length" size="x-small" class="ml-2" color="error">
            {{ transfer.failed.length }}
          </v-chip>
        </v-tab>
      </v-tabs>
      <div class="clear-slot d-flex justify-end align-center">
        <v-btn
          v-if="tab !== 'queued'"
          size="x-small"
          variant="tonal"
          prepend-icon="mdi-broom"
          @click="transfer.clearFinished()"
        >
          {{ $t('transfer.clearCompleted') }}
        </v-btn>
      </div>
    </div>

    <v-divider />

    <div class="tab-scroll flex-grow-1">
      <v-empty-state
        v-if="!rows.length"
        :icon="emptyState.icon"
        :text="$t(emptyState.key)"
        size="44"
      />
      <div v-for="t in rows" :key="t.id" class="px-3 py-1 row-line">
        <div class="d-flex align-center text-body-small ga-2">
          <v-icon
            :icon="t.direction === 'download' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold'"
            size="x-small"
          />
          <span class="text-truncate" style="max-width: 320px">{{ t.name }}</span>
          <v-chip size="x-small" variant="tonal" color="primary" label class="flex-shrink-0">
            <v-icon icon="$server" start size="x-small" />
            {{ serverName(t.sessionId) }}
          </v-chip>
          <v-icon :icon="statusIcon[t.status]" :color="statusColor[t.status]" size="x-small" />
          <v-spacer />
          <span class="text-disabled">
            {{ formatSize(t.bytes)
            }}<template v-if="t.total"> / {{ formatSize(t.total) }}</template>
          </span>
          <v-btn
            v-if="t.status === 'active' || t.status === 'queued'"
            icon
            size="x-small"
            variant="text"
            @click="transfer.cancel(t.id)"
          >
            <v-icon icon="mdi-close" />
            <v-tooltip activator="parent" location="top">{{ $t('transfer.cancel') }}</v-tooltip>
          </v-btn>
        </div>
        <v-progress-linear
          v-if="t.status === 'active' || t.status === 'queued'"
          :model-value="percent(t.bytes, t.total)"
          :indeterminate="t.status === 'active' && !t.total"
          color="primary"
          height="3"
          class="mt-1"
        />
        <div v-if="t.status === 'failed' && t.error" class="text-error text-body-small">
          {{ t.error }}
        </div>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
/* "Temizle" butonu yuvası: her zaman sabit genişlik → sekme şeridi (grow)
   tüm sekmelerde aynı kalır, sekmeye tıklayınca genişlik değişmez. */
.clear-slot {
  flex: 0 0 210px;
  width: 210px;
  padding-right: 10px;
}
.tab-scroll {
  overflow-y: auto;
  min-height: 0;
}
.row-line:not(:last-child) {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
