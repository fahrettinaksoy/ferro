<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Protocol, SavedSite, SiteInput } from '@shared/transfer'
import { defaultPort } from '@shared/transfer'
import { useSitesStore } from '@renderer/stores/sites'
import { useToastStore } from '@renderer/stores/toast'
import { invoke } from '@renderer/lib/ipc'
import AppDrawer from '@renderer/components/AppDrawer.vue'

const { t } = useI18n()

const props = defineProps<{ modelValue: boolean; focusSiteId?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const sites = useSitesStore()
const toast = useToastStore()

const emptyForm = (): SiteInput => ({
  name: '',
  folder: '',
  protocol: 'ftp',
  host: '',
  port: 21,
  user: '',
  password: '',
  anonymous: false,
  askPassword: false,
  rejectUnauthorized: false,
  encoding: '',
  comment: '',
  colorLabel: '',
  serverType: 'auto',
  bypassProxy: false,
  localDir: '',
  remoteDir: '',
  syncBrowsing: false,
  dirComparison: false,
  timezoneHours: 0,
  timezoneMinutes: 0,
  transferMode: 'default',
  limitConnections: false,
  maxConnections: 1
})

const form = reactive<SiteInput>(emptyForm())
const selectedId = ref<string | null>(null)
const passwordPlaceholder = ref('')
const tab = ref<'general' | 'advanced' | 'transfer' | 'charset'>('general')
const charsetMode = ref<'utf8' | 'custom'>('utf8')

// ── Seçenek listeleri ──
const baseProtocols = [
  { value: 'ftp', title: 'FTP — Dosya aktarımı iletişim kuralı' },
  { value: 'sftp', title: 'SFTP — SSH dosya aktarımı iletişim kuralı' }
]
const encryptions = computed(() => [
  { value: 'ftp', title: t('sites.enc.plain') },
  { value: 'ftps', title: t('sites.enc.explicit') },
  { value: 'ftps-implicit', title: t('sites.enc.implicit') }
])
const logonTypes = computed(() => [
  { value: 'anonymous', title: t('sites.logon.anonymous') },
  { value: 'normal', title: t('sites.logon.normal') },
  { value: 'ask', title: t('sites.logon.ask') }
])
const serverTypes = computed(() => [
  { value: 'auto', title: t('sites.srv.auto') },
  { value: 'unix', title: t('sites.srv.unix') },
  { value: 'windows', title: t('sites.srv.windows') }
])
const colorLabels = computed(() => [
  { value: '', title: t('sites.color.none') },
  { value: 'red', title: t('sites.color.red') },
  { value: 'green', title: t('sites.color.green') },
  { value: 'blue', title: t('sites.color.blue') },
  { value: 'yellow', title: t('sites.color.yellow') },
  { value: 'cyan', title: t('sites.color.cyan') },
  { value: 'orange', title: t('sites.color.orange') },
  { value: 'purple', title: t('sites.color.purple') }
])

// ── İletişim kuralı / şifreleme ayrışımı (FileZilla deseni) ──
const isFtpFamily = computed(() => form.protocol !== 'sftp')
const isFtps = computed(() => form.protocol === 'ftps' || form.protocol === 'ftps-implicit')

const baseProtocol = computed<'ftp' | 'sftp'>({
  get: () => (form.protocol === 'sftp' ? 'sftp' : 'ftp'),
  set: (v) => {
    form.protocol = v === 'sftp' ? 'sftp' : 'ftp'
  }
})
const encryption = computed<Protocol>({
  get: () => (form.protocol === 'sftp' ? 'ftp' : form.protocol),
  set: (v) => {
    if (form.protocol !== 'sftp') form.protocol = v
  }
})
const logonType = computed<'anonymous' | 'normal' | 'ask'>({
  get: () => (form.anonymous ? 'anonymous' : form.askPassword ? 'ask' : 'normal'),
  set: (v) => {
    form.anonymous = v === 'anonymous'
    form.askPassword = v === 'ask'
    if (form.askPassword) form.password = '' // parola kaydedilmez
    if (form.anonymous) form.user = 'anonymous'
    else if (form.user === 'anonymous') form.user = ''
  }
})

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    await sites.load()
    tab.value = 'general'
    const target = props.focusSiteId ? sites.sites.find((s) => s.id === props.focusSiteId) : null
    if (target) selectSite(target)
    else selectNew()
  }
)

