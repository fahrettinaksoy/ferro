<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// VTreeview/VHotkey vb. şablonda <v-treeview> olarak kullanılır; vite-plugin-vuetify
// autoImport bunları otomatik (tree-shake ederek) içe aktarır — elle import gerekmez.
import {
  useUiStore,
  type LangChoice,
  type TlsVersion,
  type ConnectionPrefs,
  type FtpPrefs,
  type TransferPrefs,
  type TransferTypesPrefs,
  type FileExistsPrefs,
  type InterfacePrefs,
  type PasswordPrefs,
  type AppearancePrefs,
  type DateTimePrefs,
  type FileSizePrefs,
  type FileListsPrefs,
  type EditingPrefs,
  type FileAssocPrefs,
  type UpdatePrefs,
  type LoggingPrefs,
  type DebugPrefs,
  type FtpActivePrefs,
  type FtpPassivePrefs,
  type FtpProxyPrefs,
  type SftpPrefs,
  type GenericProxyPrefs
} from '@renderer/stores/ui'

import AppDrawer from '@renderer/components/AppDrawer.vue'
import LocalePreview from '@renderer/components/LocalePreview.vue'
import {
  SCHEME_OPTIONS,
  FONT_OPTIONS,
  type ThemeContrast,
  type ThemeFonts
} from '@renderer/lib/theme'

const { t } = useI18n()
const ui = useUiStore()

