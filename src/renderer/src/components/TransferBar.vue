<script setup lang="ts">
import { useTransferStore } from '@renderer/stores/transfer'
import { formatSize } from '@renderer/lib/format'

const transfer = useTransferStore()

function percent(bytes: number, total: number | null): number {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.round((bytes / total) * 100))
}

const statusIcon: Record<string, string> = {
  queued: 'mdi-tray-full',
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
  <v-card v-if="transfer.items.length" variant="flat" border class="transfer-bar">
    <div class="d-flex align-center px-3 py-1">
      <span class="text-caption text-medium-emphasis">
        {{ $t('transfer.title') }} ({{ $t('transfer.activeCount', { count: transfer.active.length }) }})
      </span>
      <v-spacer />
      <v-btn
        size="x-small"
        variant="text"
        prepend-icon="mdi-broom"
        @click="transfer.clearFinished()"
      >
        {{ $t('transfer.clearCompleted') }}
      </v-btn>
    </div>
    <v-divider />
    <div class="transfer-scroll">
      <div v-for="t in transfer.items" :key="t.id" class="px-3 py-1">
        <div class="d-flex align-center text-caption ga-2">
          <v-icon
            :icon="t.direction === 'download' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold'"
            size="x-small"
          />
          <span class="text-truncate" style="max-width: 280px">{{ t.name }}</span>
          <v-icon :icon="statusIcon[t.status]" :color="statusColor[t.status]" size="x-small" />
          <v-spacer />
          <span class="text-disabled">
            {{ formatSize(t.bytes) }}<template v-if="t.total"> / {{ formatSize(t.total) }}</template>
          </span>
          <v-btn
            v-if="t.status === 'active' || t.status === 'queued'"
            icon="mdi-close"
            size="x-small"
            variant="text"
            title="İptal"
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
        <div v-if="t.status === 'failed'" class="text-error text-caption">{{ t.error }}</div>
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.transfer-scroll {
  max-height: 120px;
  overflow-y: auto;
}
</style>
