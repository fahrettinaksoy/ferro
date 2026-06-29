<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { onEvent, invoke } from '@renderer/lib/ipc'
import type { EventMap } from '@shared/ipc'

type Req = EventMap['tls:verify']

const open = ref(false)
const current = ref<Req | null>(null)
const queue: Req[] = []
let unsub: (() => void) | null = null

function showNext(): void {
  if (current.value || queue.length === 0) return
  current.value = queue.shift()!
  open.value = true
}

onMounted(() => {
  unsub = onEvent('tls:verify', (req) => {
    queue.push(req)
    showNext()
  })
})
onBeforeUnmount(() => unsub?.())

async function decide(accept: boolean): Promise<void> {
  const req = current.value
  open.value = false
  current.value = null
  if (req) await invoke('tls:decision', { requestId: req.requestId, accept })
  showNext()
}
</script>

<template>
  <v-dialog v-model="open" max-width="540" persistent>
    <v-card v-if="current">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-certificate" color="warning" />
        {{ $t('tls.title') }}
      </v-card-title>
      <v-card-text>
        <p class="mb-2">{{ $t('tls.intro', { host: `${current.host}:${current.port}` }) }}</p>
        <v-sheet color="surface" border rounded class="pa-2 detail">{{ current.detail }}</v-sheet>
        <p class="text-caption text-medium-emphasis mt-2">{{ $t('tls.note') }}</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="decide(false)">{{ $t('tls.reject') }}</v-btn>
        <v-btn color="warning" @click="decide(true)">{{ $t('tls.trust') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.detail {
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
}
</style>
