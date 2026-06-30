<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, onBeforeUnmount } from 'vue'
import { useHotkey } from 'vuetify'
// <v-hotkey> şablonda kullanılır; autoImport otomatik içe aktarır (elle import yok).
import { onEvent, invoke } from '@renderer/lib/ipc'
import { useUiStore } from '@renderer/stores/ui'
import { useConnectionStore } from '@renderer/stores/connection'
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
import { ref } from 'vue'

const ui = useUiStore()
const { theme } = storeToRefs(ui)

const siteManagerOpen = ref(false)
const siteManagerFocusId = ref<string | null>(null)
const drawerOpen = ref(true)
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

function isActiveSite(host: string, port: number): boolean {
  return conn.isConnected && conn.config?.host === host && conn.config?.port === port
}

// Kenar çubuğundaki bir sunucuya tıklama: bağlıysa kes, değilse bağlan.
// Başka bir sunucuya geçişte önce mevcut oturum kapatılır.
function connectSite(id: string): void {
  const site = sites.sites.find((s) => s.id === id)
  if (!site) return
  if (isActiveSite(site.host, site.port)) {
    remote.reset()
    run(conn.disconnect())
    return
  }
  run(
    (async () => {
      if (conn.isConnected) {
        remote.reset()
        await conn.disconnect()
      }
      await sites.connect(site)
    })()
  )
}

let unsubLog: (() => void) | null = null
let unsubProgress: (() => void) | null = null

onMounted(async () => {
  unsubLog = onEvent('session:log', (e) => log.append(e))
  unsubProgress = onEvent('transfer:update', (job) => transfer.onUpdate(job))
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

// Hata yakalama: işlem hataları log paneline düşer (SessionManager) veya store error'una.
function run(p: Promise<unknown>): void {
  void p.catch((err) =>
    log.append({ sessionId: '', level: 'error', text: String(err?.message ?? err) })
  )
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
        :icon="theme === 'ferroDark' ? '$themeDark' : '$themeLight'"
        @click="ui.toggleTheme()"
      />
    </v-app-bar>

    <v-navigation-drawer v-model="drawerOpen" width="280">
      <template #prepend>
        <div class="drawer-title">{{ $t('sites.servers') }}</div>
        <v-divider />
      </template>

      <v-list density="compact" nav class="drawer-list">
        <v-list-item
          v-for="s in sites.sites"
          :key="s.id"
          :active="isActiveSite(s.host, s.port)"
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

        <v-list-item v-if="!sites.sites.length" class="text-disabled text-caption">
          {{ $t('sites.noSites') }}
        </v-list-item>
      </v-list>

      <template #append>
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
      </template>
    </v-navigation-drawer>

    <v-main class="main-area">
      <div class="layout">
        <div v-if="logOpen" class="log-area">
          <LogPanel />
        </div>

        <div class="panes">
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
            @mkdir="(name) => run(local.makeDir(name))"
            @rename="({ entry, newName }) => run(local.rename(entry as LocalEntry, newName))"
            @remove="(entry) => run(local.remove(entry as LocalEntry))"
            @drop-entry="onDropToLocal"
          />
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
            @mkdir="(name) => run(remote.makeDir(name))"
            @rename="({ entry, newName }) => run(remote.rename(entry as RemoteEntry, newName))"
            @remove="(entry) => run(remote.remove(entry as RemoteEntry))"
            @chmod="({ entry, mode }) => run(remote.chmod(entry as RemoteEntry, mode))"
            @edit="onRemoteEdit"
            @drop-entry="onDropToRemote"
          />
        </div>

        <div v-if="queueOpen" class="transfer-area">
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
.drawer-title {
  padding: 12px 16px;
  font-size: 0.95rem;
  font-weight: 600;
  text-align: left;
}
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
.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  flex: 1 1 auto;
  min-height: 0;
}
.log-area {
  height: 140px;
  flex: 0 0 auto;
}
.transfer-area {
  height: 200px;
  flex: 0 0 auto;
}
</style>
