<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useHotkey } from 'vuetify'
import { useI18n } from 'vue-i18n'
// <v-hotkey> şablonda kullanılır; autoImport otomatik içe aktarır (elle import yok).
import { onEvent, invoke } from '@renderer/lib/ipc'
import { useUiStore } from '@renderer/stores/ui'
import { useConnectionStore } from '@renderer/stores/connection'
import { useToastStore } from '@renderer/stores/toast'
import { useSitesStore } from '@renderer/stores/sites'
import { useRemoteFsStore } from '@renderer/stores/remoteFs'
import { useLocalStore } from '@renderer/stores/local'
import { useLogStore } from '@renderer/stores/log'
import { useTransferStore } from '@renderer/stores/transfer'
import type { LocalEntry, RemoteEntry } from '@shared/transfer'
import FilePane from '@renderer/components/FilePane.vue'
import LogPanel from '@renderer/components/LogPanel.vue'
import TransferTabs from '@renderer/components/TransferTabs.vue'
import HostKeyDialog from '@renderer/components/HostKeyDialog.vue'
import TlsDialog from '@renderer/components/TlsDialog.vue'
import SiteManager from '@renderer/components/SiteManager.vue'
import SyncDialog from '@renderer/components/SyncDialog.vue'
import { ref, computed } from 'vue'

const ui = useUiStore()
const { t } = useI18n()
const toast = useToastStore()

const siteManagerOpen = ref(false)
const siteManagerFocusId = ref<string | null>(null)
const drawerOpen = ref(true)
// Sol panel sekmesi: yerel sürücüler ↔ site yöneticisi (sunucu listesi).
const leftTab = ref<'local' | 'sites'>('local')
const logOpen = ref(true)
const queueOpen = ref(true)
const syncOpen = ref(false)
const conn = useConnectionStore()
const remote = useRemoteFsStore()
const local = useLocalStore()
const log = useLogStore()
const transfer = useTransferStore()
const sites = useSitesStore()

// Sol kenar çubuğundan site yönetimini aç: "Sunucu Ekle" (yeni) veya düzenle.
function openSiteManager(siteId: string | null = null): void {
  siteManagerFocusId.value = siteId
  siteManagerOpen.value = true
}

// Bir site için açık bir bağlantı sekmesi var mı (kenar listesi vurgusu)?
function isActiveSite(host: string, port: number): boolean {
  return conn.hasOpen(host, port)
}

// Bağlantı sekmeleri (v-tabs) için etkin sekme köprüsü.
const activeTab = computed<string | null>({
  get: () => conn.activeId,
  set: (v) => {
    if (v) conn.setActive(v)
  }
})

// Sekmeyi kapat: oturumu keser, uzak/günlük durumu temizlenir (store'da).
function closeTab(sessionId: string): void {
  toast
    .promise(t('toast.disconnecting'), conn.disconnect(sessionId), {
      success: t('toast.disconnected')
    })
    .catch(() => {})
}

// Site renk etiketi → CSS rengi (Site Yöneticisi "Arka plan rengi").
const SITE_COLORS: Record<string, string> = {
  red: '#E53935',
  green: '#43A047',
  blue: '#1E88E5',
  yellow: '#FDD835',
  cyan: '#00ACC1',
  orange: '#FB8C00',
  purple: '#8E24AA'
}
function siteColor(label: string): string {
  return SITE_COLORS[label] ?? 'transparent'
}

// Kenar çubuğundaki bir sunucuya tıklama: zaten açıksa o sekmeye geç,
// değilse YENİ sekme açarak bağlan (çoklu bağlantı).
function connectSite(id: string): void {
  const site = sites.sites.find((s) => s.id === id)
  if (!site) return
  const existing = conn.sessions.find(
    (x) => x.config.host === site.host && x.config.port === site.port
  )
  if (existing) {
    conn.setActive(existing.sessionId)
    return
  }
  toast
    .promise(t('toast.connecting'), sites.connect(site), {
      success: t('toast.connected', { name: site.name }),
      error: (e) => t('toast.connectFailed', { msg: errText(e) })
    })
    .catch(() => {})
}

