<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@renderer/lib/ipc'
import { useToastStore, errText } from '@renderer/stores/toast'
import type { SyncConfigPublic, SyncSettingsSnapshot } from '@shared/sync'

// ── Senkronizasyon sayfası ─────────────────────────────────────────────────
// Diğer ayar sayfalarının aksine draft'a bağlı değildir: yapılandırma main
// süreçte (sync.json, sırlar vault ile) tutulur ve push/pull anlık eylemlerdir.
// Sır alanları boş bırakılırsa mevcut değer korunur (site parolası deseni).

const { t } = useI18n()
const toast = useToastStore()

const cfg = reactive({
  provider: 'gist' as 'gist' | 'webdav',
  includeSites: true,
  includeSettings: true,
  gistId: '',
  gistToken: '',
  hasToken: false,
  webdavUrl: '',
  webdavUser: '',
  webdavPassword: '',
  hasWebdavPassword: false,
  syncPassword: '',
  hasSyncPassword: false,
  lastSyncAt: null as string | null,
  lastDirection: null as 'push' | 'pull' | null
})
const busy = ref<'save' | 'push' | 'pull' | null>(null)
const pullConfirm = ref(false)

const savedMark = computed(() => t('sites.savedPassword'))

const lastSyncText = computed(() => {
  if (!cfg.lastSyncAt) return t('settings.sync.neverSynced')
  const when = new Date(cfg.lastSyncAt).toLocaleString()
  const dir = cfg.lastDirection === 'push' ? t('settings.sync.push') : t('settings.sync.pull')
  return t('settings.sync.lastSync', { when, dir })
})

function applyPublic(p: SyncConfigPublic): void {
  cfg.provider = p.provider
  cfg.includeSites = p.include.sites
  cfg.includeSettings = p.include.settings
  cfg.gistId = p.gist.gistId
  cfg.hasToken = p.gist.hasToken
  cfg.webdavUrl = p.webdav.url
  cfg.webdavUser = p.webdav.user
  cfg.hasWebdavPassword = p.webdav.hasPassword
  cfg.hasSyncPassword = p.hasSyncPassword
  cfg.lastSyncAt = p.lastSyncAt
  cfg.lastDirection = p.lastDirection
  // Sır girişleri temizlenir — alanlar "kayıtlı" yer tutucusunu gösterir.
  cfg.gistToken = ''
  cfg.webdavPassword = ''
  cfg.syncPassword = ''
}

onMounted(async () => {
  try {
    const { config } = await invoke('sync:getConfig', undefined)
    applyPublic(config)
  } catch (err) {
    toast.error(errText(err))
  }
})

async function saveConfig(silent = false): Promise<boolean> {
  try {
    const { config } = await invoke('sync:setConfig', {
      provider: cfg.provider,
      include: { sites: cfg.includeSites, settings: cfg.includeSettings },
      gist: { gistId: cfg.gistId, token: cfg.gistToken || undefined },
      webdav: {
        url: cfg.webdavUrl,
        user: cfg.webdavUser,
        password: cfg.webdavPassword || undefined
      },
      syncPassword: cfg.syncPassword || undefined
    })
    applyPublic(config)
    if (!silent) toast.success(t('settings.sync.saved'))
    return true
  } catch (err) {
    toast.error(errText(err))
    return false
  }
}

/** Eşitlenecek ayarlar: tüm ferro.* localStorage anahtarları. */
function settingsSnapshot(): SyncSettingsSnapshot {
  const out: SyncSettingsSnapshot = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('ferro.')) continue
    const value = localStorage.getItem(key)
    if (value !== null) out[key] = value
  }
  return out
}

async function push(): Promise<void> {
  busy.value = 'push'
  try {
    if (!(await saveConfig(true))) return
    const res = await invoke('sync:push', {
      settings: cfg.includeSettings ? settingsSnapshot() : undefined
    })
    cfg.lastSyncAt = res.updatedAt
    cfg.lastDirection = 'push'
    toast.success(t('settings.sync.pushed', { sites: res.sites }))
  } catch (err) {
    toast.error(errText(err))
  } finally {
    busy.value = null
  }
}