// Protokol değişince (yeni site için) varsayılan portu güncelle.
watch(
  () => form.protocol,
  (p) => {
    if (!selectedId.value) form.port = defaultPort(p)
  }
)

// UTF-8 seçilince özel kodlama temizlenir.
watch(charsetMode, (m) => {
  if (m === 'utf8') form.encoding = ''
})

const isEditing = computed(() => selectedId.value !== null)
const canSave = computed(() => !!form.name.trim() && !!form.host.trim())

// Grup seçimi: mevcut grup adları arasından seç veya yeni ad yaz; boş = grupsuz.
const group = computed<string>({
  get: () => form.folder ?? '',
  set: (v) => {
    form.folder = (v ?? '').toString().trim()
  }
})

function selectNew(): void {
  selectedId.value = null
  passwordPlaceholder.value = ''
  charsetMode.value = 'utf8'
  tab.value = 'general' // seçim değişince form daima Genel sekmesinden başlar
  Object.assign(form, emptyForm())
}

function selectSite(s: SavedSite): void {
  selectedId.value = s.id
  tab.value = 'general' // seçim değişince form daima Genel sekmesinden başlar
  passwordPlaceholder.value = s.hasPassword ? t('sites.savedPassword') : ''
  charsetMode.value = s.encoding && s.encoding.toLowerCase() !== 'utf8' ? 'custom' : 'utf8'
  Object.assign(form, emptyForm(), {
    id: s.id,
    name: s.name,
    folder: s.folder ?? '',
    protocol: s.protocol,
    host: s.host,
    port: s.port,
    user: s.user,
    password: '', // boş = değiştirme
    anonymous: s.anonymous ?? false,
    askPassword: s.askPassword ?? false,
    rejectUnauthorized: s.rejectUnauthorized ?? false,
    encoding: s.encoding ?? '',
    comment: s.comment ?? '',
    colorLabel: s.colorLabel ?? '',
    serverType: s.serverType ?? 'auto',
    bypassProxy: s.bypassProxy ?? false,
    localDir: s.localDir ?? '',
    remoteDir: s.remoteDir ?? '',
    syncBrowsing: s.syncBrowsing ?? false,
    dirComparison: s.dirComparison ?? false,
    timezoneHours: s.timezoneHours ?? 0,
    timezoneMinutes: s.timezoneMinutes ?? 0,
    transferMode: s.transferMode ?? 'default',
    limitConnections: s.limitConnections ?? false,
    maxConnections: s.maxConnections ?? 1
  })
}

async function browseLocal(): Promise<void> {
  const { path } = await invoke('dialog:pickDirectory', { defaultPath: form.localDir || undefined })
  if (path) form.localDir = path
}

async function save(): Promise<void> {
  if (charsetMode.value === 'utf8') form.encoding = ''
  try {
    await toast.promise(t('toast.siteSaving'), sites.save({ ...form, id: selectedId.value ?? undefined }), {
      success: t('toast.siteSaved')
    })
  } catch {
    return // hata toast'ta gösterildi
  }
  const match = sites.sites.find((s) => s.name === form.name && s.host === form.host)
  if (match) {
    // Kayıt sonrası yeniden seçim sekmeyi Genel'e döndürmesin — kullanıcı
    // hangi sekmede kaydettiyse orada kalır (sekme sıfırlama tıklamaya özgü).
    const current = tab.value
    selectSite(match)
    tab.value = current
  }
}

async function remove(): Promise<void> {
  if (!selectedId.value) return
  try {
    await toast.promise(t('toast.siteDeleting'), sites.remove(selectedId.value), {
      success: t('toast.siteDeleted')
    })
    selectNew()
  } catch {
    /* hata toast'ta gösterildi */
  }
}

function connect(): void {
  const s = sites.sites.find((x) => x.id === selectedId.value)
  if (!s) return
  // Sürükleyici hemen kapanır; bağlanma ilerleyişi bağlantı sekmesinde,
  // uzak panelde ("Bağlanıyor…") ve log panelinde izlenir — toast yok.
  emit('update:modelValue', false)
  sites.connect(s).catch(() => {
    /* hata sekmesi + panel şeridi + günlük gösterir */
  })
}
</script>