let unsubLog: (() => void) | null = null
let unsubProgress: (() => void) | null = null

onMounted(async () => {
  unsubLog = onEvent('session:log', (e) => log.append(e))
  unsubProgress = onEvent('transfer:update', (job) => {
    transfer.onUpdate(job)
    if (job.status === 'completed') toast.success(t('toast.transferDone', { name: job.name }))
    else if (job.status === 'failed') toast.error(t('toast.transferFailed', { name: job.name }))
  })
  await ui.applyBandwidth()
  await local.init()
  await sites.load()
})

onBeforeUnmount(() => {
  unsubLog?.()
  unsubProgress?.()
})

function onRemoteTransfer(entry: { name: string; type: string }): void {
  void transfer.download(entry.name, entry.type === 'directory')
}
function onLocalTransfer(entry: { name: string; type: string }): void {
  const e = entry as LocalEntry
  void transfer.upload(e.name, e.path, e.type === 'directory')
}

// Sürükle-bırak: yerele bırakılan uzak öğe → indir; uzağa bırakılan yerel öğe → yükle.
function onDropToLocal(p: { name: string; type: string }): void {
  void transfer.download(p.name, p.type === 'directory')
}
function onDropToRemote(p: { name: string; type: string; path?: string }): void {
  if (p.path) void transfer.upload(p.name, p.path, p.type === 'directory')
}

function onRemoteEdit(entry: { name: string }): void {
  if (!conn.sessionId) return
  const remotePath = (remote.cwd.endsWith('/') ? remote.cwd : remote.cwd + '/') + entry.name
  run(invoke('edit:open', { sessionId: conn.sessionId, remotePath, name: entry.name }))
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message
  return String((err as { message?: string })?.message ?? err)
}

// İşlem çalıştır: başarıda (verilirse) başarı toast'ı, hatada log + hata toast'ı.
function run(p: Promise<unknown>, successMsg?: string): void {
  p.then(() => {
    if (successMsg) toast.success(successMsg)
  }).catch((err) => {
    log.append({ sessionId: conn.sessionId ?? '', level: 'error', text: errText(err) })
    toast.error(t('toast.error', { msg: errText(err) }))
  })
}

// ── Klavye kısayolları (Vuetify useHotkey) ──
// 'cmd' platform-aware: macOS'ta ⌘, Windows/Linux'ta Ctrl. inputs:false (varsayılan)
// olduğundan bir metin alanına yazarken tetiklenmezler. Tek yerde tanımlı →
// hem kayıt hem de yardım diyaloğu aynı listeyi kullanır.
const hotkeysHelpOpen = ref(false)
interface HotkeyDef {
  keys: string
  labelKey: string
  run: () => void
}
const hotkeys: HotkeyDef[] = [
  { keys: 'cmd+,', labelKey: 'settings.title', run: () => ui.openDrawer('settings') },
  { keys: 'cmd+s', labelKey: 'settings.siteManager', run: () => openSiteManager(null) },
  {
    keys: 'cmd+shift+s',
    labelKey: 'sync.title',
    run: () => {
      if (conn.isConnected) syncOpen.value = true
    }
  },
  { keys: 'cmd+b', labelKey: 'sites.servers', run: () => (drawerOpen.value = !drawerOpen.value) },
  { keys: 'cmd+l', labelKey: 'log.title', run: () => (logOpen.value = !logOpen.value) },
  { keys: 'cmd+j', labelKey: 'transfer.title', run: () => (queueOpen.value = !queueOpen.value) },
  {
    keys: 'f5',
    labelKey: 'hotkeys.refresh',
    run: () => (conn.isConnected ? remote.refresh() : local.refresh())
  },
  { keys: 'cmd+/', labelKey: 'hotkeys.title', run: () => (hotkeysHelpOpen.value = true) }
]
hotkeys.forEach((h) => useHotkey(h.keys, () => h.run()))
</script>

