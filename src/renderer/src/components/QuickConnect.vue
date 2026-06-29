<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { ConnectionConfig, Protocol } from '@shared/transfer'
import { defaultPort } from '@shared/transfer'
import { useConnectionStore } from '@renderer/stores/connection'
import { useRemoteFsStore } from '@renderer/stores/remoteFs'

const conn = useConnectionStore()
const remote = useRemoteFsStore()

const protocols: { value: Protocol; title: string }[] = [
  { value: 'ftp', title: 'FTP' },
  { value: 'ftps', title: 'FTPS (explicit)' },
  { value: 'ftps-implicit', title: 'FTPS (implicit)' },
  { value: 'sftp', title: 'SFTP' }
]

const form = reactive<ConnectionConfig>({
  protocol: 'ftp',
  host: '',
  port: 21,
  user: '',
  password: '',
  anonymous: false,
  rejectUnauthorized: false
})

// Protokol değişince varsayılan portu güncelle (kullanıcı elle değiştirmediyse).
watch(
  () => form.protocol,
  (p) => {
    form.port = defaultPort(p)
  }
)

watch(
  () => form.anonymous,
  (anon) => {
    if (anon) {
      form.user = 'anonymous'
    }
  }
)

async function submit(): Promise<void> {
  if (conn.isConnected) {
    remote.reset()
    await conn.disconnect()
    return
  }
  try {
    const cwd = await conn.connect({ ...form })
    await remote.load(cwd)
  } catch {
    // hata connection store'da; UI status üzerinden gösteriliyor
  }
}
</script>

<template>
  <v-sheet color="surface" class="px-3 py-2" border>
    <v-form @submit.prevent="submit">
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-select
          v-model="form.protocol"
          :items="protocols"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 170px"
          :disabled="conn.isConnected"
        />
        <v-text-field
          v-model="form.host"
          :label="$t('connect.server')"
          placeholder="ftp.ornek.com"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 180px"
          :disabled="conn.isConnected"
        />
        <v-text-field
          v-model.number="form.port"
          :label="$t('connect.port')"
          type="number"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 90px"
          :disabled="conn.isConnected"
        />
        <v-text-field
          v-model="form.user"
          :label="$t('connect.user')"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          :disabled="conn.isConnected || form.anonymous"
        />
        <v-text-field
          v-model="form.password"
          :label="$t('connect.password')"
          type="password"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 150px"
          :disabled="conn.isConnected || form.anonymous"
        />
        <v-checkbox
          v-model="form.anonymous"
          :label="$t('connect.anonymous')"
          density="compact"
          hide-details
          :disabled="conn.isConnected"
        />
        <v-btn
          type="submit"
          :color="conn.isConnected ? 'error' : 'primary'"
          :loading="conn.status === 'connecting'"
          :prepend-icon="conn.isConnected ? 'mdi-lan-disconnect' : 'mdi-lan-connect'"
        >
          {{ conn.isConnected ? $t('common.disconnect') : $t('common.connect') }}
        </v-btn>
      </div>
      <div v-if="conn.status === 'error' && conn.error" class="text-error text-caption mt-1">
        {{ conn.error }}
      </div>
    </v-form>
  </v-sheet>
</template>
