<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore, errText } from '@renderer/stores/toast'
import { useSyncStore } from '@renderer/stores/sync'
import { useSitesStore } from '@renderer/stores/sites'
import { useRules } from '@renderer/lib/rules'
import type { SyncConfigPublic } from '@shared/sync'
import AppDrawer from '@renderer/components/AppDrawer.vue'

// ── Senkronizasyon paneli (kendi navigation-drawer'ı — Ekipler/Ayarlar gibi) ─
// Tek-kullanıcı cihazlar-arası senkron: siteler + uygulama ayarları uçtan uca
// şifreli (Gist/WebDAV). Ayarlar'dan buraya, kendi paneline taşındı.
// Geliştirmeler: açılışta otomatik çek, değişince otomatik it, çakışma/bayatlık
// uyarısı, durum rozeti.

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const { t } = useI18n()
const toast = useToastStore()
const sync = useSyncStore()
const sites = useSitesStore()
const { required } = useRules()

const cfg = reactive({
  provider: 'gist' as 'gist' | 'webdav',
  includeSites: true,
  includeSettings: true,
  autoSync: false,
  autoPush: false,
  gistId: '',
  gistToken: '',
  hasToken: false,
  webdavUrl: '',
  webdavUser: '',
  webdavPassword: '',
  hasWebdavPassword: false,
  syncPassword: '',
  hasSyncPassword: false
})
const busy = ref<'save' | 'push' | 'pull' | 'peek' | null>(null)
const pullConfirm = ref(false)
const overwriteConfirm = ref(false)
// WebDAV seçiliyken adres zorunlu; Gist seçiliyken alanların hepsi opsiyonel
// (token/parola boş = "kayıtlıyı koru") — bu yüzden yalnızca bu alan `rules` alır.
const formValid = ref(true)

const savedMark = computed(() => t('sites.savedPassword'))

function applyPublic(p: SyncConfigPublic): void {
  cfg.provider = p.provider
  cfg.includeSites = p.include.sites
  cfg.includeSettings = p.include.settings
  cfg.autoSync = p.autoSync
  cfg.autoPush = p.autoPush
  cfg.gistId = p.gist.gistId
  cfg.hasToken = p.gist.hasToken
  cfg.webdavUrl = p.webdav.url
  cfg.webdavUser = p.webdav.user
  cfg.hasWebdavPassword = p.webdav.hasPassword
  cfg.hasSyncPassword = p.hasSyncPassword
  // Sır girişleri temizlenir — alanlar "kayıtlı" yer tutucusunu gösterir.
  cfg.gistToken = ''
  cfg.webdavPassword = ''
  cfg.syncPassword = ''
}

// Panel açılınca yapılandırmayı yükle + durum için sessiz peek.
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    try {
      await sync.load()
      if (sync.config) applyPublic(sync.config)
      if (sync.isConfigured) void sync.peek().catch(() => {})
    } catch (err) {
      toast.error(errText(err))
    }
  }
)

async function saveConfig(silent = false): Promise<boolean> {
  if (!silent) busy.value = 'save'
  try {
    await sync.save({
      provider: cfg.provider,
      include: { sites: cfg.includeSites, settings: cfg.includeSettings },
      autoSync: cfg.autoSync,
      autoPush: cfg.autoPush,
      gist: { gistId: cfg.gistId, token: cfg.gistToken || undefined },
      webdav: {
        url: cfg.webdavUrl,
        user: cfg.webdavUser,
        password: cfg.webdavPassword || undefined
      },
      syncPassword: cfg.syncPassword || undefined
    })
    if (sync.config) applyPublic(sync.config)
    if (!silent) toast.success(t('cloudSync.saved'))
    return true
  } catch (err) {
    toast.error(errText(err))
    return false
  } finally {
    if (!silent) busy.value = null
  }
}

async function checkStatus(): Promise<void> {
  busy.value = 'peek'
  try {
    if (!(await saveConfig(true))) return
    await sync.peek()
    toast.info(
      sync.remoteChanged
        ? t('cloudSync.statusRemoteChanged')
        : sync.remoteUpdatedAt === null
          ? t('cloudSync.remoteEmpty')
          : t('cloudSync.statusUpToDate')
    )
  } catch (err) {
    toast.error(errText(err))
  } finally {
    busy.value = null
  }
}

/** Gönder: önce uzak durumu yokla — uzakta yeni değişiklik varsa üzerine
 *  yazma onayı iste (kör üzerine yazmayı engelle). */