<template>
  <div class="ferro-root">
    <v-app-bar :elevation="2" density="comfortable">
      <v-app-bar-title>
        <v-icon icon="$ferroLogo" class="mr-2" />
        Ferro
      </v-app-bar-title>
      <v-btn
        icon="$serverNetwork"
        :color="drawerOpen ? 'primary' : undefined"
        :title="$t('sites.servers')"
        @click="drawerOpen = !drawerOpen"
      />
      <v-btn
        icon="$logPanel"
        :color="logOpen ? 'primary' : undefined"
        :title="$t('log.title')"
        @click="logOpen = !logOpen"
      />
      <v-btn
        icon="$queuePanel"
        :color="queueOpen ? 'primary' : undefined"
        :title="$t('transfer.title')"
        @click="queueOpen = !queueOpen"
      />
      <v-spacer />
      <v-btn
        prepend-icon="$sync"
        variant="text"
        :disabled="!conn.isConnected"
        @click="syncOpen = true"
      >
        {{ $t('sync.title') }}
      </v-btn>
      <v-btn prepend-icon="$serverNetwork" variant="text" @click="openSiteManager(null)">
        {{ $t('settings.siteManager') }}
      </v-btn>
      <v-btn icon="$keyboard" :title="$t('hotkeys.title')" @click="hotkeysHelpOpen = true" />
      <v-btn icon="$settings" :title="$t('settings.title')" @click="ui.openDrawer('settings')" />
      <v-btn
        :icon="ui.themeMode === 'dark' ? '$themeDark' : '$themeLight'"
        @click="ui.toggleTheme()"
      />
    </v-app-bar>

    <v-main class="main-area">
      <div class="layout">
        <div class="main-row">
          <!-- Sol panel: "Yerel Sürücüler" ve "Site Yöneticisi" sekmeleri -->
          <div v-if="drawerOpen" class="left-panel">
            <v-card variant="flat" border class="d-flex flex-column fill-height">
              <v-tabs v-model="leftTab" density="compact" color="primary" grow class="left-tabs">
                <v-tab value="local">{{ $t('panes.local') }}</v-tab>
                <v-tab value="sites">{{ $t('settings.siteManager') }}</v-tab>
              </v-tabs>
              <v-divider />

              <!-- Yerel sürücüler sekmesi -->
              <div v-show="leftTab === 'local'" class="left-tab-pane">
                <FilePane
                  :title="$t('panes.local')"
                  icon="$localPc"
                  side="local"
                  :cwd="local.cwd"
                  :entries="local.entries"
                  :loading="local.loading"
                  :error="local.error"
                  transfer-icon="$transferOut"
                  :transfer-tooltip="$t('panes.uploadToServer')"
                  @open="(e) => local.open(e as LocalEntry)"
                  @up="local.up()"
                  @refresh="local.refresh()"
                  @transfer="onLocalTransfer"
                  @mkdir="(name) => run(local.makeDir(name), $t('toast.folderCreated'))"
                  @rename="
                    ({ entry, newName }) =>
                      run(local.rename(entry as LocalEntry, newName), $t('toast.renamed'))
                  "
                  @remove="(entry) => run(local.remove(entry as LocalEntry), $t('toast.deleted'))"
                  @drop-entry="onDropToLocal"
                />
              </div>

              <!-- Site yöneticisi sekmesi: gruplu sunucu listesi -->
              <div v-show="leftTab === 'sites'" class="left-tab-pane d-flex flex-column">
                <v-list density="compact" nav class="drawer-list flex-grow-1">
                  <!-- Grupsuz sunucular üstte -->
                  <v-list-item
                    v-for="s in sites.grouped.ungrouped"
                    :key="s.id"
                    :active="isActiveSite(s.host, s.port)"
                    :style="
                      s.colorLabel
                        ? { borderLeft: `3px solid ${siteColor(s.colorLabel)}` }
                        : undefined
                    "
                    @click="connectSite(s.id)"
                  >
                    <template #prepend>
                      <v-icon v-if="isActiveSite(s.host, s.port)" icon="$connect" color="success" />
                      <v-icon v-else :icon="s.protocol === 'sftp' ? '$sftp' : '$server'" />
                    </template>
                    <v-list-item-title>{{ s.name }}</v-list-item-title>
                    <v-list-item-subtitle>{{ s.host }}:{{ s.port }}</v-list-item-subtitle>
                    <template #append>
                      <v-btn
                        icon="mdi-pencil"
                        size="x-small"
                        variant="text"
                        :title="$t('sites.edit')"
                        @click.stop="openSiteManager(s.id)"
                      />
                    </template>
                  </v-list-item>

                  <!-- Gruplar: klasör ikonlu açılır alt grup -->
                  <v-list-group v-for="g in sites.grouped.groups" :key="g.name" :value="g.name">
                    <template #activator="{ props }">
                      <v-list-item v-bind="props" prepend-icon="mdi-folder" :title="g.name" />
                    </template>
                    <v-list-item
                      v-for="s in g.sites"
                      :key="s.id"
                      :active="isActiveSite(s.host, s.port)"
                      :style="
                        s.colorLabel
                          ? { borderLeft: `3px solid ${siteColor(s.colorLabel)}` }
                          : undefined
                      "
                      @click="connectSite(s.id)"
                    >
                      <template #prepend>
                        <v-icon
                          v-if="isActiveSite(s.host, s.port)"
                          icon="$connect"
                          color="success"
                        />
                        <v-icon v-else :icon="s.protocol === 'sftp' ? '$sftp' : '$server'" />
                      </template>
                      <v-list-item-title>{{ s.name }}</v-list-item-title>
                      <v-list-item-subtitle>{{ s.host }}:{{ s.port }}</v-list-item-subtitle>
                      <template #append>
                        <v-btn
                          icon="mdi-pencil"
                          size="x-small"
                          variant="text"
                          :title="$t('sites.edit')"
                          @click.stop="openSiteManager(s.id)"
                        />
                      </template>
                    </v-list-item>
                  </v-list-group>

                  <v-list-item v-if="!sites.sites.length" class="text-disabled text-caption">
                    {{ $t('sites.noSites') }}
                  </v-list-item>
                </v-list>

                <v-divider />
                <div class="pa-2">
                  <v-btn
                    block
                    color="primary"
                    prepend-icon="mdi-server-plus"
                    @click="openSiteManager(null)"
                  >
                    {{ $t('sites.addServer') }}
                  </v-btn>
                </div>
              </div>
            </v-card>
          </div>

          <!-- Sağ sütun: bağlantı sekmeleri + uzak sunucu (üst) + oturum günlüğü (alt) -->
          <div class="right-col">
            <!-- Açık bağlantılar: her sekme bir oturum; uzak panel + günlük onu yansıtır. -->
            <v-tabs
              v-if="conn.sessions.length"
              v-model="activeTab"
              density="compact"
              color="primary"
              show-arrows
              class="conn-tabs"
            >
              <v-tab
                v-for="s in conn.sessions"
                :key="s.sessionId"
                :value="s.sessionId"
                class="text-none"
              >
                <v-icon
                  :icon="s.config.protocol === 'sftp' ? '$sftp' : '$server'"
                  size="small"
                  class="mr-2"
                />
                {{ s.name }}
                <v-btn
                  icon="mdi-close"
                  size="x-small"
                  variant="text"
                  density="comfortable"
                  class="ml-2"
                  :title="$t('sites.disconnect')"
                  @click.stop="closeTab(s.sessionId)"
                />
              </v-tab>
            </v-tabs>

            <div class="remote-area">
              <FilePane
                :title="$t('panes.remote')"
                icon="$server"
                side="remote"
                :cwd="remote.cwd"
                :entries="remote.entries"
                :loading="remote.loading"
                :error="remote.error"
                :disabled="!conn.isConnected"
                supports-chmod
                supports-edit
                transfer-icon="$transferIn"
                :transfer-tooltip="$t('panes.downloadToLocal')"
                @open="(e) => remote.open(e as RemoteEntry)"
                @up="remote.up()"
                @refresh="remote.refresh()"
                @transfer="onRemoteTransfer"
                @mkdir="(name) => run(remote.makeDir(name), $t('toast.folderCreated'))"
                @rename="
                  ({ entry, newName }) =>
                    run(remote.rename(entry as RemoteEntry, newName), $t('toast.renamed'))
                "
                @remove="(entry) => run(remote.remove(entry as RemoteEntry), $t('toast.deleted'))"
                @chmod="
                  ({ entry, mode }) =>
                    run(remote.chmod(entry as RemoteEntry, mode), $t('toast.permsUpdated'))
                "
                @edit="onRemoteEdit"
                @drop-entry="onDropToRemote"
              />
            </div>

            <div v-if="logOpen" class="log-area">
              <LogPanel />
            </div>
          </div>
        </div>

        <!-- Kuyruk: en altta, tam genişlik -->
        <div v-if="queueOpen" class="queue-area">
          <TransferTabs />
        </div>
      </div>

      <HostKeyDialog />
      <TlsDialog />
      <SiteManager v-model="siteManagerOpen" :focus-site-id="siteManagerFocusId" />
      <SyncDialog v-model="syncOpen" />

      <!-- Klavye kısayolları yardımı -->
      <v-dialog v-model="hotkeysHelpOpen" max-width="460">
        <v-card>
          <v-toolbar density="compact" color="surface">
            <v-icon icon="$keyboard" class="ml-3" />
            <v-toolbar-title class="text-body-1">{{ $t('hotkeys.title') }}</v-toolbar-title>
            <v-spacer />
            <v-btn icon="mdi-close" size="small" @click="hotkeysHelpOpen = false" />
          </v-toolbar>
          <v-list>
            <v-list-item v-for="h in hotkeys" :key="h.keys">
              <v-list-item-title>{{ $t(h.labelKey) }}</v-list-item-title>
              <template #append>
                <v-hotkey :keys="h.keys" />
              </template>
            </v-list-item>
          </v-list>
          <v-divider />
          <div class="pa-3 text-caption text-medium-emphasis">{{ $t('hotkeys.hint') }}</div>
        </v-card>
      </v-dialog>
    </v-main>
  </div>
