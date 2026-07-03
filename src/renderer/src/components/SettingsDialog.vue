<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// VTreeview/VHotkey vb. şablonda <v-treeview> olarak kullanılır; vite-plugin-vuetify
// autoImport bunları otomatik (tree-shake ederek) içe aktarır — elle import gerekmez.
import { useUiStore } from '@renderer/stores/ui'

import AppDrawer from '@renderer/components/AppDrawer.vue'
import type { Draft } from '@renderer/components/settings/types'
import SettingsConnection from '@renderer/components/settings/SettingsConnection.vue'
import SettingsFtp from '@renderer/components/settings/SettingsFtp.vue'
import SettingsFtpActive from '@renderer/components/settings/SettingsFtpActive.vue'
import SettingsFtpPassive from '@renderer/components/settings/SettingsFtpPassive.vue'
import SettingsFtpProxy from '@renderer/components/settings/SettingsFtpProxy.vue'
import SettingsSftp from '@renderer/components/settings/SettingsSftp.vue'
import SettingsGenericProxy from '@renderer/components/settings/SettingsGenericProxy.vue'
import SettingsTransfer from '@renderer/components/settings/SettingsTransfer.vue'
import SettingsTransferTypes from '@renderer/components/settings/SettingsTransferTypes.vue'
import SettingsFileExists from '@renderer/components/settings/SettingsFileExists.vue'
import SettingsInterface from '@renderer/components/settings/SettingsInterface.vue'
import SettingsPasswords from '@renderer/components/settings/SettingsPasswords.vue'
import SettingsThemes from '@renderer/components/settings/SettingsThemes.vue'
import SettingsLanguage from '@renderer/components/settings/SettingsLanguage.vue'
import SettingsDateTime from '@renderer/components/settings/SettingsDateTime.vue'
import SettingsFileSize from '@renderer/components/settings/SettingsFileSize.vue'
import SettingsFileLists from '@renderer/components/settings/SettingsFileLists.vue'
import SettingsEditing from '@renderer/components/settings/SettingsEditing.vue'
import SettingsFileAssoc from '@renderer/components/settings/SettingsFileAssoc.vue'
import SettingsSync from '@renderer/components/settings/SettingsSync.vue'
import SettingsUpdates from '@renderer/components/settings/SettingsUpdates.vue'
import SettingsLogging from '@renderer/components/settings/SettingsLogging.vue'
import SettingsDebug from '@renderer/components/settings/SettingsDebug.vue'

const { t } = useI18n()
const ui = useUiStore()

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
  { key: 'sync' },
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

// ── Taslak (draft): açılışta store'dan kopyalanır, Tamam'da uygulanır.
// Draft tipi ve sayfa içerikleri settings/ altındaki alt bileşenlere bölündü;
// taslak durumu + snapshot/apply burada (parent'ta) kalır. ──
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

// Parolalar: ana parola alanları (kalıcı saklanmaz; yalnızca taslak/UI)
const masterPw = ref('')
const masterPwConfirm = ref('')
const currentMasterPw = ref('')

