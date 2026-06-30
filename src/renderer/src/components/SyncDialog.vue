<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { invoke } from '@renderer/lib/ipc'
import type { SyncEntry } from '@shared/transfer'
import { formatSize } from '@renderer/lib/format'
import { useConnectionStore } from '@renderer/stores/connection'
import { useLocalStore } from '@renderer/stores/local'
import { useRemoteFsStore } from '@renderer/stores/remoteFs'
import { useTransferStore } from '@renderer/stores/transfer'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const conn = useConnectionStore()
const local = useLocalStore()
const remote = useRemoteFsStore()
const transfer = useTransferStore()

type Direction = 'upload' | 'download'
const direction = ref<Direction>('upload')
const entries = ref<SyncEntry[]>([])
const loading = ref(false)
const selected = ref<Set<string>>(new Set())

async function compare(): Promise<void> {
  if (!conn.sessionId) return
  loading.value = true
  try {
    const res = await invoke('sync:compare', {
      sessionId: conn.sessionId,
      localPath: local.cwd,
      remotePath: remote.cwd
    })
    entries.value = res.entries
    recomputeSelection()
  } finally {
    loading.value = false
  }
}

/** Bir girdinin seçili yöne göre aktarım adayı olup olmadığı + durumu. */
function status(e: SyncEntry): 'onlyLocal' | 'onlyRemote' | 'differ' | 'same' {
  if (e.inLocal && !e.inRemote) return 'onlyLocal'
  if (!e.inLocal && e.inRemote) return 'onlyRemote'
  if (!e.isDirectory && e.localSize !== e.remoteSize) return 'differ'
  return 'same'
}

function isCandidate(e: SyncEntry): boolean {
  const st = status(e)
  if (direction.value === 'upload') return st === 'onlyLocal' || st === 'differ'
  return st === 'onlyRemote' || st === 'differ'
}

const candidates = computed(() => entries.value.filter(isCandidate))

function recomputeSelection(): void {
  selected.value = new Set(candidates.value.map((e) => e.name))
}

watch(direction, recomputeSelection)
watch(
  () => props.modelValue,
  (open) => {
    if (open) void compare()
  }
)

function toggle(name: string): void {
  const s = new Set(selected.value)
  if (s.has(name)) s.delete(name)
  else s.add(name)
  selected.value = s
}

async function synchronize(): Promise<void> {
  for (const e of candidates.value) {
    if (!selected.value.has(e.name)) continue
    if (direction.value === 'upload') {
      await transfer.upload(e.name, local.join(e.name), e.isDirectory)
    } else {
      await transfer.download(e.name, e.isDirectory)
    }
  }
  emit('update:modelValue', false)
}

const statusColor: Record<string, string> = {
  onlyLocal: 'info',
  onlyRemote: 'warning',
  differ: 'primary',
  same: 'success'
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-toolbar density="compact" color="surface">
        <v-icon icon="$sync" class="ml-3" />
        <v-toolbar-title class="text-body-1">{{ $t('sync.title') }}</v-toolbar-title>
        <v-spacer />
        <!-- Bağlamsal defaults: toolbar butonları küçük (sadece bu alt-ağaç). -->
        <v-defaults-provider :defaults="{ VBtn: { size: 'small' } }">
          <v-btn icon="$refresh" :loading="loading" @click="compare()" />
          <v-btn icon="mdi-close" @click="emit('update:modelValue', false)" />
        </v-defaults-provider>
      </v-toolbar>

      <div v-if="!conn.isConnected" class="pa-6 text-center text-medium-emphasis">
        {{ $t('sync.connectFirst') }}
      </div>

      <template v-else>
        <div class="px-4 pt-3">
          <v-btn-toggle v-model="direction" mandatory density="compact" color="primary" divided>
            <v-btn value="upload" prepend-icon="mdi-arrow-up-bold">
              {{ $t('sync.directionUpload') }}
            </v-btn>
            <v-btn value="download" prepend-icon="mdi-arrow-down-bold">
              {{ $t('sync.directionDownload') }}
            </v-btn>
          </v-btn-toggle>
        </div>

        <div class="sync-scroll px-2 py-2">
          <v-table>
            <thead>
              <tr>
                <th style="width: 40px"></th>
                <th>{{ $t('common.name') }}</th>
                <th class="text-right">{{ $t('panes.local') }}</th>
                <th class="text-right">{{ $t('panes.remote') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in candidates" :key="e.name">
                <td>
                  <v-checkbox-btn
                    :model-value="selected.has(e.name)"
                    @update:model-value="toggle(e.name)"
                  />
                </td>
                <td>
                  <v-icon
                    :icon="e.isDirectory ? '$folder' : '$fileEntry'"
                    size="small"
                    class="mr-1"
                  />
                  {{ e.name }}
                </td>
                <td class="text-right text-caption">
                  {{ e.inLocal ? (e.isDirectory ? '—' : formatSize(e.localSize ?? 0)) : '' }}
                </td>
                <td class="text-right text-caption">
                  {{ e.inRemote ? (e.isDirectory ? '—' : formatSize(e.remoteSize ?? 0)) : '' }}
                </td>
                <td>
                  <v-chip :color="statusColor[status(e)]" size="x-small" variant="tonal">
                    {{
                      $t(
                        'sync.' +
                          (status(e) === 'onlyLocal'
                            ? 'onlyLocal'
                            : status(e) === 'onlyRemote'
                              ? 'onlyRemote'
                              : 'differ')
                      )
                    }}
                  </v-chip>
                </td>
              </tr>
              <tr v-if="!candidates.length && !loading">
                <td colspan="5" class="text-center text-medium-emphasis py-4">
                  {{ $t('sync.nothing') }}
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <v-divider />
        <v-card-actions>
          <span class="text-caption text-medium-emphasis ml-2">
            {{ $t('sync.transferCount', { count: selected.size }) }}
          </span>
          <v-spacer />
          <v-btn variant="text" @click="emit('update:modelValue', false)">
            {{ $t('common.cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="$sync"
            :disabled="!selected.size"
            @click="synchronize()"
          >
            {{ $t('sync.button') }}
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.sync-scroll {
  max-height: 380px;
  overflow-y: auto;
}
</style>