</template>

<style scoped>
/* Kök sarmalayıcı layout'a şeffaf — app-bar/main doğrudan v-app'in (App.vue) çocuğu gibi davranır. */
.ferro-root {
  display: contents;
}
/* v-main, uygulama çubuğunun yüksekliği kadar padding ile içeriği aşağı iter.
   Yüksekliği görünüm alanına sabitleyince (border-box) içerik kutusu
   tam olarak "ekran − app-bar" kadar olur; böylece sayfa hiç kaydırılmaz. */
.main-area {
  height: 100vh;
  overflow: hidden;
}
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 6px;
  padding: 6px;
  box-sizing: border-box;
}
/* Üst satır: sol panel (sekmeli) + sağ sütun (uzak + log). */
.main-row {
  display: flex;
  gap: 6px;
  flex: 1 1 auto;
  min-height: 0;
}
/* Sol panel: sabit genişlik oranı, ekran örneğindeki gibi. */
.left-panel {
  flex: 0 0 40%;
  max-width: 560px;
  min-width: 280px;
  min-height: 0;
}
/* v-tabs bir slide-group'tur; dikey flex sütununda büyümesini engelle. */
.left-tabs {
  flex: 0 0 auto;
}
/* Sekme içeriği kalan alanı doldurur; içindeki panel fill-height ile yayılır. */
.left-tab-pane {
  flex: 1 1 auto;
  min-height: 0;
}
.drawer-list {
  overflow-y: auto;
}
/* Sağ sütun: uzak sunucu üstte (esner), log altta (sabit). */
.right-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
/* Bağlantı sekmeleri: dikey flex sütununda büyümesin (doğal yüksekliğinde kalsın). */
.conn-tabs {
  flex: 0 0 auto;
}
.remote-area {
  flex: 1 1 auto;
  min-height: 0;
}
.log-area {
  height: 150px;
  flex: 0 0 auto;
}
/* Kuyruk: en altta, tam genişlik. */
.queue-area {
  height: 200px;
  flex: 0 0 auto;
}
</style>