// ── Tema Studio (Ayarlar → Arayüz → Temalar) — canlı uygular ──
const contrastOptions = computed<{ value: ThemeContrast; icon: string; title: string }[]>(() => [
  { value: 'standard', icon: 'mdi-brightness-7', title: t('settings.themesPage.contrastStandard') },
  { value: 'medium', icon: 'mdi-brightness-6', title: t('settings.themesPage.contrastMedium') },
  { value: 'high', icon: 'mdi-brightness-5', title: t('settings.themesPage.contrastHigh') }
])
function setFontField(field: keyof ThemeFonts, value: string | number): void {
  ui.setFonts({ ...ui.fonts, [field]: value })
}
function onSeedInput(v: string): void {
  const hex = (v ?? '').trim()
  if (/^#?[0-9a-fA-F]{6}$/.test(hex)) ui.setThemeSeed(hex.startsWith('#') ? hex : '#' + hex)
}

// Açık/kapalı durumu store'dan gelir (genel panel kontrolcüsü).
const isOpen = computed(() => ui.openPanel === 'settings')

// ── Sayfa ağacı (FileZilla benzeri). Yeni sayfalar buraya eklenir. ──
interface PageNode {
  key: string
  children?: PageNode[]
}
const tree: PageNode[] = [
  {
    key: 'connection',
    children: [
      { key: 'ftp', children: [{ key: 'ftpActive' }, { key: 'ftpPassive' }, { key: 'ftpProxy' }] },
      { key: 'sftp' },
      { key: 'genericProxy' }
    ]
  },
  { key: 'transfer', children: [{ key: 'transferTypes' }, { key: 'transferExists' }] },
  {
    key: 'interface',
    children: [
      { key: 'passwords' },
      { key: 'themes' },
      { key: 'dateTime' },
      { key: 'fileSize' },
      { key: 'fileLists' },
      { key: 'lang' }
    ]
  },
  { key: 'editing', children: [{ key: 'fileAssoc' }] },
  { key: 'updates' },
  { key: 'logging' },
  { key: 'debug' }
]

// VTreeview öğeleri (çevrili başlıklarla). item-value=key, item-title=title.
interface TreeItem {
  key: string
  title: string
  children?: TreeItem[]
}
const treeItems = computed<TreeItem[]>(() => {
  const build = (nodes: PageNode[]): TreeItem[] =>
    nodes.map((n) => ({
      key: n.key,
      title: t('settings.pages.' + n.key),
      ...(n.children ? { children: build(n.children) } : {})
    }))
  return build(tree)
})

// Seçili (aktif) sayfa ve açık gruplar — v-treeview modelleri.
const activated = ref<string[]>(['connection'])
const opened = ref<string[]>(['connection', 'ftp', 'transfer', 'interface', 'editing'])
const selected = computed(() => activated.value[0] ?? 'connection')

// Boş seçimi yok say (en az bir sayfa hep seçili kalsın).
function onActivated(val: unknown): void {
  const arr = val as string[]
  if (arr.length) activated.value = arr
}

// ── Taslak (draft): açılışta store'dan kopyalanır, Tamam'da uygulanır. ──
interface Draft {
  languageChoice: LangChoice
  connection: ConnectionPrefs
  ftp: FtpPrefs
  transfer: TransferPrefs
  transferTypes: TransferTypesPrefs
  fileExists: FileExistsPrefs
  iface: InterfacePrefs
  passwords: PasswordPrefs
  appearance: AppearancePrefs
  dateTime: DateTimePrefs
  fileSize: FileSizePrefs
  fileLists: FileListsPrefs
  editing: EditingPrefs
  fileAssoc: FileAssocPrefs
  updates: UpdatePrefs
  logging: LoggingPrefs
  debug: DebugPrefs
  ftpActive: FtpActivePrefs
  ftpPassive: FtpPassivePrefs
  ftpProxy: FtpProxyPrefs
  sftp: SftpPrefs
  genericProxy: GenericProxyPrefs
}
const draft = reactive<Draft>(snapshot())

function snapshot(): Draft {
  return {
    languageChoice: ui.languageChoice,
    connection: { ...ui.prefs.connection },
    ftp: { ...ui.prefs.ftp },
    transfer: { ...ui.prefs.transfer },
    transferTypes: {
      ...ui.prefs.transferTypes,
      asciiExtensions: [...ui.prefs.transferTypes.asciiExtensions]
    },
    fileExists: { ...ui.prefs.fileExists },
    iface: { ...ui.prefs.iface },
    passwords: { ...ui.prefs.passwords },
    appearance: { ...ui.prefs.appearance },
    dateTime: { ...ui.prefs.dateTime },
    fileSize: { ...ui.prefs.fileSize },
    fileLists: { ...ui.prefs.fileLists },
    editing: { ...ui.prefs.editing },
    fileAssoc: { ...ui.prefs.fileAssoc },
    updates: { ...ui.prefs.updates },
    logging: { ...ui.prefs.logging },
    debug: { ...ui.prefs.debug },
    ftpActive: { ...ui.prefs.ftpActive },
    ftpPassive: { ...ui.prefs.ftpPassive },
    ftpProxy: { ...ui.prefs.ftpProxy },
    sftp: { ...ui.prefs.sftp, keys: [...ui.prefs.sftp.keys] },
    genericProxy: { ...ui.prefs.genericProxy }
  }
}

function resetDraft(): void {
  Object.assign(draft, snapshot())
}

watch(isOpen, (open) => {
  if (open) {
    resetDraft()
    activated.value = ['connection']
  }
})

const tlsVersions: { value: TlsVersion; title: string }[] = [
  { value: '1.0', title: 'TLS 1.0' },
  { value: '1.1', title: 'TLS 1.1' },
  { value: '1.2', title: 'TLS 1.2' },
  { value: '1.3', title: 'TLS 1.3' }
]

const tolerances = computed(() => [
  { value: 'low', title: t('settings.transferOpts.tolLow') },
  { value: 'normal', title: t('settings.transferOpts.tolNormal') },
  { value: 'high', title: t('settings.transferOpts.tolHigh') }
])

const fileExistsActions = computed(() => [
  { value: 'ask', title: t('settings.fileExists.actAsk') },
  { value: 'overwrite', title: t('settings.fileExists.actOverwrite') },
  { value: 'overwrite-newer', title: t('settings.fileExists.actOverwriteNewer') },
  { value: 'overwrite-size', title: t('settings.fileExists.actOverwriteSize') },
  { value: 'resume', title: t('settings.fileExists.actResume') },
  { value: 'rename', title: t('settings.fileExists.actRename') },
  { value: 'skip', title: t('settings.fileExists.actSkip') }
])

const layoutOptions = computed(() => [
  { value: 'classic', title: t('settings.iface.layoutClassic') },
  { value: 'explorer', title: t('settings.iface.layoutExplorer') },
  { value: 'side-by-side', title: t('settings.iface.layoutSideBySide') },
  { value: 'top-bottom', title: t('settings.iface.layoutTopBottom') }
])
const msgLogOptions = computed(() => [
  { value: 'above-panes', title: t('settings.iface.msgLogAbove') },
  { value: 'as-tab', title: t('settings.iface.msgLogTab') },
  { value: 'hidden', title: t('settings.iface.msgLogHidden') }
])
const newConnOptions = computed(() => [
  { value: 'ask', title: t('settings.iface.newConnAsk') },
  { value: 'new-tab', title: t('settings.iface.newConnNewTab') },
  { value: 'current-tab', title: t('settings.iface.newConnCurrentTab') }
])
const sortModeOptions = computed(() => [
  { value: 'dirs-first', title: t('settings.fileLists.sortDirsFirst') },
  { value: 'files-first', title: t('settings.fileLists.sortFilesFirst') },
  { value: 'mixed', title: t('settings.fileLists.sortMixed') }
])
const nameSortOptions = computed(() => [
  { value: 'case-sensitive', title: t('settings.fileLists.nameCaseSensitive') },
  { value: 'case-insensitive', title: t('settings.fileLists.nameCaseInsensitive') },
  { value: 'natural', title: t('settings.fileLists.nameNatural') }
])
const dblFileOptions = computed(() => [
  { value: 'transfer', title: t('settings.fileLists.dblTransfer') },
  { value: 'view-edit', title: t('settings.fileLists.dblViewEdit') },
  { value: 'none', title: t('settings.fileLists.dblNone') }
])
const dblDirOptions = computed(() => [
  { value: 'open', title: t('settings.fileLists.dblOpen') },
  { value: 'none', title: t('settings.fileLists.dblNone') }
])

// Desteklenen diller (liste-kutusu için). Ferro şu an tr/en locale'ine sahip.
const languages = computed<{ value: LangChoice; title: string }[]>(() => [
  { value: 'system', title: t('settings.langPage.systemDefault') },
  { value: 'tr', title: 'Türkçe (tr)' },
  { value: 'en', title: 'English (en)' }
])

// Seçilen (taslak) dilin çözülmüş locale'i — <v-locale-provider> önizlemesi için.
// Henüz Kaydet'e basılmadığından global dilden farklı olabilir.
const previewLocale = computed(() => {
  const c = draft.languageChoice
  if (c === 'tr' || c === 'en') return c
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'
})

const updateFreqOptions = computed(() => [
  { value: 'daily', title: t('settings.updates.freqDaily') },
  { value: 'weekly', title: t('settings.updates.freqWeekly') },
  { value: 'never', title: t('settings.updates.freqNever') }
])
const updateChannelOptions = computed(() => [
  { value: 'stable', title: t('settings.updates.chStable') },
  { value: 'beta', title: t('settings.updates.chBeta') },
  { value: 'nightly', title: t('settings.updates.chNightly') }
])
const debugLevels = computed(() => [
  { value: 0, title: t('settings.debug.lvl0') },
  { value: 1, title: t('settings.debug.lvl1') },
  { value: 2, title: t('settings.debug.lvl2') },
  { value: 3, title: t('settings.debug.lvl3') },
  { value: 4, title: t('settings.debug.lvl4') }
])

// Parolalar: ana parola alanları (kalıcı saklanmaz; yalnızca taslak/UI)
const masterPw = ref('')
const masterPwConfirm = ref('')

// Boyut biçimi örnek önizlemesi
const sizeExamples = computed(() => {
  const nums = [12, 100, 1234, 1058817, 123456789, 63674225613426]
  const sep = draft.fileSize.thousandsSep
  return nums.map((n) =>
    sep ? n.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : String(n)
  )
})

// ASCII uzantı listesi etkileşimi
const newExt = ref('')
const selectedExt = ref<string | null>(null)
function addExt(): void {
  const e = newExt.value.trim().replace(/^\./, '').toLowerCase()
  if (e && !draft.transferTypes.asciiExtensions.includes(e)) {
    draft.transferTypes.asciiExtensions.push(e)
    draft.transferTypes.asciiExtensions.sort()
    selectedExt.value = e
  }
  newExt.value = ''
}
function removeExt(): void {
  if (!selectedExt.value) return
  const i = draft.transferTypes.asciiExtensions.indexOf(selectedExt.value)
  if (i >= 0) draft.transferTypes.asciiExtensions.splice(i, 1)
  selectedExt.value = null
}

function close(): void {
  ui.closeDrawer()
}

async function apply(): Promise<void> {
  // Tema (renk/şema/varyant/kontrast/font) canlı uygulanır — Theme Studio deseni.
  if (draft.languageChoice !== ui.languageChoice) ui.setLanguageChoice(draft.languageChoice)
  // Hız sınırı motora uygulanır (etkin değilse 0 = sınırsız).
  const effBw = draft.transfer.enableSpeedLimit ? draft.transfer.downloadLimitKiB : 0
  if (effBw !== ui.bandwidthKBs) await ui.setBandwidth(effBw)
  ui.savePrefs({
    connection: { ...draft.connection },
    ftp: { ...draft.ftp },
    transfer: { ...draft.transfer },
    transferTypes: {
      ...draft.transferTypes,
      asciiExtensions: [...draft.transferTypes.asciiExtensions]
    },
    fileExists: { ...draft.fileExists },
    iface: { ...draft.iface },
    passwords: { ...draft.passwords },
    appearance: { ...draft.appearance },
    dateTime: { ...draft.dateTime },
    fileSize: { ...draft.fileSize },
    fileLists: { ...draft.fileLists },
    editing: { ...draft.editing },
    fileAssoc: { ...draft.fileAssoc },
    updates: { ...draft.updates },
    logging: { ...draft.logging },
    debug: { ...draft.debug },
    ftpActive: { ...draft.ftpActive },
    ftpPassive: { ...draft.ftpPassive },
    ftpProxy: { ...draft.ftpProxy },
    sftp: { ...draft.sftp, keys: [...draft.sftp.keys] },
    genericProxy: { ...draft.genericProxy }
  })
  close()
}
</script>

<template>
  <AppDrawer
    :model-value="isOpen"
    :title="$t('settings.title')"
    icon="$settings"
    :width="960"
    @update:model-value="
      (v) => {
        if (!v) close()
      }
    "
  >
    <div class="settings-body d-flex flex-grow-1">
      <!-- Sol: sayfa ağacı -->
      <div class="page-tree border-e">
        <div class="px-3 pt-3 pb-1 text-caption text-medium-emphasis">
          {{ $t('settings.selectPage') }}
        </div>
        <v-treeview
          :items="treeItems"
          :activated="activated"
          :opened="opened"
          item-value="key"
          item-title="title"
          activatable
          active-strategy="single-independent"
          indent-lines
          fluid
          @update:activated="onActivated"
          @update:opened="opened = $event"
        />
      </div>

      <!-- Sağ: seçili sayfa içeriği -->
      <div class="pa-4 page-content">
        <!-- Bağlantı -->
        <template v-if="selected === 'connection'">
          <fieldset class="section">
            <legend>{{ $t('settings.connection.timeoutTitle') }}</legend>
            <div class="d-flex align-center ga-2">
              <span>{{ $t('settings.connection.timeoutLabel') }}</span>
              <v-text-field
                v-model.number="draft.connection.timeoutSec"
                type="number"
                style="max-width: 90px"
              />
              <span class="text-caption text-medium-emphasis">
                {{ $t('settings.connection.timeoutRange') }}
              </span>
            </div>
            <p class="text-caption text-medium-emphasis mt-2 mb-0">
              {{ $t('settings.connection.timeoutHint') }}
            </p>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.connection.reconnectTitle') }}</legend>
            <div class="d-flex align-center ga-2">
              <span class="reconnect-label">{{ $t('settings.connection.maxRetries') }}</span>
              <v-text-field
                v-model.number="draft.connection.maxRetries"
                type="number"
                style="max-width: 90px"
              />
              <span class="text-caption text-medium-emphasis">
                {{ $t('settings.connection.maxRetriesRange') }}
              </span>
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="reconnect-label">{{ $t('settings.connection.retryDelay') }}</span>
              <v-text-field
                v-model.number="draft.connection.retryDelaySec"
                type="number"
                style="max-width: 90px"
              />
              <span class="text-caption text-medium-emphasis">
                {{ $t('settings.connection.retryDelayRange') }}
              </span>
            </div>
            <p class="text-caption text-medium-emphasis mt-2 mb-0">
              {{ $t('settings.connection.reconnectHint') }}
            </p>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.connection.tlsTitle') }}</legend>
            <div class="d-flex align-center ga-2">
              <span>{{ $t('settings.connection.tlsMinVersion') }}</span>
              <v-select
                v-model="draft.connection.tlsMinVersion"
                :items="tlsVersions"
                style="max-width: 140px"
              />
            </div>
            <v-checkbox
              v-model="draft.connection.tlsUseSystemTrust"
              :label="$t('settings.connection.tlsSystemTrust')"
              class="mt-1"
            />
          </fieldset>
        </template>

        <!-- Bağlantı → FTP -->
        <template v-else-if="selected === 'ftp'">
          <fieldset class="section">
            <legend>{{ $t('settings.ftp.generalTitle') }}</legend>
            <p class="text-caption text-medium-emphasis mt-0 mb-2">
              {{ $t('settings.ftp.generalHint') }}
            </p>
            <v-btn variant="outlined" size="small" disabled prepend-icon="mdi-cog-sync">
              {{ $t('settings.ftp.wizardBtn') }}
            </v-btn>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.ftp.modeTitle') }}</legend>
            <v-radio-group v-model="draft.ftp.transferMode">
              <v-radio :label="$t('settings.ftp.passive')" value="passive" />
              <v-radio :label="$t('settings.ftp.active')" value="active" />
            </v-radio-group>
            <v-checkbox
              v-model="draft.ftp.fallbackOnFailure"
              :label="$t('settings.ftp.fallback')"
              class="mt-1"
            />
            <p class="text-caption text-medium-emphasis mt-2 mb-0">
              {{ $t('settings.ftp.modeHint') }}
            </p>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.ftp.keepAliveTitle') }}</legend>
            <v-checkbox v-model="draft.ftp.keepAlive" :label="$t('settings.ftp.keepAlive')" />
            <p class="text-caption text-medium-emphasis mt-2 mb-0">
              {{ $t('settings.ftp.keepAliveHint') }}
            </p>
          </fieldset>
        </template>

        <!-- Aktarım → FTP: Dosya türleri -->
        <template v-else-if="selected === 'transferTypes'">
          <fieldset class="section">
            <legend>{{ $t('settings.transferTypes.defaultTitle') }}</legend>
            <v-radio-group v-model="draft.transferTypes.defaultType">
              <v-radio :label="$t('settings.transferTypes.auto')" value="auto" />
              <v-radio :label="$t('settings.transferTypes.ascii')" value="ascii" />
              <v-radio :label="$t('settings.transferTypes.binary')" value="binary" />
            </v-radio-group>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.transferTypes.autoTitle') }}</legend>
            <div class="text-body-2 mb-1">{{ $t('settings.transferTypes.asciiListLabel') }}</div>
            <div class="d-flex ga-3">
              <div class="ext-list">
                <v-list density="compact" nav>
                  <v-list-item
                    v-for="ext in draft.transferTypes.asciiExtensions"
                    :key="ext"
                    :active="selectedExt === ext"
                    :title="ext"
                    @click="selectedExt = ext"
                  />
                </v-list>
              </div>
              <div class="d-flex flex-column ga-2" style="width: 160px">
                <div class="d-flex flex-column ga-1">
                  <v-text-field v-model="newExt" @keyup.enter="addExt()" />
                  <v-btn
                    variant="outlined"
                    size="small"
                    :disabled="!newExt.trim()"
                    @click="addExt()"
                  >
                    {{ $t('settings.transferTypes.add') }}
                  </v-btn>
                  <v-btn
                    variant="outlined"
                    size="small"
                    :disabled="!selectedExt"
                    @click="removeExt()"
                  >
                    {{ $t('settings.transferTypes.remove') }}
                  </v-btn>
                </div>
                <p class="text-caption text-medium-emphasis mb-0">
                  {{ $t('settings.transferTypes.malformedHint') }}
                </p>
              </div>
            </div>
            <v-checkbox
              v-model="draft.transferTypes.noExtAsAscii"
              :label="$t('settings.transferTypes.noExt')"
              class="mt-2"
            />
            <v-checkbox
              v-model="draft.transferTypes.dotfilesAsAscii"
              :label="$t('settings.transferTypes.dotfiles')"
            />
            <p class="text-caption text-medium-emphasis mt-1 mb-0">
              {{ $t('settings.transferTypes.dotfilesNote') }}
            </p>
          </fieldset>
        </template>

        <!-- Aktarım → Dosya var işlemi -->
        <template v-else-if="selected === 'transferExists'">
          <p class="text-body-2 mt-0 mb-3">{{ $t('settings.fileExists.intro') }}</p>
          <fieldset class="section">
            <legend>{{ $t('settings.fileExists.defaultTitle') }}</legend>
            <div class="d-flex align-center ga-2">
              <span class="field-label">{{ $t('settings.fileExists.download') }}</span>
              <v-select
                v-model="draft.fileExists.download"
                :items="fileExistsActions"
                style="max-width: 280px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.fileExists.upload') }}</span>
              <v-select
                v-model="draft.fileExists.upload"
                :items="fileExistsActions"
                style="max-width: 280px"
              />
            </div>
          </fieldset>
          <p class="text-caption text-medium-emphasis">{{ $t('settings.fileExists.timeHint') }}</p>
          <v-checkbox
            v-model="draft.fileExists.asciiResume"
            :label="$t('settings.fileExists.asciiResume')"
          />
          <p class="text-caption text-medium-emphasis mt-1 mb-0">
            {{ $t('settings.fileExists.asciiResumeHint') }}
          </p>
        </template>

        <!-- Bağlantı → FTP → Aktif kip -->
        <template v-else-if="selected === 'ftpActive'">
          <fieldset class="section">
            <legend>{{ $t('settings.ftpActive.portTitle') }}</legend>
            <v-checkbox
              v-model="draft.ftpActive.limitPorts"
              :label="$t('settings.ftpActive.limitPorts')"
            />
            <p class="text-caption text-medium-emphasis mt-1 mb-2">
              {{ $t('settings.ftpActive.limitHint') }}
            </p>
            <div class="d-flex align-center ga-2">
              <span class="field-label">{{ $t('settings.ftpActive.portMin') }}</span>
              <v-text-field
                v-model.number="draft.ftpActive.portMin"
                type="number"
                :disabled="!draft.ftpActive.limitPorts"
                style="max-width: 110px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.ftpActive.portMax') }}</span>
              <v-text-field
                v-model.number="draft.ftpActive.portMax"
                type="number"
                :disabled="!draft.ftpActive.limitPorts"
                style="max-width: 110px"
              />
            </div>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.ftpActive.ipTitle') }}</legend>
            <p class="text-caption text-medium-emphasis mt-0 mb-1">
              {{ $t('settings.ftpActive.ipHint') }}
            </p>
            <v-radio-group v-model="draft.ftpActive.externalIpMode">
              <v-radio :label="$t('settings.ftpActive.ipAskOs')" value="ask-os" />
              <v-radio :label="$t('settings.ftpActive.ipFixed')" value="fixed" />
              <v-text-field
                v-model="draft.ftpActive.fixedIp"
                :disabled="draft.ftpActive.externalIpMode !== 'fixed'"
                class="ms-8"
                style="max-width: 220px"
              />
              <p class="text-caption text-medium-emphasis ms-8 mt-1 mb-1">
                {{ $t('settings.ftpActive.ipFixedHint') }}
              </p>
              <v-radio :label="$t('settings.ftpActive.ipUrl')" value="url" />
              <v-text-field
                v-model="draft.ftpActive.ipUrl"
                placeholder="http://ip.filezilla-project.org/ip.php"
                :disabled="draft.ftpActive.externalIpMode !== 'url'"
                class="ms-8"
                style="max-width: 320px"
              />
              <p class="text-caption text-medium-emphasis ms-8 mt-1 mb-0">
                {{ $t('settings.ftpActive.ipUrlDefault') }}
              </p>
            </v-radio-group>
            <v-checkbox
              v-model="draft.ftpActive.noExternalIpForLocal"
              :label="$t('settings.ftpActive.noExternalForLocal')"
              :disabled="draft.ftpActive.externalIpMode === 'ask-os'"
              class="mt-1"
            />
          </fieldset>
        </template>

        <!-- Bağlantı → FTP → Pasif kip -->
        <template v-else-if="selected === 'ftpPassive'">
          <fieldset class="section">
            <legend>{{ $t('settings.ftpPassive.title') }}</legend>
            <p class="text-caption text-medium-emphasis mt-0 mb-1">
              {{ $t('settings.ftpPassive.hint') }}
            </p>
            <v-radio-group v-model="draft.ftpPassive.malformedReply">
              <v-radio :label="$t('settings.ftpPassive.useServerIp')" value="use-server-ip" />
              <v-radio :label="$t('settings.ftpPassive.fallbackActive')" value="fallback-active" />
            </v-radio-group>
          </fieldset>
        </template>

        <!-- Bağlantı → FTP → FTP vekil sunucusu -->
        <template v-else-if="selected === 'ftpProxy'">
          <fieldset class="section">
            <legend>{{ $t('settings.ftpProxy.title') }}</legend>
            <div class="text-body-2 mb-1">{{ $t('settings.ftpProxy.typeLabel') }}</div>
            <v-radio-group v-model="draft.ftpProxy.type">
              <v-radio :label="$t('settings.ftpProxy.none')" value="none" />
              <v-radio label="USER@HOST" value="user-host" />
              <v-radio label="SITE" value="site" />
              <v-radio label="OPEN" value="open" />
              <v-radio :label="$t('settings.ftpProxy.custom')" value="custom" />
            </v-radio-group>
            <v-textarea
              v-model="draft.ftpProxy.customFormat"
              :disabled="draft.ftpProxy.type !== 'custom'"
              rows="4"
              class="mt-2"
            />
            <div class="text-caption text-medium-emphasis mt-2">
              <div class="font-weight-medium">{{ $t('settings.ftpProxy.specifiers') }}</div>
              <div class="font-monospace">{{ $t('settings.ftpProxy.spec1') }}</div>
              <div class="font-monospace">{{ $t('settings.ftpProxy.spec2') }}</div>
              <div class="font-monospace">{{ $t('settings.ftpProxy.spec3') }}</div>
            </div>
            <div class="d-flex align-center ga-2 mt-3">
              <span class="field-label">{{ $t('settings.ftpProxy.host') }}</span>
              <v-text-field
                v-model="draft.ftpProxy.host"
                :disabled="draft.ftpProxy.type === 'none'"
                style="max-width: 220px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.ftpProxy.user') }}</span>
              <v-text-field
                v-model="draft.ftpProxy.user"
                :disabled="draft.ftpProxy.type === 'none'"
                style="max-width: 220px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.ftpProxy.password') }}</span>
              <v-text-field
                v-model="draft.ftpProxy.password"
                :disabled="draft.ftpProxy.type === 'none'"
                type="password"
                style="max-width: 220px"
              />
            </div>
            <p class="text-caption text-medium-emphasis mt-3 mb-0">
              {{ $t('settings.ftpProxy.note') }}
            </p>
          </fieldset>
        </template>

        <!-- Bağlantı → SFTP -->
        <template v-else-if="selected === 'sftp'">
          <fieldset class="section">
            <legend>{{ $t('settings.sftp.title') }}</legend>
            <p class="text-caption text-medium-emphasis mt-0 mb-2">
              {{ $t('settings.sftp.hint') }}
            </p>
            <div class="text-body-2 mb-1">{{ $t('settings.sftp.keysLabel') }}</div>
            <v-table class="key-table">
              <thead>
                <tr>
                  <th>{{ $t('settings.sftp.colFile') }}</th>
                  <th>{{ $t('settings.sftp.colComment') }}</th>
                  <th>{{ $t('settings.sftp.colType') }}</th>
                  <th>{{ $t('settings.sftp.colFingerprint') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(k, i) in draft.sftp.keys" :key="i">
                  <td>{{ k.path }}</td>
                  <td>{{ k.comment }}</td>
                  <td>{{ k.type }}</td>
                  <td class="font-monospace text-caption">{{ k.fingerprint }}</td>
                </tr>
                <tr v-if="!draft.sftp.keys.length">
                  <td colspan="4" class="text-center text-medium-emphasis py-4">
                    {{ $t('settings.sftp.empty') }}
                  </td>
                </tr>
              </tbody>
            </v-table>
            <div class="d-flex ga-2 mt-2">
              <v-btn variant="outlined" size="small" disabled prepend-icon="mdi-key-plus">
                {{ $t('settings.sftp.addKey') }}
              </v-btn>
              <v-btn variant="outlined" size="small" disabled prepend-icon="mdi-key-remove">
                {{ $t('settings.sftp.removeKey') }}
              </v-btn>
            </div>
            <p class="text-caption text-medium-emphasis mt-3 mb-0">
              {{ $t('settings.sftp.sshAgentHint') }}
            </p>
          </fieldset>
        </template>

        <!-- Bağlantı → Genel vekil sunucu -->
        <template v-else-if="selected === 'genericProxy'">
          <fieldset class="section">
            <legend>{{ $t('settings.genericProxy.title') }}</legend>
            <div class="text-body-2 mb-1">{{ $t('settings.genericProxy.typeLabel') }}</div>
            <v-radio-group v-model="draft.genericProxy.type">
              <v-radio :label="$t('settings.genericProxy.none')" value="none" />
              <v-radio :label="$t('settings.genericProxy.http')" value="http" />
              <v-radio :label="$t('settings.genericProxy.socks4')" value="socks4" />
              <v-radio :label="$t('settings.genericProxy.socks5')" value="socks5" />
            </v-radio-group>
            <div class="d-flex align-center ga-2 mt-3">
              <span class="field-label">{{ $t('settings.genericProxy.host') }}</span>
              <v-text-field
                v-model="draft.genericProxy.host"
                :disabled="draft.genericProxy.type === 'none'"
                style="max-width: 260px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.genericProxy.port') }}</span>
              <v-text-field
                v-model.number="draft.genericProxy.port"
                :disabled="draft.genericProxy.type === 'none'"
                type="number"
                style="max-width: 110px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.genericProxy.user') }}</span>
              <v-text-field
                v-model="draft.genericProxy.user"
                :disabled="draft.genericProxy.type === 'none'"
                style="max-width: 260px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.genericProxy.password') }}</span>
              <v-text-field
                v-model="draft.genericProxy.password"
                :disabled="draft.genericProxy.type === 'none'"
                type="password"
                style="max-width: 260px"
              />
            </div>
            <p class="text-caption text-medium-emphasis mt-3 mb-0">
              {{ $t('settings.genericProxy.note') }}
            </p>
          </fieldset>
        </template>

        <!-- Arayüz → Temalar (Material Design 3 Theme Studio — canlı) -->
        <template v-else-if="selected === 'themes'">
          <!-- COLORS -->
          <fieldset class="section">
            <legend>{{ $t('settings.themesPage.colorsTitle') }}</legend>
            <div class="d-flex align-center ga-3">
              <v-menu :close-on-content-click="false">
                <template #activator="{ props }">
                  <div
                    v-bind="props"
                    class="color-swatch"
                    :style="{ background: ui.themeSeed }"
                  />
                </template>
                <v-color-picker
                  :model-value="ui.themeSeed"
                  mode="hex"
                  :modes="['hex']"
                  @update:model-value="ui.setThemeSeed($event as unknown as string)"
                />
              </v-menu>
              <v-text-field
                :model-value="ui.themeSeed"
                :label="$t('settings.themesPage.primaryLabel')"
                style="max-width: 180px"
                @update:model-value="onSeedInput($event)"
              />
            </div>
          </fieldset>

          <!-- SCHEME -->
          <fieldset class="section">
            <legend>{{ $t('settings.themesPage.schemeTitle') }}</legend>
            <v-select
              :model-value="ui.themeScheme"
              :items="SCHEME_OPTIONS"
              :label="$t('settings.themesPage.schemeLabel')"
              prepend-inner-icon="mdi-palette-swatch"
              @update:model-value="ui.setThemeScheme($event)"
            />
          </fieldset>

          <!-- VARIANT & CONTRAST -->
          <fieldset class="section">
            <legend>{{ $t('settings.themesPage.variantTitle') }}</legend>
            <div class="d-flex ga-6 flex-wrap">
              <div>
                <div class="text-caption text-medium-emphasis mb-1">{{ $t('settings.theme') }}</div>
                <v-btn-toggle
                  :model-value="ui.themeMode"
                  mandatory
                  density="comfortable"
                  variant="outlined"
                  divided
                  @update:model-value="ui.setThemeMode($event)"
                >
                  <v-btn value="light" prepend-icon="$themeLight">{{ $t('settings.light') }}</v-btn>
                  <v-btn value="dark" prepend-icon="$themeDark">{{ $t('settings.dark') }}</v-btn>
                </v-btn-toggle>
              </div>
              <div>
                <div class="text-caption text-medium-emphasis mb-1">
                  {{ $t('settings.themesPage.contrastLabel') }}
                </div>
                <v-btn-toggle
                  :model-value="ui.themeContrast"
                  mandatory
                  density="comfortable"
                  variant="outlined"
                  divided
                  @update:model-value="ui.setThemeContrast($event)"
                >
                  <v-btn
                    v-for="c in contrastOptions"
                    :key="c.value"
                    :value="c.value"
                    :prepend-icon="c.icon"
                  >
                    {{ c.title }}
                  </v-btn>
                </v-btn-toggle>
              </div>
            </div>
          </fieldset>

          <!-- FONTS -->
          <fieldset class="section">
            <legend>{{ $t('settings.themesPage.fontsTitle') }}</legend>
            <div class="d-flex ga-2 flex-wrap">
              <v-select
                :model-value="ui.fonts.heading"
                :items="FONT_OPTIONS"
                :label="$t('settings.themesPage.headingFont')"
                style="min-width: 200px"
                @update:model-value="setFontField('heading', $event)"
              />
              <v-select
                :model-value="ui.fonts.body"
                :items="FONT_OPTIONS"
                :label="$t('settings.themesPage.bodyFont')"
                style="min-width: 200px"
                @update:model-value="setFontField('body', $event)"
              />
              <v-text-field
                :model-value="ui.fonts.rootSize"
                :label="$t('settings.themesPage.fontSizeRoot')"
                type="number"
                min="10"
                max="24"
                style="max-width: 130px"
                @update:model-value="setFontField('rootSize', Number($event) || 16)"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-3">
              <span class="field-label">{{ $t('settings.themesPage.scaleLabel') }}</span>
              <v-text-field
                v-model.number="draft.appearance.scaleFactor"
                type="number"
                min="0.5"
                max="3"
                step="0.25"
                style="max-width: 110px"
              />
            </div>
          </fieldset>

          <!-- Önizleme (aktif tema) -->
          <fieldset class="section">
            <legend>{{ $t('settings.themesPage.previewLabel') }}</legend>
            <div class="theme-preview pa-3">
              <div class="text-h6 mb-1">{{ $t('settings.themesPage.previewSample') }}</div>
              <div class="text-body-2 mb-2 text-medium-emphasis">
                {{ ui.themeSeed }} · {{ ui.themeMode }} · {{ ui.themeContrast }}
              </div>
              <div class="d-flex ga-2 flex-wrap">
                <v-chip color="primary" size="small" label>primary</v-chip>
                <v-chip color="secondary" size="small" label>secondary</v-chip>
                <v-chip color="tertiary" size="small" label>tertiary</v-chip>
                <v-chip color="success" size="small" label>success</v-chip>
                <v-chip color="warning" size="small" label>warning</v-chip>
                <v-chip color="error" size="small" label>error</v-chip>
              </div>
            </div>
          </fieldset>
        </template>

        <!-- Arayüz → Dil -->
        <template v-else-if="selected === 'lang'">
          <div class="text-body-2 mb-1">{{ $t('settings.langPage.selectLabel') }}</div>
          <div class="lang-list">
            <v-list density="compact" nav>
              <v-list-item
                v-for="l in languages"
                :key="l.value"
                :active="draft.languageChoice === l.value"
                :title="l.title"
                @click="draft.languageChoice = l.value"
              />
            </v-list>
          </div>
          <p class="text-caption text-medium-emphasis mt-2 mb-2">
            {{ $t('settings.langPage.instantNote') }}
          </p>

          <!-- Seçilen dilin önizlemesi: <v-locale-provider> ile bu alt-ağaç,
               uygulamanın mevcut (global) dilinden BAĞIMSIZ olarak seçilen
               locale'de render edilir. Kaydet'ten önce dili görmeyi sağlar. -->
          <div class="text-body-2 mb-1">{{ $t('settings.langPage.previewLabel') }}</div>
          <v-locale-provider :locale="previewLocale">
            <div class="preview-box">
              <LocalePreview />
            </div>
          </v-locale-provider>
        </template>

        <!-- Arayüz (üst sayfa) -->
        <template v-else-if="selected === 'interface'">
          <fieldset class="section">
            <legend>{{ $t('settings.iface.layoutTitle') }}</legend>
            <div class="d-flex align-center ga-2">
              <span class="field-label">{{ $t('settings.iface.layoutLabel') }}</span>
              <v-select
                v-model="draft.iface.layout"
                :items="layoutOptions"
                style="max-width: 240px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.iface.msgLogLabel') }}</span>
              <v-select
                v-model="draft.iface.messageLogPos"
                :items="msgLogOptions"
                style="max-width: 320px"
              />
            </div>
            <v-checkbox
              v-model="draft.iface.swapPanes"
              :label="$t('settings.iface.swapPanes')"
              class="mt-1"
            />
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.iface.behaviourTitle') }}</legend>
            <v-checkbox
              v-model="draft.iface.preventSleep"
              :label="$t('settings.iface.preventSleep')"
            />
            <div class="text-body-2 mt-2 mb-1">{{ $t('settings.iface.startupLabel') }}</div>
            <v-radio-group v-model="draft.iface.onStartup">
              <v-radio :label="$t('settings.iface.startupNormal')" value="normal" />
              <v-radio :label="$t('settings.iface.startupSiteManager')" value="site-manager" />
              <v-radio :label="$t('settings.iface.startupRestore')" value="restore-tabs" />
            </v-radio-group>
            <div class="text-body-2 mt-2 mb-1">{{ $t('settings.iface.newConnLabel') }}</div>
            <v-select
              v-model="draft.iface.newConnWhileConnected"
              :items="newConnOptions"
              style="max-width: 320px"
            />
            <v-checkbox
              v-model="draft.iface.forceRefreshOnSubfolderOps"
              :label="$t('settings.iface.forceRefresh')"
              class="mt-1"
            />
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.iface.queueTitle') }}</legend>
            <v-checkbox
              v-model="draft.iface.showInstantRate"
              :label="$t('settings.iface.showInstantRate')"
            />
          </fieldset>
        </template>

        <!-- Arayüz → Parolalar -->
        <template v-else-if="selected === 'passwords'">
          <fieldset class="section">
            <legend>{{ $t('settings.pages.passwords') }}</legend>
            <v-radio-group v-model="draft.passwords.mode">
              <v-radio :label="$t('settings.passwords.save')" value="save" />
              <v-radio :label="$t('settings.passwords.dontSave')" value="dont-save" />
              <v-radio :label="$t('settings.passwords.master')" value="master" />
            </v-radio-group>
            <div v-if="draft.passwords.mode === 'master'" class="mt-2">
              <div class="d-flex align-center ga-2">
                <span class="field-label">{{ $t('settings.passwords.masterPw') }}</span>
                <v-text-field v-model="masterPw" type="password" style="max-width: 280px" />
              </div>
              <div class="d-flex align-center ga-2 mt-2">
                <span class="field-label">{{ $t('settings.passwords.masterPwConfirm') }}</span>
                <v-text-field v-model="masterPwConfirm" type="password" style="max-width: 280px" />
              </div>
              <p class="text-caption text-warning mt-2 mb-0">
                {{ $t('settings.passwords.masterWarning') }}
              </p>
            </div>
          </fieldset>
        </template>

        <!-- Arayüz → Tarih/saat biçimi -->
        <template v-else-if="selected === 'dateTime'">
          <fieldset class="section">
            <legend>{{ $t('settings.dateTime.dateTitle') }}</legend>
            <v-radio-group v-model="draft.dateTime.dateMode">
              <v-radio :label="$t('settings.dateTime.systemDefault')" value="system" />
              <v-radio :label="$t('settings.dateTime.isoDate')" value="iso" />
              <v-radio :label="$t('settings.dateTime.custom')" value="custom" />
              <div class="d-flex align-center ga-2 ms-8">
                <v-text-field
                  v-model="draft.dateTime.dateCustom"
                  :disabled="draft.dateTime.dateMode !== 'custom'"
                  style="max-width: 160px"
                />
                <span class="text-caption text-medium-emphasis">{{
                  $t('settings.dateTime.dateExample')
                }}</span>
              </div>
            </v-radio-group>
          </fieldset>
          <fieldset class="section">
            <legend>{{ $t('settings.dateTime.timeTitle') }}</legend>
            <v-radio-group v-model="draft.dateTime.timeMode">
              <v-radio :label="$t('settings.dateTime.systemDefault')" value="system" />
              <v-radio :label="$t('settings.dateTime.isoTime')" value="iso" />
              <v-radio :label="$t('settings.dateTime.custom')" value="custom" />
              <div class="d-flex align-center ga-2 ms-8">
                <v-text-field
                  v-model="draft.dateTime.timeCustom"
                  :disabled="draft.dateTime.timeMode !== 'custom'"
                  style="max-width: 160px"
                />
                <span class="text-caption text-medium-emphasis">{{
                  $t('settings.dateTime.timeExample')
                }}</span>
              </div>
            </v-radio-group>
          </fieldset>
          <p class="text-caption text-primary mb-0">{{ $t('settings.dateTime.moreInfo') }}</p>
        </template>

        <!-- Arayüz → Dosya boyutu biçimi -->
        <template v-else-if="selected === 'fileSize'">
          <fieldset class="section">
            <legend>{{ $t('settings.fileSize.title') }}</legend>
            <v-radio-group v-model="draft.fileSize.format">
              <v-radio :label="$t('settings.fileSize.bytes')" value="bytes" />
              <v-radio :label="$t('settings.fileSize.iec')" value="iec" />
              <v-radio :label="$t('settings.fileSize.siBinary')" value="si-binary" />
              <v-radio :label="$t('settings.fileSize.siDecimal')" value="si-decimal" />
            </v-radio-group>
            <v-checkbox
              v-model="draft.fileSize.thousandsSep"
              :label="$t('settings.fileSize.thousandsSep')"
              class="mt-1"
            />
            <div class="d-flex align-center ga-2 mt-1">
              <span class="field-label">{{ $t('settings.fileSize.decimals') }}</span>
              <v-text-field
                v-model.number="draft.fileSize.decimalPlaces"
                type="number"
                min="0"
                max="3"
                :disabled="draft.fileSize.format === 'bytes'"
                style="max-width: 90px"
              />
            </div>
          </fieldset>
          <fieldset class="section">
            <legend>{{ $t('settings.fileSize.examplesTitle') }}</legend>
            <div class="text-right font-monospace">
              <div v-for="(ex, i) in sizeExamples" :key="i">{{ ex }}</div>
            </div>
          </fieldset>
        </template>

        <!-- Arayüz → Dosya listeleri -->
        <template v-else-if="selected === 'fileLists'">
          <fieldset class="section">
            <legend>{{ $t('settings.fileLists.sortTitle') }}</legend>
            <div class="d-flex align-center ga-2">
              <span class="field-label">{{ $t('settings.fileLists.sortMode') }}</span>
              <v-select
                v-model="draft.fileLists.sortMode"
                :items="sortModeOptions"
                style="max-width: 320px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.fileLists.nameSort') }}</span>
              <v-select
                v-model="draft.fileLists.nameSort"
                :items="nameSortOptions"
                style="max-width: 320px"
              />
            </div>
          </fieldset>
          <fieldset class="section">
            <legend>{{ $t('settings.fileLists.compareTitle') }}</legend>
            <p class="text-caption text-medium-emphasis mt-0 mb-2">
              {{ $t('settings.fileLists.compareHint') }}
            </p>
            <div class="d-flex align-center ga-2">
              <span class="field-label">{{ $t('settings.fileLists.compareThreshold') }}</span>
              <v-text-field
                v-model.number="draft.fileLists.compareThresholdMin"
                type="number"
                min="0"
                style="max-width: 90px"
              />
            </div>
          </fieldset>
          <fieldset class="section">
            <legend>{{ $t('settings.fileLists.dblTitle') }}</legend>
            <div class="d-flex align-center ga-2">
              <span class="field-label">{{ $t('settings.fileLists.dblFile') }}</span>
              <v-select
                v-model="draft.fileLists.dblClickFile"
                :items="dblFileOptions"
                style="max-width: 280px"
              />
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.fileLists.dblDir') }}</span>
              <v-select
                v-model="draft.fileLists.dblClickDir"
                :items="dblDirOptions"
                style="max-width: 280px"
              />
            </div>
          </fieldset>
        </template>

        <!-- Aktarım -->
        <template v-else-if="selected === 'transfer'">
          <fieldset class="section">
            <legend>{{ $t('settings.transferOpts.concurrentTitle') }}</legend>
            <div class="d-flex align-center ga-2">
              <span class="field-label">{{ $t('settings.transferOpts.concurrent') }}</span>
              <v-text-field
                v-model.number="draft.transfer.concurrentTransfers"
                type="number"
                min="1"
                max="10"
                style="max-width: 90px"
              />
              <span class="text-caption text-medium-emphasis">
                {{ $t('settings.transferOpts.concurrentRange') }}
              </span>
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.transferOpts.concurrentDownload') }}</span>
              <v-text-field
                v-model.number="draft.transfer.concurrentDownloads"
                type="number"
                min="0"
                style="max-width: 90px"
              />
              <span class="text-caption text-medium-emphasis">
                {{ $t('settings.transferOpts.unlimitedZero') }}
              </span>
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.transferOpts.concurrentUpload') }}</span>
              <v-text-field
                v-model.number="draft.transfer.concurrentUploads"
                type="number"
                min="0"
                style="max-width: 90px"
              />
              <span class="text-caption text-medium-emphasis">
                {{ $t('settings.transferOpts.unlimitedZero') }}
              </span>
            </div>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.transferOpts.speedTitle') }}</legend>
            <v-checkbox
              v-model="draft.transfer.enableSpeedLimit"
              :label="$t('settings.transferOpts.enableSpeed')"
            />
            <div class="d-flex align-center ga-2 mt-1">
              <span class="field-label">{{ $t('settings.transferOpts.downloadLimit') }}</span>
              <v-text-field
                v-model.number="draft.transfer.downloadLimitKiB"
                type="number"
                min="0"
                :disabled="!draft.transfer.enableSpeedLimit"
                style="max-width: 110px"
              />
              <span class="text-caption text-medium-emphasis">{{
                $t('settings.transferOpts.kibs')
              }}</span>
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.transferOpts.uploadLimit') }}</span>
              <v-text-field
                v-model.number="draft.transfer.uploadLimitKiB"
                type="number"
                min="0"
                :disabled="!draft.transfer.enableSpeedLimit"
                style="max-width: 110px"
              />
              <span class="text-caption text-medium-emphasis">{{
                $t('settings.transferOpts.kibs')
              }}</span>
            </div>
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.transferOpts.tolerance') }}</span>
              <v-select
                v-model="draft.transfer.tolerance"
                :items="tolerances"
                :disabled="!draft.transfer.enableSpeedLimit"
                style="max-width: 160px"
              />
            </div>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.transferOpts.invalidTitle') }}</legend>
            <p class="text-caption text-medium-emphasis mt-0 mb-2">
              {{ $t('settings.transferOpts.invalidHint') }}
            </p>
            <div class="d-flex align-center ga-2">
              <v-checkbox
                v-model="draft.transfer.replaceInvalidChars"
                :label="$t('settings.transferOpts.replaceWith')"
              />
              <v-text-field
                v-model="draft.transfer.replacementChar"
                :disabled="!draft.transfer.replaceInvalidChars"
                maxlength="1"
                style="max-width: 60px"
              />
            </div>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ $t('settings.transferOpts.charToReplace') }}
            </div>
          </fieldset>

          <fieldset class="section">
            <legend>{{ $t('settings.transferOpts.preallocTitle') }}</legend>
            <v-checkbox
              v-model="draft.transfer.preallocate"
              :label="$t('settings.transferOpts.prealloc')"
            />
          </fieldset>
        </template>

        <!-- Dosya düzenleme -->
        <template v-else-if="selected === 'editing'">
          <fieldset class="section">
            <legend>{{ $t('settings.editing.defaultTitle') }}</legend>
            <v-radio-group v-model="draft.editing.defaultEditor">
              <v-radio :label="$t('settings.editing.none')" value="none" />
              <v-radio :label="$t('settings.editing.system')" value="system" />
              <v-radio :label="$t('settings.editing.custom')" value="custom" />
            </v-radio-group>
            <div class="d-flex align-center ga-2 ms-8 mt-1">
              <v-text-field
                v-model="draft.editing.customEditorPath"
                :disabled="draft.editing.defaultEditor !== 'custom'"
                style="max-width: 320px"
              />
              <v-btn variant="outlined" size="small" disabled>{{
                $t('settings.editing.browse')
              }}</v-btn>
            </div>
            <p class="text-caption text-medium-emphasis ms-8 mt-1 mb-0">
              {{ $t('settings.editing.quoteHint') }}
              <span class="text-primary">{{ $t('settings.editing.quoteRules') }}</span>
            </p>
          </fieldset>
          <fieldset class="section">
            <v-radio-group v-model="draft.editing.associationMode">
              <v-radio :label="$t('settings.editing.useAssoc')" value="use-associations" />
              <v-radio :label="$t('settings.editing.alwaysDefault')" value="always-default" />
            </v-radio-group>
          </fieldset>
          <v-checkbox
            v-model="draft.editing.watchChanges"
            :label="$t('settings.editing.watchChanges')"
          />
        </template>

        <!-- Dosya düzenleme → Dosya türü ilişkileri -->
        <template v-else-if="selected === 'fileAssoc'">
          <div class="text-body-2 mb-1">{{ $t('settings.fileAssoc.label') }}</div>
          <v-textarea v-model="draft.fileAssoc.associations" rows="12" class="font-monospace" />
          <p class="text-caption text-medium-emphasis mt-2 mb-0">
            {{ $t('settings.fileAssoc.formatHint') }}
          </p>
          <p class="text-caption text-medium-emphasis font-monospace mt-1 mb-1">
            {{ $t('settings.fileAssoc.example') }}
          </p>
          <p class="text-caption text-primary mb-0">{{ $t('settings.fileAssoc.quoteRules') }}</p>
        </template>

        <!-- Güncelleme -->
        <template v-else-if="selected === 'updates'">
          <fieldset class="section">
            <legend>{{ $t('settings.updates.title') }}</legend>
            <div class="mb-1">{{ $t('settings.updates.frequency') }}</div>
            <v-select
              v-model="draft.updates.checkFrequency"
              :items="updateFreqOptions"
              style="max-width: 240px"
            />
            <div class="mt-3 mb-1">{{ $t('settings.updates.channel') }}</div>
            <v-select
              v-model="draft.updates.channel"
              :items="updateChannelOptions"
              style="max-width: 320px"
            />
            <p class="text-caption text-medium-emphasis mt-2 mb-0">
              {{ $t('settings.updates.recommendation') }}
            </p>
          </fieldset>
          <div class="text-center my-3">
            <v-btn variant="outlined" size="small" disabled prepend-icon="mdi-update">
              {{ $t('settings.updates.checkNow') }}
            </v-btn>
          </div>
          <p class="text-caption text-medium-emphasis mb-1">
            {{ $t('settings.updates.privacyHint') }}
          </p>
          <p class="text-caption text-primary mb-0">{{ $t('settings.updates.privacyPolicy') }}</p>
        </template>

        <!-- Günlük -->
        <template v-else-if="selected === 'logging'">
          <fieldset class="section">
            <legend>{{ $t('settings.pages.logging') }}</legend>
            <v-checkbox
              v-model="draft.logging.timestamps"
              :label="$t('settings.logging.timestamps')"
            />
            <v-checkbox v-model="draft.logging.logToFile" :label="$t('settings.logging.toFile')" />
            <div class="d-flex align-center ga-2 mt-1">
              <span class="field-label">{{ $t('settings.logging.fileName') }}</span>
              <v-text-field
                v-model="draft.logging.fileName"
                :disabled="!draft.logging.logToFile"
                style="max-width: 280px"
              />
              <v-btn variant="outlined" size="small" disabled>{{
                $t('settings.logging.browse')
              }}</v-btn>
            </div>
            <v-checkbox
              v-model="draft.logging.limitSize"
              :label="$t('settings.logging.limitSize')"
              :disabled="!draft.logging.logToFile"
              class="mt-1"
            />
            <div class="d-flex align-center ga-2">
              <span class="field-label">{{ $t('settings.logging.limit') }}</span>
              <v-text-field
                v-model.number="draft.logging.maxSizeMiB"
                type="number"
                min="1"
                :disabled="!draft.logging.logToFile || !draft.logging.limitSize"
                style="max-width: 90px"
              />
              <span class="text-caption text-medium-emphasis">{{
                $t('settings.logging.mib')
              }}</span>
            </div>
            <p class="text-caption text-medium-emphasis mt-2 mb-0">
              {{ $t('settings.logging.rotateHint') }}
            </p>
          </fieldset>
        </template>

        <!-- Hata ayıklama -->
        <template v-else-if="selected === 'debug'">
          <fieldset class="section">
            <legend>{{ $t('settings.debug.title') }}</legend>
            <v-checkbox
              v-model="draft.debug.showDebugMenu"
              :label="$t('settings.debug.showMenu')"
            />
            <div class="d-flex align-center ga-2 mt-2">
              <span class="field-label">{{ $t('settings.debug.level') }}</span>
              <v-select
                v-model="draft.debug.debugLevel"
                :items="debugLevels"
                style="max-width: 200px"
              />
            </div>
            <p class="text-caption text-medium-emphasis mt-2 mb-1">
              {{ $t('settings.debug.levelHint') }}
            </p>
            <p class="text-caption text-medium-emphasis mb-2">
              {{ $t('settings.debug.reportHint') }}
            </p>
            <v-checkbox
              v-model="draft.debug.showRawListing"
              :label="$t('settings.debug.rawListing')"
            />
          </fieldset>
        </template>

        <!-- İçeriği bir sonraki adımda gelecek sayfalar -->
        <template v-else>
          <div
            class="d-flex flex-column align-center justify-center text-medium-emphasis"
            style="height: 100%"
          >
            <v-icon icon="mdi-tools" size="32" class="mb-2" />
            <div class="text-body-2">{{ $t('settings.pages.' + selected) }}</div>
            <div class="text-caption">{{ $t('settings.placeholder') }}</div>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <v-spacer />
      <v-btn variant="text" @click="close()">{{ $t('common.cancel') }}</v-btn>
      <v-btn color="primary" variant="tonal" prepend-icon="$save" @click="apply()">
        {{ $t('common.save') }}
      </v-btn>
    </template>
  </AppDrawer>
</template>

<style scoped>
/* Gövde kalan alanı doldurur; ağaç/içerik kendi içinde kayar. */
.settings-body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.page-tree {
  flex: 0 0 220px;
  overflow-y: auto;
  /* Scrollbar belirip kaybolurken genişlik oynamasın. */
  scrollbar-gutter: stable;
}
/* Ağaç satırlarını daha sıkışık yap. */
.page-tree :deep(.v-list-item) {
  min-height: 30px;
}
.page-tree :deep(.v-list-item--density-compact.v-list-item--one-line) {
  --v-list-item-min-height: 30px;
}
.page-tree :deep(.v-list-item__content) {
  padding-block: 1px;
}
.page-content {
  flex: 1 1 0;
  min-width: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}
.section {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  padding: 12px 16px 16px;
  margin-bottom: 16px;
}
.section legend {
  padding: 0 6px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.reconnect-label {
  min-width: 280px;
}
.field-label {
  min-width: 200px;
}
.font-monospace {
  font-family: monospace;
}
.key-table {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
}
.ext-list {
  flex: 1 1 auto;
  height: 180px;
  overflow-y: auto;
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
}
.lang-list {
  height: 280px;
  overflow-y: auto;
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  max-width: 420px;
}
.preview-box {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  padding: 8px 12px;
  max-width: 420px;
}
.theme-preview {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  max-width: 420px;
}
.color-swatch {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex: 0 0 auto;
}
</style>
