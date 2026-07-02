<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useLogStore } from '@renderer/stores/log'

const logStore = useLogStore()
const scroller = ref<HTMLElement | null>(null)

const levelColor: Record<string, string> = {
  info: 'text-medium-emphasis',
  cmd: 'text-info',
  reply: 'text-success',
  error: 'text-error'
}

// Yeni log geldikçe en alta kaydır.
watch(
  () => logStore.entries.length,
  async () => {
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  }
)
</script>

<template>
  <v-card variant="flat" class="d-flex flex-column fill-height m3-surface">
    <v-toolbar density="compact" color="transparent">
      <v-icon icon="$logPanel" class="ml-3" />
      <v-toolbar-title class="text-body-2">{{ $t('log.title') }}</v-toolbar-title>
      <v-spacer />
      <v-btn icon size="small" @click="logStore.clear()">
        <v-icon icon="$remove" />
        <v-tooltip activator="parent" location="top">{{ $t('log.clear') }}</v-tooltip>
      </v-btn>
    </v-toolbar>
    <v-divider />
    <div ref="scroller" class="log-scroll flex-grow-1 px-3 py-2">
      <div v-for="e in logStore.entries" :key="e.id" class="log-line" :class="levelColor[e.level]">
        <span class="text-disabled mr-2">{{ e.time }}</span
        >{{ e.text }}
      </div>
      <div v-if="!logStore.entries.length" class="text-disabled text-caption">
        {{ $t('log.empty') }}
      </div>
    </div>
  </v-card>
</template>

<style scoped>
.log-scroll {
  overflow-y: auto;
  min-height: 0;
  font-family: monospace;
  font-size: 12px;
}
.log-line {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