<template>
  <AppDrawer
    :model-value="modelValue"
    :title="$t('sites.title')"
    :subtitle="$t('sites.subtitle')"
    icon="$serverNetwork"
    :width="960"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- Gövde: solda site listesi + sağda sekmeli form (dikey: opsiyonel uyarı + satır) -->
    <div class="d-flex flex-column flex-grow-1" style="min-height: 0">
      <v-alert
        v-if="!sites.encryptionAvailable"
        type="warning"
        density="compact"
        variant="tonal"
        class="ma-2"
      >
        {{ $t('sites.encWarning') }}
      </v-alert>

      <div class="d-flex flex-grow-1" style="min-height: 0">
        <!-- Site listesi: çizgi yerine bir ton farklı M3 alt-kabı -->
        <div class="site-list">
          <v-list density="compact" nav>
            <v-list-item
              prepend-icon="mdi-plus"
              :title="$t('sites.newSite')"
              :active="!isEditing"
              @click="selectNew()"
            />
            <v-divider class="my-2" />

            <!-- Grupsuz siteler üstte -->
            <v-list-item
              v-for="s in sites.grouped.ungrouped"
              :key="s.id"
              :active="selectedId === s.id"
              @click="selectSite(s)"
            >
              <template #prepend>
                <v-icon :icon="s.protocol === 'sftp' ? '$sftp' : '$server'" />
              </template>
              <v-list-item-title>{{ s.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ s.host }}:{{ s.port }}</v-list-item-subtitle>
            </v-list-item>

            <!-- Gruplar: klasör ikonlu açılır alt grup -->
            <v-list-group v-for="g in sites.grouped.groups" :key="g.name" :value="g.name">
              <template #activator="{ props }">
                <v-list-item v-bind="props" prepend-icon="mdi-folder" :title="g.name" />
              </template>
              <v-list-item
                v-for="s in g.sites"
                :key="s.id"
                :active="selectedId === s.id"
                @click="selectSite(s)"
              >
                <template #prepend>
                  <v-icon :icon="s.protocol === 'sftp' ? '$sftp' : '$server'" />
                </template>
                <v-list-item-title>{{ s.name }}</v-list-item-title>
                <v-list-item-subtitle>{{ s.host }}:{{ s.port }}</v-list-item-subtitle>
              </v-list-item>
            </v-list-group>

            <v-list-item v-if="!sites.sites.length" class="text-disabled text-caption">
              {{ $t('sites.noSites') }}
            </v-list-item>
          </v-list>
        </div>

        <!-- Sekmeli form: genişletilmiş toolbar — üst satır hangi sitenin
             düzenlendiğini / yeni site eklendiğini söyler, sekmeler extension
             slot'unda durur (M3 "toolbar with tabs" deseni). Form alanı,
             liste gibi tonal bir M3 alt-kabıdır; eylemler kabın dibinde. -->
        <div class="site-form flex-grow-1 d-flex flex-column">
          <v-toolbar density="compact" color="transparent" extended extension-height="48" class="site-toolbar">
            <v-toolbar-title class="text-body-1">
              <v-icon
                :icon="isEditing ? 'mdi-pencil' : 'mdi-plus'"
                size="small"
                class="mr-2"
              />
              {{
                isEditing
                  ? $t('sites.editingSite', { name: form.name || '—' })
                  : $t('sites.addingSite')
              }}
            </v-toolbar-title>

            <template #extension>
              <v-tabs v-model="tab" color="primary" grow height="48" class="site-tabs flex-grow-1">
                <v-tab value="general">{{ $t('sites.tabs.general') }}</v-tab>
                <v-tab value="advanced">{{ $t('sites.tabs.advanced') }}</v-tab>
                <v-tab value="transfer">{{ $t('sites.tabs.transfer') }}</v-tab>
                <v-tab value="charset">{{ $t('sites.tabs.charset') }}</v-tab>
              </v-tabs>
            </template>
          </v-toolbar>

          <!-- Sekme panelleri: v-window dikey ortalama yaptığından düz v-show
               kullanılır — içerik daima üstten başlar, sekmeler arası kayma olmaz. -->
          <div class="form-window flex-grow-1 pa-4">
            <!-- ── Genel ── -->
            <div v-if="tab === 'general'" class="d-flex flex-column ga-3">
                <v-text-field v-model="form.name" :label="$t('sites.siteName')" />
                <v-select
                  v-model="baseProtocol"
                  :items="baseProtocols"
                  :label="$t('sites.protocolLabel')"
                />
                <div class="d-flex ga-2">
                  <v-text-field v-model="form.host" :label="$t('connect.server')" />
                  <v-text-field
                    v-model.number="form.port"
                    :label="$t('connect.port')"
                    type="number"
                    style="max-width: 120px"
                  />
                </div>
                <v-select
                  v-if="isFtpFamily"
                  v-model="encryption"
                  :items="encryptions"
                  :label="$t('sites.encryption')"
                />
                <v-select v-model="logonType" :items="logonTypes" :label="$t('sites.logonType')" />
                <div v-if="!form.anonymous" class="d-flex ga-2">
                  <v-text-field v-model="form.user" :label="$t('connect.user')" />
                  <!-- "Parola sorulsun": parola alanı yok — bağlanırken sorulur. -->
                  <v-text-field
                    v-if="!form.askPassword"
                    v-model="form.password"
                    :label="$t('connect.password')"
                    type="password"
                    :placeholder="passwordPlaceholder"
                    persistent-placeholder
                  />
                </div>
                <v-checkbox
                  v-if="isFtps"
                  v-model="form.rejectUnauthorized"
                  :label="$t('connect.verifyCert')"
                />

                <v-divider class="my-1" />

                <v-combobox
                  v-model="group"
                  :items="sites.groupNames"
                  :label="$t('sites.group')"
                  prepend-inner-icon="mdi-folder"
                  clearable
                />
                <v-select
                  v-model="form.colorLabel"
                  :items="colorLabels"
                  :label="$t('sites.bgColor')"
                  style="max-width: 220px"
                />
                <v-textarea v-model="form.comment" :label="$t('sites.notes')" rows="3" auto-grow />
            </div>

            <!-- ── Gelişmiş ── -->
            <div v-if="tab === 'advanced'" class="d-flex flex-column ga-3">
                <v-select
                  v-model="form.serverType"
                  :items="serverTypes"
                  :label="$t('sites.serverType')"
                  style="max-width: 280px"
                />
                <v-checkbox v-model="form.bypassProxy" :label="$t('sites.bypassProxy')" />

                <div class="d-flex ga-2 align-center">
                  <v-text-field v-model="form.localDir" :label="$t('sites.localDir')" />
                  <v-btn variant="tonal" @click="browseLocal()">{{ $t('sites.browse') }}</v-btn>
                </div>
                <v-text-field v-model="form.remoteDir" :label="$t('sites.remoteDir')" />

                <v-checkbox v-model="form.syncBrowsing" :label="$t('sites.syncBrowsing')" />
                <v-checkbox v-model="form.dirComparison" :label="$t('sites.dirComparison')" />

                <v-divider class="my-1" />
                <div class="text-body-2">{{ $t('sites.timezone') }}</div>
                <div class="d-flex ga-2 align-center">
                  <v-text-field
                    v-model.number="form.timezoneHours"
                    type="number"
                    style="max-width: 110px"
                  />
                  <span class="text-body-2">{{ $t('sites.hours') }}</span>
                  <v-text-field
                    v-model.number="form.timezoneMinutes"
                    type="number"
                    style="max-width: 110px"
                  />
                  <span class="text-body-2">{{ $t('sites.minutes') }}</span>
                </div>
            </div>

            <!-- ── Aktarım ayarları ── -->
            <div v-if="tab === 'transfer'" class="d-flex flex-column ga-2">
                <div class="text-body-2">{{ $t('sites.transferMode') }}</div>
                <v-radio-group v-model="form.transferMode" inline>
                  <v-radio :label="$t('sites.mode.default')" value="default" />
                  <v-radio :label="$t('sites.mode.active')" value="active" />
                  <v-radio :label="$t('sites.mode.passive')" value="passive" />
                </v-radio-group>

                <v-checkbox
                  v-model="form.limitConnections"
                  :label="$t('sites.limitConnections')"
                />
                <div class="d-flex ga-2 align-center ml-8">
                  <span class="text-body-2">{{ $t('sites.maxConnections') }}</span>
                  <v-text-field
                    v-model.number="form.maxConnections"
                    type="number"
                    min="1"
                    :disabled="!form.limitConnections"
                    style="max-width: 110px"
                  />
                </div>
            </div>

            <!-- ── Karakter kümesi ── -->
            <div v-if="tab === 'charset'" class="d-flex flex-column ga-2">
                <div class="text-body-2">{{ $t('sites.charsetIntro') }}</div>
                <v-radio-group v-model="charsetMode">
                  <v-radio :label="$t('sites.charsetUtf8')" value="utf8" />
                  <v-radio :label="$t('sites.charsetCustom')" value="custom" />
                </v-radio-group>
                <v-text-field
                  v-model="form.encoding"
                  :label="$t('sites.encodingLabel')"
                  :disabled="charsetMode !== 'custom'"
                  placeholder="ISO-8859-9"
                  style="max-width: 260px"
                />
                <v-alert type="info" variant="tonal" density="compact" class="mt-2">
                  {{ $t('sites.charsetNote') }}
                </v-alert>
            </div>
          </div>

          <!-- Eylemler: form kabının dibinde, bir ton koyu şerit (M3 katmanı). -->
          <div class="form-actions d-flex align-center pa-2">
            <v-btn
              v-if="isEditing"
              color="error"
              variant="text"
              prepend-icon="mdi-delete"
              @click="remove()"
            >
              {{ $t('common.delete') }}
            </v-btn>
            <v-spacer />
            <v-btn :disabled="!canSave" variant="tonal" prepend-icon="$save" @click="save()">
              {{ $t('common.save') }}
            </v-btn>
            <v-btn
              v-if="isEditing"
              color="primary"
              variant="flat"
              prepend-icon="$connect"
              class="ml-2"
              @click="connect()"
            >
              {{ $t('common.connect') }}
            </v-btn>
          </div>
        </div>
      </div>

    </div>
  </AppDrawer>