async function pull(): Promise<void> {
  pullConfirm.value = false
  busy.value = 'pull'
  try {
    if (!(await saveConfig(true))) return
    const res = await invoke('sync:pull', undefined)
    if (!res.found) {
      toast.info(t('settings.sync.remoteEmpty'))
      return
    }
    cfg.lastSyncAt = new Date().toISOString()
    cfg.lastDirection = 'pull'
    if (res.sites) {
      toast.success(
        t('settings.sync.pulledSites', {
          imported: res.sites.imported,
          skipped: res.sites.skipped
        })
      )
    }
    if (res.settings) {
      // Ayarlar localStorage'a yazılır; store'lar açılışta okuduğundan
      // pencere yeniden yüklenerek tutarlı biçimde uygulanır.
      for (const [key, value] of Object.entries(res.settings)) {
        localStorage.setItem(key, value)
      }
      toast.info(t('settings.sync.settingsApplied'))
      setTimeout(() => window.location.reload(), 1200)
    }
  } catch (err) {
    toast.error(errText(err))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <!-- Nasıl çalışır -->
  <fieldset class="section">
    <legend>{{ $t('settings.sync.title') }}</legend>
    <p class="text-body-2 mb-0">{{ $t('settings.sync.intro') }}</p>
  </fieldset>

  <!-- Sync parolası (uçtan uca şifreleme anahtarı) -->
  <fieldset class="section">
    <legend>{{ $t('settings.sync.passwordTitle') }}</legend>
    <v-text-field
      v-model="cfg.syncPassword"
      :label="$t('settings.sync.password')"
      type="password"
      autocomplete="new-password"
      :placeholder="cfg.hasSyncPassword ? savedMark : ''"
      persistent-placeholder
      style="max-width: 420px"
    />
    <p class="text-caption text-medium-emphasis mb-0">
      {{ $t('settings.sync.passwordHint') }}
    </p>
  </fieldset>

  <!-- Kullanıcı seçimi: neler eşitlenecek -->
  <fieldset class="section">
    <legend>{{ $t('settings.sync.includeTitle') }}</legend>
    <v-checkbox
      v-model="cfg.includeSites"
      :label="$t('settings.sync.includeSites')"
      density="compact"
      hide-details
    />
    <v-checkbox
      v-model="cfg.includeSettings"
      :label="$t('settings.sync.includeSettings')"
      density="compact"
      hide-details
    />
  </fieldset>

  <!-- Sağlayıcı -->
  <fieldset class="section">
    <legend>{{ $t('settings.sync.providerTitle') }}</legend>
    <v-radio-group v-model="cfg.provider" inline hide-details class="mb-2">
      <v-radio :label="$t('settings.sync.gist')" value="gist" />
      <v-radio :label="$t('settings.sync.webdav')" value="webdav" />
    </v-radio-group>

    <template v-if="cfg.provider === 'gist'">
      <v-text-field
        v-model="cfg.gistToken"
        :label="$t('settings.sync.gistToken')"
        type="password"
        autocomplete="off"
        :placeholder="cfg.hasToken ? savedMark : ''"
        persistent-placeholder
        style="max-width: 420px"
      />
      <v-text-field
        v-model="cfg.gistId"
        :label="$t('settings.sync.gistId')"
        :hint="$t('settings.sync.gistIdHint')"
        persistent-hint
        style="max-width: 420px"
      />
      <p class="text-caption text-medium-emphasis mt-2 mb-0">
        {{ $t('settings.sync.gistHint') }}
      </p>
    </template>

    <template v-else>
      <v-text-field
        v-model="cfg.webdavUrl"
        :label="$t('settings.sync.webdavUrl')"
        placeholder="https://dav.ornek.com/ferro"
        persistent-placeholder
        style="max-width: 480px"
      />
      <div class="d-flex ga-2" style="max-width: 480px">
        <v-text-field v-model="cfg.webdavUser" :label="$t('connect.user')" />
        <v-text-field
          v-model="cfg.webdavPassword"
          :label="$t('connect.password')"
          type="password"
          autocomplete="off"
          :placeholder="cfg.hasWebdavPassword ? savedMark : ''"
          persistent-placeholder
        />
      </div>
    </template>
  </fieldset>

  <!-- Eylemler -->
  <fieldset class="section">
    <legend>{{ $t('settings.sync.actionsTitle') }}</legend>
    <div class="d-flex align-center ga-2 flex-wrap">
      <v-btn variant="tonal" prepend-icon="$save" :loading="busy === 'save'" @click="saveConfig()">
        {{ $t('settings.sync.saveConfig') }}
      </v-btn>
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-cloud-upload"
        :loading="busy === 'push'"
        :disabled="busy !== null"
        @click="push()"
      >
        {{ $t('settings.sync.push') }}
      </v-btn>
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-cloud-download"
        :loading="busy === 'pull'"
        :disabled="busy !== null"
        @click="pullConfirm = true"
      >
        {{ $t('settings.sync.pull') }}
      </v-btn>
    </div>
    <p class="text-caption text-medium-emphasis mt-3 mb-0">{{ lastSyncText }}</p>
  </fieldset>

  <!-- İndirme onayı: siteler birleştirilir, ayarların üzerine yazılır -->
  <v-dialog v-model="pullConfirm" max-width="460">
    <v-card :title="$t('settings.sync.pullConfirmTitle')">
      <v-card-text class="text-body-2">
        {{ $t('settings.sync.pullConfirmText') }}
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="pullConfirm = false">{{ $t('common.cancel') }}</v-btn>
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-cloud-download" @click="pull()">
          {{ $t('settings.sync.pull') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
