<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Protocol, SavedSite, SiteInput } from '@shared/transfer'
import { defaultPort } from '@shared/transfer'
import { useSitesStore } from '@renderer/stores/sites'

const { t } = useI18n()

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const sites = useSitesStore()

const protocols: { value: Protocol; title: string }[] = [
  { value: 'ftp', title: 'FTP' },
  { value: 'ftps', title: 'FTPS (explicit)' },
  { value: 'ftps-implicit', title: 'FTPS (implicit)' },
  { value: 'sftp', title: 'SFTP' }
]

const emptyForm = (): SiteInput => ({
  name: '',
  folder: '',
  protocol: 'ftp',
  host: '',
  port: 21,
  user: '',
  password: '',
  anonymous: false,
  rejectUnauthorized: false
})

const form = reactive<SiteInput>(emptyForm())
const selectedId = ref<string | null>(null)
const passwordPlaceholder = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (open) void sites.load()
  }
)

watch(
  () => form.protocol,
  (p) => {
    if (!selectedId.value) form.port = defaultPort(p)
  }
)

const isEditing = computed(() => selectedId.value !== null)
const canSave = computed(() => form.name.trim() && form.host.trim())

function selectNew(): void {
  selectedId.value = null
  passwordPlaceholder.value = ''
  Object.assign(form, emptyForm())
}

function selectSite(s: SavedSite): void {
  selectedId.value = s.id
  passwordPlaceholder.value = s.hasPassword ? t('sites.savedPassword') : ''
  Object.assign(form, {
    id: s.id,
    name: s.name,
    folder: s.folder ?? '',
    protocol: s.protocol,
    host: s.host,
    port: s.port,
    user: s.user,
    password: '', // boş = değiştirme
    anonymous: s.anonymous ?? false,
    rejectUnauthorized: s.rejectUnauthorized ?? false
  })
}

async function save(): Promise<void> {
  await sites.save({ ...form, id: selectedId.value ?? undefined })
  const match = sites.sites.find((s) => s.name === form.name && s.host === form.host)
  if (match) selectSite(match)
}

async function remove(): Promise<void> {
  if (selectedId.value) {
    await sites.remove(selectedId.value)
    selectNew()
  }
}

async function connect(): Promise<void> {
  const s = sites.sites.find((x) => x.id === selectedId.value)
  if (s) {
    await sites.connect(s)
    emit('update:modelValue', false)
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="820"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-toolbar density="compact" color="surface">
        <v-icon icon="mdi-server-network" class="ml-3" />
        <v-toolbar-title class="text-body-1">{{ $t('sites.title') }}</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" size="small" @click="emit('update:modelValue', false)" />
      </v-toolbar>

      <v-alert
        v-if="!sites.encryptionAvailable"
        type="warning"
        density="compact"
        variant="tonal"
        class="ma-2"
      >
        {{ $t('sites.encWarning') }}
      </v-alert>

      <div class="d-flex" style="min-height: 380px">
        <!-- Site listesi -->
        <div class="site-list border-e">
          <v-list density="compact" nav>
            <v-list-item
              prepend-icon="mdi-plus"
              :title="$t('sites.newSite')"
              :active="!isEditing"
              @click="selectNew()"
            />
            <v-divider />
            <v-list-item
              v-for="s in sites.sites"
              :key="s.id"
              :active="selectedId === s.id"
              @click="selectSite(s)"
            >
              <template #prepend>
                <v-icon :icon="s.protocol === 'sftp' ? 'mdi-shield-lock' : 'mdi-server'" />
              </template>
              <v-list-item-title>{{ s.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ s.host }}:{{ s.port }}</v-list-item-subtitle>
            </v-list-item>
            <v-list-item v-if="!sites.sites.length" class="text-disabled text-caption">
              {{ $t('sites.noSites') }}
            </v-list-item>
          </v-list>
        </div>

        <!-- Form -->
        <div class="flex-grow-1 pa-4">
          <div class="d-flex ga-2">
            <v-text-field
              v-model="form.name"
              :label="$t('sites.siteName')"
              density="compact"
              variant="outlined"
              hide-details
            />
            <v-text-field
              v-model="form.folder"
              :label="$t('sites.folder')"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 180px"
            />
          </div>
          <div class="d-flex ga-2 mt-3">
            <v-select
              v-model="form.protocol"
              :items="protocols"
              :label="$t('sites.protocol')"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 200px"
            />
            <v-text-field
              v-model="form.host"
              :label="$t('connect.server')"
              density="compact"
              variant="outlined"
              hide-details
            />
            <v-text-field
              v-model.number="form.port"
              :label="$t('connect.port')"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 100px"
            />
          </div>
          <div class="d-flex ga-2 mt-3">
            <v-text-field
              v-model="form.user"
              :label="$t('connect.user')"
              density="compact"
              variant="outlined"
              hide-details
              :disabled="form.anonymous"
            />
            <v-text-field
              v-model="form.password"
              :label="$t('connect.password')"
              type="password"
              :placeholder="passwordPlaceholder"
              persistent-placeholder
              density="compact"
              variant="outlined"
              hide-details
              :disabled="form.anonymous"
            />
          </div>
          <div class="d-flex ga-4 mt-2">
            <v-checkbox
              v-model="form.anonymous"
              :label="$t('connect.anonymous')"
              density="compact"
              hide-details
            />
            <v-checkbox
              v-if="form.protocol === 'ftps' || form.protocol === 'ftps-implicit'"
              v-model="form.rejectUnauthorized"
              :label="$t('connect.verifyCert')"
              density="compact"
              hide-details
            />
          </div>
        </div>
      </div>

      <v-divider />
      <v-card-actions>
        <v-btn v-if="isEditing" color="error" variant="text" prepend-icon="mdi-delete" @click="remove()">
          {{ $t('common.delete') }}
        </v-btn>
        <v-spacer />
        <v-btn :disabled="!canSave" variant="tonal" prepend-icon="mdi-content-save" @click="save()">
          {{ $t('common.save') }}
        </v-btn>
        <v-btn
          v-if="isEditing"
          color="primary"
          prepend-icon="mdi-lan-connect"
          @click="connect()"
        >
          {{ $t('common.connect') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.site-list {
  width: 240px;
  overflow-y: auto;
  max-height: 460px;
}
</style>
