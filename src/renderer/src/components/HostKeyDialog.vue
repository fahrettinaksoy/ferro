<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { onEvent, invoke } from '@renderer/lib/ipc'
import type { EventMap } from '@shared/ipc'

type Req = EventMap['hostkey:verify']

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
  unsub = onEvent('hostkey:verify', (req) => {
    queue.push(req)
    showNext()
  })
})
onBeforeUnmount(() => unsub?.())

async function decide(accept: boolean): Promise<void> {
  const req = current.value
  open.value = false
  current.value = null
  if (req) await invoke('hostkey:decision', { requestId: req.requestId, accept })
  showNext()
}
</script>

<template>
  <v-dialog v-model="open" max-width="560" persistent>
    <v-card v-if="current">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon
          :icon="current.changed ? 'mdi-shield-alert' : 'mdi-shield-key'"
          :color="current.changed ? 'error' : 'warning'"
        />
        {{ current.changed ? $t('hostkey.changedTitle') : $t('hostkey.unknownTitle') }}
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="current.changed"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ $t('hostkey.changedWarning') }}
        </v-alert>
        <p class="mb-2">{{ $t('hostkey.intro', { host: `${current.host}:${current.port}` }) }}</p>
        <v-sheet color="surface" border rounded class="pa-2 fingerprint">
          {{ current.fingerprint }}
        </v-sheet>
        <p class="text-caption text-medium-emphasis mt-2">{{ $t('hostkey.note') }}</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="decide(false)">{{ $t('hostkey.reject') }}</v-btn>
        <v-btn :color="current.changed ? 'error' : 'primary'" @click="decide(true)">
          {{ $t('hostkey.trust') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fingerprint {
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
}
</style>
