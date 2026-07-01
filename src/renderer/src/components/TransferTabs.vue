<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTransferStore } from '@renderer/stores/transfer'
import type { TransferJob } from '@shared/transfer'
import { formatSize } from '@renderer/lib/format'

const transfer = useTransferStore()
const tab = ref<'queued' | 'completed' | 'failed'>('queued')

const rows = computed<TransferJob[]>(() => {
  if (tab.value === 'completed') return transfer.completed
  if (tab.value === 'failed') return transfer.failed
  return transfer.queued
})

function percent(bytes: number, total: number | null): number {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.round((bytes / total) * 100))
}

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
  <v-card variant="flat" border class="d-flex flex-column fill-height">
    <!-- Sekme şeridi ile "temizle" butonu ayrı: buton sabit genişlikli yuvada
         durur; böylece sekme genişlikleri (grow) tüm sekmelerde aynı kalır. -->
    <div class="d-flex align-center tab-header">
      <v-tabs v-model="tab" density="compact" color="primary" class="flex-grow-1">
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
      <div v-if="!rows.length" class="text-disabled text-caption pa-4 text-center">
        {{ $t('transfer.empty') }}
      </div>
      <div v-for="t in rows" :key="t.id" class="px-3 py-1 row-line">
        <div class="d-flex align-center text-caption ga-2">
          <v-icon
            :icon="t.direction === 'download' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold'"
            size="x-small"
          />
          <span class="text-truncate" style="max-width: 320px">{{ t.name }}</span>
          <v-icon :icon="statusIcon[t.status]" :color="statusColor[t.status]" size="x-small" />
          <v-spacer />
          <span class="text-disabled">
            {{ formatSize(t.bytes)
            }}<template v-if="t.total"> / {{ formatSize(t.total) }}</template>
          </span>
          <v-btn
            v-if="t.status === 'active' || t.status === 'queued'"
            icon="mdi-close"
            size="x-small"
            variant="text"
            :title="$t('transfer.cancel')"
            @click="transfer.cancel(t.id)"
          />
        </div>
        <v-progress-linear
          v-if="t.status === 'active' || t.status === 'queued'"
          :model-value="percent(t.bytes, t.total)"
          :indeterminate="t.status === 'active' && !t.total"
          color="primary"
          height="3"
          class="mt-1"
        />
        <div v-if="t.status === 'failed' && t.error" class="text-error text-caption">
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
