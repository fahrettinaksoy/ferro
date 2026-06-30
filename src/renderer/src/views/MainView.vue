<script setup lang="ts">
import { useTheme } from 'vuetify'
import { storeToRefs } from 'pinia'
import { onMounted, onBeforeUnmount, watch } from 'vue'
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
const vTheme = useTheme()
watch(theme, (t) => vTheme.change(t), { immediate: true })

const siteManagerOpen = ref(false)
const siteManagerFocusId = ref<string | null>(null)
const drawerOpen = ref(true)
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
  void p.catch((err) => log.append({ sessionId: '', level: 'error', text: String(err?.message ?? err) }))
}
</script>

<template>
  <v-app>
    <v-app-bar :elevation="2" density="comfortable">
      <v-app-bar-nav-icon @click="drawerOpen = !drawerOpen" />
      <v-app-bar-title>
        <v-icon icon="mdi-folder-network" class="mr-2" />
        Ferro
      </v-app-bar-title>
      <v-spacer />
      <v-btn
        prepend-icon="mdi-sync"
        variant="text"
        :disabled="!conn.isConnected"
        @click="syncOpen = true"
      >
        {{ $t('sync.title') }}
      </v-btn>
      <v-btn prepend-icon="mdi-server-network" variant="text" @click="openSiteManager(null)">
        {{ $t('settings.siteManager') }}
      </v-btn>
      <v-menu :close-on-content-click="false">
        <template #activator="{ props }">
          <v-btn icon="mdi-cog" v-bind="props" />
        </template>
        <v-list density="compact" min-width="260">
          <v-list-subheader>{{ $t('settings.language') }}</v-list-subheader>
          <v-list-item :active="ui.language === 'tr'" title="Türkçe" @click="ui.setLanguage('tr')" />
          <v-list-item :active="ui.language === 'en'" title="English" @click="ui.setLanguage('en')" />
          <v-divider />
          <v-list-item>
            <v-text-field
              :model-value="ui.bandwidthKBs"
              :label="$t('settings.bandwidth')"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              @update:model-value="ui.setBandwidth(Number($event))"
            />
          </v-list-item>
        </v-list>
      </v-menu>
      <v-btn
        :icon="theme === 'ferroDark' ? 'mdi-weather-night' : 'mdi-weather-sunny'"
        @click="ui.toggleTheme()"
      />
    </v-app-bar>

    <v-navigation-drawer v-model="drawerOpen" width="280">
      <v-list-subheader>{{ $t('sites.servers') }}</v-list-subheader>
      <v-divider />

      <v-list density="compact" nav class="drawer-list">
        <v-list-item
          v-for="s in sites.sites"
          :key="s.id"
          :active="isActiveSite(s.host, s.port)"
          @click="connectSite(s.id)"
        >
          <template #prepend>
            <v-icon
              v-if="isActiveSite(s.host, s.port)"
              icon="mdi-lan-connect"
              color="success"
            />
            <v-icon v-else :icon="s.protocol === 'sftp' ? 'mdi-shield-lock' : 'mdi-server'" />
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
        <div class="log-area">
          <LogPanel />
        </div>

        <div class="panes">
          <FilePane
            :title="$t('panes.local')"
            icon="mdi-laptop"
            side="local"
            :cwd="local.cwd"
            :entries="local.entries"
            :loading="local.loading"
            :error="local.error"
            transfer-icon="mdi-arrow-right-bold"
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
            icon="mdi-server"
            side="remote"
            :cwd="remote.cwd"
            :entries="remote.entries"
            :loading="remote.loading"
            :error="remote.error"
            :disabled="!conn.isConnected"
            supports-chmod
            supports-edit
            transfer-icon="mdi-arrow-left-bold"
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

        <div class="transfer-area">
          <TransferTabs />
        </div>
      </div>

      <HostKeyDialog />
      <TlsDialog />
      <SiteManager v-model="siteManagerOpen" :focus-site-id="siteManagerFocusId" />
      <SyncDialog v-model="syncOpen" />
    </v-main>
  </v-app>
</template>

<style scoped>
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