async function push(): Promise<void> {
  busy.value = 'push'
  try {
    if (!(await saveConfig(true))) {
      busy.value = null
      return
    }
    await sync.peek().catch(() => {})
    if (sync.remoteChanged === true) {
      overwriteConfirm.value = true // onay diyaloğu doPush'u çağırır (busy 'push' kalır)
      return
    }
    await doPush()
  } catch (err) {
    toast.error(errText(err))
    busy.value = null
  }
}

async function doPush(): Promise<void> {
  overwriteConfirm.value = false
  busy.value = 'push'
  try {
    if (!(await saveConfig(true))) return
    const res = await sync.push()
    toast.success(t('cloudSync.pushed', { sites: res.sites }))
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
    const res = await sync.pull(true)
    if (!res.found) {
      toast.info(t('cloudSync.remoteEmpty'))
      return
    }
    if (res.sites) {
      toast.success(
        t('cloudSync.pulledSites', {
          imported: res.sites.imported,
          skipped: res.sites.skipped
        })
      )
    }
    await sites.load()
    if (res.settingsChanged) {
      // Ayarlar store'ları açılışta okur; tutarlı uygulama için pencere yenilenir.
      toast.info(t('cloudSync.settingsApplied'))
      setTimeout(() => window.location.reload(), 1200)
    }
  } catch (err) {
    toast.error(errText(err))
  } finally {
    busy.value = null
  }
}

// Durum rozeti metni + rengi.
const statusChip = computed(() => {
  if (!sync.isConfigured) return { color: 'secondary', text: t('cloudSync.notConfigured') }
  if (sync.remoteChanged === true)
    return { color: 'warning', text: t('cloudSync.badgeRemoteChanged') }
  if (sync.peeked) return { color: 'success', text: t('cloudSync.badgeUpToDate') }
  return { color: 'info', text: t('cloudSync.badgeUnknown') }
})

const lastSyncText = computed(() => {
  const c = sync.config
  if (!c?.lastSyncAt) return t('cloudSync.neverSynced')
  const when = new Date(c.lastSyncAt).toLocaleString()
  const dir = c.lastDirection === 'push' ? t('cloudSync.push_dir') : t('cloudSync.pull_dir')
  return t('cloudSync.lastSync', { when, dir })
})
</script>