</template>

<style scoped>
/* M3: sınır çizgisi yok — liste, formdan bir ton farklı kap ve köşe
   yumuşamasıyla ayrışır. */
.site-list {
  width: 240px;
  flex: 0 0 240px;
  overflow-y: auto;
  margin: 8px;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container));
}
.site-list :deep(.v-list) {
  background: transparent;
}
/* Sol girinti/boşluğu daralt: üst seviye öğeler ve grup başlıkları küçük
   sol boşluk, grup içindeki (nested) öğeler ise daha az girinti alsın. */
.site-list :deep(.v-list-item) {
  padding-inline-start: 8px !important;
}
.site-list :deep(.v-list-group__items .v-list-item) {
  padding-inline-start: 8px !important;
}
/* İkon ile metin arası boşluğu daralt. Vuetify 4'te bu boşluk sabit değil,
   --v-list-prepend-gap değişkeninden gelir (varsayılan 32px). Değişkeni ezmek
   spacer'ın genişliğini doğrudan belirler. */
.site-list :deep(.v-list) {
  --v-list-prepend-gap: 8px;
}
/* Form alanı: liste gibi tonal M3 alt-kabı — soldaki listeyle 8px boşluk,
   köşe yumuşaması ve bir ton farklı zemin. */
.site-form {
  margin: 8px 8px 8px 0;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container));
  min-width: 0;
  overflow: hidden;
}
/* Eylem şeridi: form kabının dibinde, bir ton daha koyu zemin (M3 katmanı). */
.form-actions {
  flex: 0 0 auto;
  background: rgb(var(--v-theme-surface-container-high));
}
/* Toolbar dikey flex sütununda büyümesin — başlık + extension (48+48) sabit,
   form içeriği kalan alanı alır. */
.site-toolbar {
  flex: 0 0 auto;
}
/* Sekmeler toolbar extension'ında (yatay satır): tüm genişliği kaplasın ki
   grow eşit bölüşsün. */
.site-tabs {
  flex: 1 1 auto;
}
.form-window {
  overflow-y: auto;
}
</style>