// ASCII uzantı listesi etkileşimi (durum burada — sayfa değişince korunur)
const newExt = ref('')
const selectedExt = ref<string | null>(null)

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
    :subtitle="$t('settings.subtitle')"
    icon="$settings"
    :width="960"
    @update:model-value="
      (v) => {
        if (!v) close()
      }
    "
  >
    <div class="settings-body d-flex flex-grow-1">
      <!-- Sol: sayfa ağacı — çizgi yerine tonal M3 alt-kabı -->
      <div class="page-tree">
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

      <!-- Sağ: seçili sayfa içeriği — her sayfa settings/ altında ayrı bileşen -->
      <div class="pa-4 page-content">
        <!-- Bağlantı -->
        <SettingsConnection v-if="selected === 'connection'" :draft="draft" />
        <!-- Bağlantı → FTP -->
        <SettingsFtp v-else-if="selected === 'ftp'" :draft="draft" />
        <!-- Aktarım → FTP: Dosya türleri -->
        <SettingsTransferTypes
          v-else-if="selected === 'transferTypes'"
          v-model:new-ext="newExt"
          v-model:selected-ext="selectedExt"
          :draft="draft"
        />
        <!-- Aktarım → Dosya var işlemi -->
        <SettingsFileExists v-else-if="selected === 'transferExists'" :draft="draft" />
        <!-- Bağlantı → FTP → Aktif kip -->
        <SettingsFtpActive v-else-if="selected === 'ftpActive'" :draft="draft" />
        <!-- Bağlantı → FTP → Pasif kip -->
        <SettingsFtpPassive v-else-if="selected === 'ftpPassive'" :draft="draft" />
        <!-- Bağlantı → FTP → FTP vekil sunucusu -->
        <SettingsFtpProxy v-else-if="selected === 'ftpProxy'" :draft="draft" />
        <!-- Bağlantı → SFTP -->
        <SettingsSftp v-else-if="selected === 'sftp'" :draft="draft" />
        <!-- Bağlantı → Genel vekil sunucu -->
        <SettingsGenericProxy v-else-if="selected === 'genericProxy'" :draft="draft" />
        <!-- Arayüz → Temalar (Material Design 3 Theme Studio — canlı) -->
        <SettingsThemes v-else-if="selected === 'themes'" :draft="draft" />
        <!-- Arayüz → Dil -->
        <SettingsLanguage v-else-if="selected === 'lang'" :draft="draft" />
        <!-- Arayüz (üst sayfa) -->
        <SettingsInterface v-else-if="selected === 'interface'" :draft="draft" />
        <!-- Arayüz → Parolalar -->
        <SettingsPasswords
          v-else-if="selected === 'passwords'"
          v-model:master-pw="masterPw"
          v-model:master-pw-confirm="masterPwConfirm"
          v-model:current-master-pw="currentMasterPw"
          :draft="draft"
        />
        <!-- Arayüz → Tarih/saat biçimi -->
        <SettingsDateTime v-else-if="selected === 'dateTime'" :draft="draft" />
        <!-- Arayüz → Dosya boyutu biçimi -->
        <SettingsFileSize v-else-if="selected === 'fileSize'" :draft="draft" />
        <!-- Arayüz → Dosya listeleri -->
        <SettingsFileLists v-else-if="selected === 'fileLists'" :draft="draft" />
        <!-- Aktarım -->
        <SettingsTransfer v-else-if="selected === 'transfer'" :draft="draft" />
        <!-- Dosya düzenleme -->
        <SettingsEditing v-else-if="selected === 'editing'" :draft="draft" />
        <!-- Dosya düzenleme → Dosya türü ilişkileri -->
        <SettingsFileAssoc v-else-if="selected === 'fileAssoc'" :draft="draft" />
        <!-- Senkronizasyon (uçtan uca şifreli — Gist / WebDAV) -->
        <SettingsSync v-else-if="selected === 'sync'" />
        <!-- Güncelleme -->
        <SettingsUpdates v-else-if="selected === 'updates'" :draft="draft" />
        <!-- Günlük -->
        <SettingsLogging v-else-if="selected === 'logging'" :draft="draft" />
        <!-- Hata ayıklama -->
        <SettingsDebug v-else-if="selected === 'debug'" :draft="draft" />

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
/* M3: sınır çizgisi yok — ağaç, içerikten bir ton farklı kap ile ayrışır. */
.page-tree {
  flex: 0 0 220px;
  overflow-y: auto;
  /* Scrollbar belirip kaybolurken genişlik oynamasın. */
  scrollbar-gutter: stable;
  margin: 8px;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container));
}
.page-tree :deep(.v-list),
.page-tree :deep(.v-treeview) {
  background: transparent;
}
/* Ağaç satırları: sıkışık + M3 gezinme hap biçimi (yuvarlatılmış köşe;
   etkin öğenin tonal vurgusunu v-list zaten verir). */
.page-tree :deep(.v-list-item) {
  min-height: 30px;
  border-radius: 8px;
  margin-inline: 4px;
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
/* Sayfa içeriği alt bileşenlerde (settings/*) render edilir; ortak sayfa
   stilleri buradan :deep() ile alt bileşenlerin içine uygulanır. */
/* Bölümler: M3 tonal kart — çizgisiz, kap rengi + köşe yumuşamasıyla ayrışır. */
.page-content :deep(.section) {
  border: none;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container));
  padding: 12px 16px 16px;
  margin-bottom: 12px;
}
/* Standart bölüm başlığı (tüm fieldset'lerde aynı): primary vurgulu,
   M3 "list subheader" ağırlığında — kart içeriğinden net ayrışır.
   float:left, legend'i fieldset'in kenar çizgisi konumundan çıkarıp kartın
   İÇİNE alır; genişliğine güvenmek yerine sonraki TÜM kardeşler clear ile
   başlığın altına iner (flex satırları float'ın yanına sıkışmasın). */
.page-content :deep(.section legend) {
  float: left;
  padding: 0;
  margin-bottom: 12px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: rgb(var(--v-theme-primary));
}
.page-content :deep(.section > *:not(legend)) {
  clear: both;
}
.page-content :deep(.reconnect-label) {
  min-width: 280px;
}
.page-content :deep(.field-label) {
  min-width: 200px;
}
.page-content :deep(.font-monospace) {
  font-family: monospace;
}
/* Bölüm içi kutular: çizgi yerine bir ton daha koyu M3 kabı. İçlerindeki
   v-list/v-table kendi yüzey rengini basmasın — kap rengi görünsün. */
.page-content :deep(.ext-list .v-list),
.page-content :deep(.lang-list .v-list) {
  background: transparent;
}
.page-content :deep(.key-table) {
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container-high)) !important;
  overflow: hidden;
}
.page-content :deep(.ext-list) {
  flex: 1 1 auto;
  height: 180px;
  overflow-y: auto;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container-high));
}
.page-content :deep(.lang-list) {
  height: 280px;
  overflow-y: auto;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container-high));
  max-width: 420px;
}
.page-content :deep(.preview-box) {
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container-high));
  padding: 8px 12px;
  max-width: 420px;
}
.page-content :deep(.theme-preview) {
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container-high));
  overflow: hidden;
  max-width: 420px;
}
.page-content :deep(.color-swatch) {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex: 0 0 auto;
}
</style>