<template>
  <AppDrawer
    :model-value="modelValue"
    :title="$t('cloudSync.title')"
    :subtitle="$t('cloudSync.subtitle')"
    icon="mdi-cloud-sync"
    :width="640"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-form v-model="formValid" class="sync-scroll flex-grow-1 pa-4">
      <p class="text-body-medium text-medium-emphasis mb-4">{{ $t('cloudSync.intro') }}</p>

      <!-- Durum -->
      <div class="section-box mb-4">
        <div class="d-flex align-center ga-2 flex-wrap">
          <v-chip :color="statusChip.color" size="small" variant="tonal">
            {{ statusChip.text }}
          </v-chip>
          <span class="text-body-small text-medium-emphasis">{{ lastSyncText }}</span>
          <v-spacer />
          <v-btn
            size="small"
            variant="text"
            prepend-icon="mdi-refresh"
            :loading="busy === 'peek'"
            :disabled="!sync.isConfigured || busy !== null"
            @click="checkStatus()"
          >
            {{ $t('cloudSync.checkStatus') }}
          </v-btn>
        </div>
      </div>

      <!-- Sync parolası (uçtan uca şifreleme anahtarı) -->
      <v-text-field
        v-model="cfg.syncPassword"
        :label="$t('cloudSync.password')"
        type="password"
        autocomplete="new-password"
        :placeholder="cfg.hasSyncPassword ? savedMark : ''"
        persistent-placeholder
        density="comfortable"
        class="mb-1"
      />
      <p class="text-body-small text-medium-emphasis mb-4">{{ $t('cloudSync.passwordHint') }}</p>

      <!-- Neler eşitlenecek -->
      <div class="text-label-large mb-1">{{ $t('cloudSync.includeTitle') }}</div>
      <v-checkbox
        v-model="cfg.includeSites"
        :label="$t('cloudSync.includeSites')"
        density="compact"
        hide-details
      />
      <v-checkbox
        v-model="cfg.includeSettings"
        :label="$t('cloudSync.includeSettings')"
        density="compact"
        hide-details
        class="mb-3"
      />

      <!-- Otomatik senkron -->
      <div class="text-label-large mb-1">{{ $t('cloudSync.autoTitle') }}</div>
      <v-switch
        v-model="cfg.autoSync"
        :label="$t('cloudSync.autoSync')"
        color="primary"
        density="compact"
        hide-details
      />
      <v-switch
        v-model="cfg.autoPush"
        :label="$t('cloudSync.autoPush')"
        color="primary"
        density="compact"
        hide-details
        class="mb-3"
      />

      <!-- Sağlayıcı -->
      <div class="text-label-large mb-1">{{ $t('cloudSync.providerTitle') }}</div>
      <v-radio-group v-model="cfg.provider" inline hide-details class="mb-2">
        <v-radio label="GitHub Gist" value="gist" />
        <v-radio label="WebDAV" value="webdav" />
      </v-radio-group>

      <template v-if="cfg.provider === 'gist'">
        <v-text-field
          v-model="cfg.gistToken"
          :label="$t('cloudSync.gistToken')"
          type="password"
          autocomplete="off"
          :placeholder="cfg.hasToken ? savedMark : ''"
          persistent-placeholder
          density="comfortable"
          class="mb-2"
        />
        <v-text-field
          v-model="cfg.gistId"
          :label="$t('cloudSync.gistId')"
          :hint="$t('cloudSync.gistIdHint')"
          persistent-hint
          density="comfortable"
        />
      </template>
      <template v-else>
        <v-text-field
          v-model="cfg.webdavUrl"
          :label="$t('cloudSync.webdavUrl')"
          placeholder="https://dav.ornek.com/ferro"
          :rules="[required]"
          hide-details="auto"
          density="comfortable"
          class="mb-2"
        />
        <div class="d-flex ga-2">
          <v-text-field
            v-model="cfg.webdavUser"
            :label="$t('connect.user')"
            density="comfortable"
          />
          <v-text-field
            v-model="cfg.webdavPassword"
            :label="$t('connect.password')"
            type="password"
            autocomplete="off"
            :placeholder="cfg.hasWebdavPassword ? savedMark : ''"
            persistent-placeholder
            density="comfortable"
          />
        </div>
      </template>
    </v-form>

    <!-- Alt eylem şeridi (AppDrawer footer slot) -->
    <template #footer>
      <v-btn
        variant="tonal"
        prepend-icon="$save"
        :loading="busy === 'save'"
        :disabled="!formValid"
        @click="saveConfig()"
      >
        {{ $t('common.save') }}
      </v-btn>
      <v-spacer />
      <v-btn
        variant="tonal"
        prepend-icon="mdi-cloud-upload"
        :loading="busy === 'push'"
        :disabled="busy !== null || !formValid"
        @click="push()"
      >
        {{ $t('cloudSync.push') }}
      </v-btn>
      <v-btn
        color="primary"
        variant="flat"
        prepend-icon="mdi-cloud-download"
        class="ml-2"
        :loading="busy === 'pull'"
        :disabled="busy !== null || !formValid"
        @click="pullConfirm = true"
      >
        {{ $t('cloudSync.pull') }}
      </v-btn>
    </template>

    <!-- İndirme onayı -->
    <v-dialog v-model="pullConfirm" max-width="460">
      <v-card :title="$t('cloudSync.pullConfirmTitle')">
        <v-card-text class="text-body-medium">{{ $t('cloudSync.pullConfirmText') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="pullConfirm = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-cloud-download" @click="pull()">
            {{ $t('cloudSync.pull') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Üzerine yazma onayı (uzakta yeni değişiklik var) -->
    <v-dialog v-model="overwriteConfirm" max-width="460">
      <v-card :title="$t('cloudSync.overwriteTitle')">
        <v-card-text class="text-body-medium">{{ $t('cloudSync.overwriteText') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="((overwriteConfirm = false), (busy = null))">
            {{ $t('common.cancel') }}
          </v-btn>
          <v-btn color="warning" variant="tonal" prepend-icon="mdi-cloud-upload" @click="doPush()">
            {{ $t('cloudSync.overwriteConfirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppDrawer>
</template>

<style scoped>
.sync-scroll {
  overflow-y: auto;
  min-height: 0;
}
/* Durum kutusu: bir ton koyu M3 kabı. */
.section-box {
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container));
  padding: 10px 14px;
}
</style>
