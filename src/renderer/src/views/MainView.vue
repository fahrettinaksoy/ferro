<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, defineAsyncComponent } from 'vue'
import { useHotkey } from 'vuetify'
import { useI18n } from 'vue-i18n'
// <v-hotkey> şablonda kullanılır; autoImport otomatik içe aktarır (elle import yok).
import { onEvent, invoke } from '@renderer/lib/ipc'
import { useUiStore } from '@renderer/stores/ui'
import { useConnectionStore } from '@renderer/stores/connection'
import { useToastStore, errText } from '@renderer/stores/toast'
import { useSitesStore } from '@renderer/stores/sites'
import { useSyncStore } from '@renderer/stores/sync'
import { useRemoteFsStore } from '@renderer/stores/remoteFs'
import { useLocalStore } from '@renderer/stores/local'
import { useLogStore } from '@renderer/stores/log'
import { useTransferStore } from '@renderer/stores/transfer'
import type { LocalEntry, RemoteEntry } from '@shared/transfer'
import FilePane from '@renderer/components/FilePane.vue'
import LogPanel from '@renderer/components/LogPanel.vue'
import TransferTabs from '@renderer/components/TransferTabs.vue'
import { ref, computed } from 'vue'

// Nadiren açılan diyalog/panel bileşenleri: her oturumda çoğu zaman hiç
// render edilmez (host key/TLS uyarısı, parola sorma gibi istisnai akışlar
// veya kullanıcının nadiren açtığı Site Yöneticisi/Ekip/Senkron panelleri).
// defineAsyncComponent ile ayrı chunk'a alınır — başlangıç paketi bu kodu
// yalnızca ilk açılışta indirir/derler, her uygulama açılışında değil.
const HostKeyDialog = defineAsyncComponent(() => import('@renderer/components/HostKeyDialog.vue'))
const PasswordDialog = defineAsyncComponent(() => import('@renderer/components/PasswordDialog.vue'))
const TlsDialog = defineAsyncComponent(() => import('@renderer/components/TlsDialog.vue'))
const SiteManager = defineAsyncComponent(() => import('@renderer/components/SiteManager.vue'))
const SyncDialog = defineAsyncComponent(() => import('@renderer/components/SyncDialog.vue'))
const TeamDialog = defineAsyncComponent(() => import('@renderer/components/TeamDialog.vue'))
const SyncDrawer = defineAsyncComponent(() => import('@renderer/components/SyncDrawer.vue'))

const ui = useUiStore()
const { t } = useI18n()
const toast = useToastStore()

const siteManagerOpen = ref(false)
const siteManagerFocusId = ref<string | null>(null)
const drawerOpen = ref(true)
// Sol panel sekmesi: yerel sürücüler ↔ site yöneticisi (sunucu listesi).
// Varsayılan: site yöneticisi (bağlanılacak sunucu seçilir); bağlandıktan
// sonra otomatik olarak yerel diske geçilir (bkz. connectSite).
const leftTab = ref<'local' | 'sites'>('sites')
const logOpen = ref(true)
const queueOpen = ref(true)
const syncOpen = ref(false)
const teamsOpen = ref(false)
// Bulut senkron paneli (kendi drawer'ı) — 'syncOpen' dizin karşılaştırma diyaloğudur.
const cloudSyncOpen = ref(false)
const conn = useConnectionStore()
const remote = useRemoteFsStore()
const local = useLocalStore()
const log = useLogStore()
const transfer = useTransferStore()
const sites = useSitesStore()
const sync = useSyncStore()

// Sol kenar çubuğundan site yönetimini aç: "Sunucu Ekle" (yeni) veya düzenle.
function openSiteManager(siteId: string | null = null): void {
  siteManagerFocusId.value = siteId
  siteManagerOpen.value = true
}

// Bir sitenin açık oturumu (bağlanıyor/bağlı/hata) — kenar listesi durumu.
function siteSession(host: string, port: number): (typeof conn.sessions)[number] | undefined {
  return conn.sessions.find((x) => x.config.host === host && x.config.port === port)
}

// Bir site için BAĞLI bir oturum var mı (kenar listesi vurgusu)?
function isActiveSite(host: string, port: number): boolean {
  return siteSession(host, port)?.status === 'connected'
}

// ── Grup (klasör) yeniden adlandırma ──
const renameGroupOpen = ref(false)
const renameGroupFrom = ref('')
const renameGroupTo = ref('')
function openRenameGroup(name: string): void {
  renameGroupFrom.value = name
  renameGroupTo.value = name
  renameGroupOpen.value = true
}
function confirmRenameGroup(): void {
  const to = renameGroupTo.value.trim()
  if (!to || to === renameGroupFrom.value) {
    renameGroupOpen.value = false
    return
  }
  run(sites.renameGroup(renameGroupFrom.value, to))
  renameGroupOpen.value = false
}

// Bağlantı sekmeleri (v-tabs) için etkin sekme köprüsü. Sekme değeri olarak
// DEĞİŞMEZ tabId kullanılır: sessionId bağlanınca yeniden adlandığından model
// ona bağlanırsa v-tabs seçimi eski sekmeye geri yazabiliyor.
const activeTab = computed<string | null>({
  get: () => conn.active?.tabId ?? null,
  set: (v) => {
    if (v) conn.setActive(v)
  }
})

// Sekmeyi kapat: oturumu keser, uzak/günlük durumu temizlenir (store'da).
// Toast yok — sekmenin kapanması ve log satırı ("Bağlantı kapatıldı") yeterli.
function closeTab(sessionId: string): void {
  void conn.disconnect(sessionId)
}

// Herhangi bir BAĞLI oturum var mı? (Kuyruk başlat/durdur yalnızca o zaman anlamlı;
// etkin sekme hata sekmesi olsa bile başka bir bağlı oturum yeterlidir.)
const anyConnected = computed(() => conn.sessions.some((s) => s.status === 'connected'))

// Araç çubuğu: etkin oturumun bağlantısını kes.
function disconnectActive(): void {
  if (conn.activeId) closeTab(conn.activeId)
}

// Araç çubuğu: etkin oturumu yeniden bağla — önce kes, sonra aynı siteye
// (site silinmişse aynı yapılandırmaya) yeni bağlantı aç. Hata sekmesinde
// "yeniden dene" işlevi görür.
async function reconnectActive(): Promise<void> {
  const s = conn.active
  if (!s || s.status === 'connecting') return
  const site =
    (s.siteId ? sites.sites.find((x) => x.id === s.siteId) : undefined) ??
    sites.sites.find((x) => x.host === s.config.host && x.port === s.config.port)
  const config = s.config
  await conn.disconnect(s.sessionId).catch(() => {})
  const connect = site ? sites.connect(site) : conn.connect(config).then((cwd) => remote.load(cwd))
  connect.catch(() => {}) // ilerleyiş ve hata sekme/panel/günlükte görünür
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

// Site öğesine tıklama: BAĞLANMAZ — açık bir oturumu varsa yalnızca o sekmeyi
// etkinleştirir (bağlanma/kesme yalnızca sağdaki butonla yapılır).
function focusSite(s: { host: string; port: number }): void {
  const sess = siteSession(s.host, s.port)
  if (sess) conn.setActive(sess.sessionId)
}

// Bağlan/Kes butonu: oturum yoksa bağlanır, bağlıysa (veya hata sekmesiyse)
// bağlantıyı keser; bağlanma sürerken yoksayılır.
function toggleSite(id: string): void {
  const site = sites.sites.find((s) => s.id === id)
  if (!site) return
  const sess = siteSession(site.host, site.port)
  if (sess) {
    if (sess.status !== 'connecting') closeTab(sess.sessionId)
    return
  }
  // Toast yok: ilerleyiş sekmede/uzak panelde ("Bağlanıyor…") ve log panelinde
  // akar; hata da hata sekmesi + panel şeridinde görünür.
  sites
    .connect(site)
    .then((ok) => {
      // Bağlantı kurulunca yerel disk sekmesine geç (parola iptalinde kalınır).
      if (ok) leftTab.value = 'local'
    })
    .catch(() => {})
}

// Panel görünürlükleri ↔ Görünüm menüsü eşitlemesi (iki yönlü):
// menü tıklaması paneli açar/kapatır; buradaki her değişiklik menü imlerini günceller.
watch(
  [drawerOpen, logOpen, queueOpen],
  ([servers, logPanel, queue]) => {
    void invoke('app:setPanelState', { servers, log: logPanel, queue }).catch(() => {})
  },
  { immediate: true }
)

// Bağlantı durumu → Sunucu menüsü öğelerinin etkinlik/onay durumları.
watch(
  () => ({
    hasActive: !!conn.active,
    connecting: conn.active?.status === 'connecting',
    connected: conn.isConnected,
    anyConnected: anyConnected.value,
    paused: transfer.paused
  }),
  (s) => {
    void invoke('app:setConnState', s).catch(() => {})
  },
  { immediate: true }
)

let unsubLog: (() => void) | null = null
let unsubProgress: (() => void) | null = null
let unsubConnecting: (() => void) | null = null
let unsubTogglePanel: (() => void) | null = null
let unsubMenuAction: (() => void) | null = null

onMounted(async () => {
  // Bekleyen sekme gerçek oturum kimliğine bağlanır → bağlanma günlüğü canlı akar.
  unsubConnecting = onEvent('session:connecting', (e) => conn.bindPending(e))
  unsubTogglePanel = onEvent('app:togglePanel', ({ panel }) => {
    if (panel === 'servers') drawerOpen.value = !drawerOpen.value
    else if (panel === 'log') logOpen.value = !logOpen.value
    else queueOpen.value = !queueOpen.value
  })
  unsubMenuAction = onEvent('app:menuAction', ({ action }) => {
    switch (action) {
      case 'settings':
        ui.openDrawer('settings')
        break
      case 'siteManager':
      case 'connect': // Bağlan… → sunucu seçmek için Site Yöneticisi
        openSiteManager(null)
        break
      case 'hotkeys':
        hotkeysHelpOpen.value = true
        break
      case 'disconnect':
        disconnectActive()
        break
      case 'reconnect':
        void reconnectActive()
        break
      case 'sync':
        if (conn.isConnected) syncOpen.value = true
        break
      case 'teams':
        teamsOpen.value = true
        break
      case 'cloudSync':
        cloudSyncOpen.value = true
        break
      case 'toggleTransfers':
        // Toolbar butonuyla aynı hata yakalama: IPC hatası toast'a düşer.
        if (anyConnected.value) run(transfer.setPaused(!transfer.paused))
        break
    }
  })
  unsubLog = onEvent('session:log', (e) => log.append(e))
  unsubProgress = onEvent('transfer:update', (job) => {
    transfer.onUpdate(job)
    if (job.status === 'completed') toast.success(t('toast.transferDone', { name: job.name }))
    else if (job.status === 'failed') toast.error(t('toast.transferFailed', { name: job.name }))
  })
  // Başlangıç IPC çağrıları: hatalar sessizce kaybolmasın — kullanıcıya toast ile bildir.
  try {
    await ui.applyRuntimeSettings()
    await local.init()
    await sites.load()
  } catch (err) {
    toast.error(t('toast.error', { msg: errText(err) }))
  }

  // Açılışta otomatik senkron (yalnızca autoSync açık + yapılandırılmışsa).
  // Ayarlar değiştiyse tek seferlik yeniden yükleme (döngü korumalı: yeniden
  // açılışta uzak ayarlar yerelle aynı olduğundan applySettings değişiklik
  // görmez, tekrar reload olmaz). Site içe aktarımı main'de yapıldığından
  // renderer listesi tazelenir.
  try {
    await sync.load()
    const settingsChanged = await sync.autoPullOnStartup()
    if (settingsChanged) {
      window.location.reload()
    } else if (sync.autoSync && sync.isConfigured) {
      await sites.load()
    }
  } catch {
    /* açılış senkronu sessiz — kullanıcıyı ağ hatasıyla rahatsız etme */
  }
})

onBeforeUnmount(() => {
  unsubLog?.()
  unsubProgress?.()
  unsubConnecting?.()
  unsubTogglePanel?.()
  unsubMenuAction?.()
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
  { keys: 'cmd+shift+t', labelKey: 'team.title', run: () => (teamsOpen.value = true) },
  { keys: 'cmd+shift+y', labelKey: 'cloudSync.title', run: () => (cloudSyncOpen.value = true) },
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
    <!-- M3 üst uygulama çubuğu: panellerle aynı tonal kap (surface-container-low),
         sınır çizgisi yok. Marka bloğu + gruplanmış salt-ikon eylemler; yazı yok,
         her buton alt konumlu tooltip taşır. Gruplar ayraç yerine boşlukla
         ayrılır; etkin panel butonları M3 tonal dolgu alır. -->
    <v-app-bar flat density="comfortable" color="surface-container-low" class="app-bar">
      <v-defaults-provider :defaults="{ VTooltip: { location: 'bottom', openDelay: 350 } }">
        <div class="brand d-flex align-center">
          <v-avatar size="30" rounded="lg" color="primary" variant="tonal" class="mr-2">
            <v-icon icon="$ferroLogo" size="18" />
          </v-avatar>
          <span class="brand-name">Ferro</span>
        </div>
        <div class="mx-3" />

        <!-- Panel görünürlüğü -->
        <v-btn
          :variant="drawerOpen ? 'tonal' : 'text'"
          :color="drawerOpen ? 'primary' : undefined"
          icon
          @click="drawerOpen = !drawerOpen"
        >
          <v-icon icon="mdi-dock-left" />
          <v-tooltip activator="parent">{{ $t('sites.servers') }}</v-tooltip>
        </v-btn>
        <v-btn
          :variant="logOpen ? 'tonal' : 'text'"
          :color="logOpen ? 'primary' : undefined"
          icon
          @click="logOpen = !logOpen"
        >
          <v-icon icon="$logPanel" />
          <v-tooltip activator="parent">{{ $t('log.title') }}</v-tooltip>
        </v-btn>
        <v-btn
          :variant="queueOpen ? 'tonal' : 'text'"
          :color="queueOpen ? 'primary' : undefined"
          icon
          @click="queueOpen = !queueOpen"
        >
          <v-icon icon="$queuePanel" />
          <v-tooltip activator="parent">{{ $t('transfer.title') }}</v-tooltip>
        </v-btn>

        <v-spacer />

        <!-- Etkin oturum bağlantı denetimleri -->
        <v-btn icon :disabled="!conn.active" @click="disconnectActive()">
          <v-icon icon="mdi-lan-disconnect" />
          <v-tooltip activator="parent">{{ $t('sites.disconnect') }}</v-tooltip>
        </v-btn>
        <v-btn
          icon
          :disabled="!conn.active || conn.active.status === 'connecting'"
          @click="reconnectActive()"
        >
          <v-icon icon="mdi-restart" />
          <v-tooltip activator="parent">{{ $t('sites.reconnect') }}</v-tooltip>
        </v-btn>
        <v-btn icon :disabled="!conn.isConnected" @click="syncOpen = true">
          <v-icon icon="$sync" />
          <v-tooltip activator="parent">{{ $t('sync.title') }}</v-tooltip>
        </v-btn>
        <!-- Kuyruk başlat/durdur: duraklatınca sıradaki işler bekler
             (aktif transferler sürer), başlatınca kaldığı yerden devam eder. -->
        <v-btn
          icon
          :color="transfer.paused ? 'warning' : undefined"
          :disabled="!anyConnected"
          @click="run(transfer.setPaused(!transfer.paused))"
        >
          <v-icon :icon="transfer.paused ? 'mdi-play' : 'mdi-pause'" />
          <v-tooltip activator="parent">
            {{ transfer.paused ? $t('transfer.resumeAll') : $t('transfer.pauseAll') }}
          </v-tooltip>
        </v-btn>
        <v-divider vertical inset class="mx-1" />

        <!-- Araçlar -->
        <v-btn icon @click="openSiteManager(null)">
          <v-icon icon="$serverNetwork" />
          <v-tooltip activator="parent">{{ $t('settings.siteManager') }}</v-tooltip>
        </v-btn>
        <v-btn icon @click="teamsOpen = true">
          <v-icon icon="mdi-account-group" />
          <v-tooltip activator="parent">{{ $t('team.title') }}</v-tooltip>
        </v-btn>
        <v-btn icon @click="cloudSyncOpen = true">
          <v-icon icon="mdi-cloud-sync" />
          <v-tooltip activator="parent">{{ $t('cloudSync.title') }}</v-tooltip>
        </v-btn>
        <v-btn icon @click="ui.openDrawer('settings')">
          <v-icon icon="$settings" />
          <v-tooltip activator="parent">{{ $t('settings.title') }}</v-tooltip>
        </v-btn>
        <v-divider vertical inset class="mx-1" />
        <v-btn icon @click="hotkeysHelpOpen = true">
          <v-icon icon="$keyboard" />
          <v-tooltip activator="parent">{{ $t('hotkeys.title') }}</v-tooltip>
        </v-btn>
        <v-btn icon @click="ui.toggleTheme()">
          <v-icon :icon="ui.themeMode === 'dark' ? '$themeDark' : '$themeLight'" />
          <v-tooltip activator="parent">{{ $t('settings.theme') }}</v-tooltip>
        </v-btn>
      </v-defaults-provider>
    </v-app-bar>

    <v-main class="main-area">
      <div class="layout">
        <!-- swapPanes (Ayarlar → Arayüz): kenar çubuğunu sağa alır (row-reverse). -->
        <div class="main-row" :class="{ 'main-row--swap': ui.prefs.iface.swapPanes }">
          <!-- Sol panel: "Yerel Sürücüler" ve "Site Yöneticisi" sekmeleri -->
          <div v-if="drawerOpen" class="left-panel">
            <v-card variant="flat" class="d-flex flex-column fill-height m3-surface">
              <!-- Kart başlığı olarak sekmeler: sağdaki bağlantı şeridiyle aynı
                   yükseklik ve ayırıcı — iki sütun aynı M3 dilinde okunur. -->
              <v-tabs
                v-model="leftTab"
                density="compact"
                color="primary"
                grow
                height="44"
                class="left-tabs"
              >
                <v-tab value="sites">{{ $t('settings.siteManager') }}</v-tab>
                <v-tab value="local">{{ $t('panes.local') }}</v-tab>
              </v-tabs>
              <v-divider />

              <!-- Yerel sürücüler sekmesi -->
              <div v-show="leftTab === 'local'" class="left-tab-pane">
                <FilePane
                  class="local-pane"
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
                  @navigate="(p) => void local.load(p)"
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
                    @click="focusSite(s)"
                  >
                    <template #prepend>
                      <v-progress-circular
                        v-if="siteSession(s.host, s.port)?.status === 'connecting'"
                        indeterminate
                        size="18"
                        width="2"
                        color="primary"
                      />
                      <v-icon
                        v-else-if="siteSession(s.host, s.port)?.status === 'error'"
                        icon="mdi-alert-circle"
                        color="error"
                      />
                      <v-icon
                        v-else-if="isActiveSite(s.host, s.port)"
                        icon="$connect"
                        color="success"
                      />
                      <v-icon v-else :icon="s.protocol === 'sftp' ? '$sftp' : '$server'" />
                    </template>
                    <v-list-item-title>{{ s.name }}</v-list-item-title>
                    <v-list-item-subtitle>{{ s.host }}:{{ s.port }}</v-list-item-subtitle>
                    <template #append>
                      <v-btn
                        :icon="
                          siteSession(s.host, s.port) ? 'mdi-lan-disconnect' : 'mdi-connection'
                        "
                        size="x-small"
                        variant="text"
                        :disabled="siteSession(s.host, s.port)?.status === 'connecting'"
                        :title="
                          siteSession(s.host, s.port)
                            ? $t('sites.disconnect')
                            : $t('common.connect')
                        "
                        @click.stop="toggleSite(s.id)"
                      />
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
                    <template #activator="{ props, isOpen }">
                      <!-- Klasör başlığı: yeniden adlandırma butonu + aç/kapa oku.
                           #append oku ezdiği için chevron'ı isOpen ile elle çiziyoruz. -->
                      <v-list-item v-bind="props" prepend-icon="mdi-folder" :title="g.name">
                        <template #append>
                          <v-btn
                            icon="mdi-folder-edit"
                            size="x-small"
                            variant="text"
                            :title="$t('sites.renameGroup')"
                            @click.stop="openRenameGroup(g.name)"
                          />
                          <v-icon :icon="isOpen ? '$collapse' : '$expand'" class="ms-1" />
                        </template>
                      </v-list-item>
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
                      @click="focusSite(s)"
                    >
                      <template #prepend>
                        <v-progress-circular
                          v-if="siteSession(s.host, s.port)?.status === 'connecting'"
                          indeterminate
                          size="18"
                          width="2"
                          color="primary"
                        />
                        <v-icon
                          v-else-if="siteSession(s.host, s.port)?.status === 'error'"
                          icon="mdi-alert-circle"
                          color="error"
                        />
                        <v-icon
                          v-else-if="isActiveSite(s.host, s.port)"
                          icon="$connect"
                          color="success"
                        />
                        <v-icon v-else :icon="s.protocol === 'sftp' ? '$sftp' : '$server'" />
                      </template>
                      <v-list-item-title>{{ s.name }}</v-list-item-title>
                      <v-list-item-subtitle>{{ s.host }}:{{ s.port }}</v-list-item-subtitle>
                      <template #append>
                        <v-btn
                          :icon="
                            siteSession(s.host, s.port) ? 'mdi-lan-disconnect' : 'mdi-connection'
                          "
                          size="x-small"
                          variant="text"
                          :disabled="siteSession(s.host, s.port)?.status === 'connecting'"
                          :title="
                            siteSession(s.host, s.port)
                              ? $t('sites.disconnect')
                              : $t('common.connect')
                          "
                          @click.stop="toggleSite(s.id)"
                        />
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

                  <v-empty-state
                    v-if="!sites.sites.length"
                    icon="mdi-server-off"
                    :text="$t('sites.noSites')"
                    size="40"
                  />
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
            <!-- Bağlantı sekmeleri: her sekme bir oturum; uzak panel + günlük onu
                 yansıtır. Şerit HER ZAMAN sabit yükseklikte, panellerle aynı
                 çerçeveli yüzeyde durur (yerleşim oynamaz). Oturum yokken
                 tarayıcıdaki boş sekme gibi bir VARSAYILAN sekme görünür;
                 tıklanınca Site Yöneticisi açılır. İlk bağlantıda yerini oturum
                 sekmesi alır, sonrakiler yanına eklenir. -->
            <div class="remote-group">
              <div class="conn-tabs">
                <v-tabs
                  v-model="activeTab"
                  density="compact"
                  color="primary"
                  show-arrows
                  height="44"
                  class="flex-grow-1"
                >
                  <v-tab
                    v-for="s in conn.sessions"
                    :key="s.tabId"
                    :value="s.tabId"
                    class="text-none"
                  >
                    <v-progress-circular
                      v-if="s.status === 'connecting'"
                      indeterminate
                      size="14"
                      width="2"
                      class="mr-2"
                    />
                    <v-icon
                      v-else-if="s.status === 'error'"
                      icon="mdi-alert-circle"
                      color="error"
                      size="small"
                      class="mr-2"
                    />
                    <v-icon
                      v-else
                      :icon="s.config.protocol === 'sftp' ? '$sftp' : '$server'"
                      size="small"
                      class="mr-2"
                    />
                    {{ s.name }}
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      density="comfortable"
                      class="ml-2"
                      @click.stop="closeTab(s.sessionId)"
                    >
                      <v-icon icon="mdi-close" />
                      <v-tooltip activator="parent" location="bottom">
                        {{ $t('sites.disconnect') }}
                      </v-tooltip>
                    </v-btn>
                  </v-tab>

                  <!-- Varsayılan sekme: bağlantı yokken şeridin sahibi. -->
                  <v-tab
                    v-if="!conn.sessions.length"
                    :value="null"
                    class="text-none"
                    @click="openSiteManager(null)"
                  >
                    <v-icon icon="mdi-plus" size="small" class="mr-2" />
                    {{ $t('panes.defaultTab') }}
                    <v-tooltip activator="parent" location="bottom">
                      {{ $t('panes.defaultTabHint') }}
                    </v-tooltip>
                  </v-tab>
                </v-tabs>
              </div>

              <div class="remote-area">
                <FilePane
                  class="remote-pane"
                  :title="$t('panes.remote')"
                  icon="$server"
                  side="remote"
                  :cwd="remote.cwd"
                  :entries="remote.entries"
                  :loading="remote.loading || conn.active?.status === 'connecting'"
                  :error="conn.active?.status === 'error' ? conn.active.error : remote.error"
                  :connecting="conn.active?.status === 'connecting'"
                  :disabled="!conn.isConnected"
                  supports-chmod
                  supports-edit
                  transfer-icon="$transferIn"
                  :transfer-tooltip="$t('panes.downloadToLocal')"
                  @open="(e) => remote.open(e as RemoteEntry)"
                  @up="remote.up()"
                  @refresh="remote.refresh()"
                  @navigate="(p) => void remote.load(p)"
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
            </div>

            <div v-if="logOpen && ui.prefs.iface.messageLogPos !== 'hidden'" class="log-area">
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
      <PasswordDialog />
      <SyncDialog v-model="syncOpen" />

      <!-- Grup (klasör) yeniden adlandırma -->
      <v-dialog v-model="renameGroupOpen" max-width="420">
        <v-card :title="$t('sites.renameGroup')">
          <v-card-text>
            <v-text-field
              v-model="renameGroupTo"
              :label="$t('sites.newGroupName')"
              autofocus
              hide-details
              @keyup.enter="confirmRenameGroup()"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="renameGroupOpen = false">{{ $t('common.cancel') }}</v-btn>
            <v-btn
              color="primary"
              variant="tonal"
              :disabled="!renameGroupTo.trim() || renameGroupTo.trim() === renameGroupFrom"
              @click="confirmRenameGroup()"
            >
              {{ $t('common.save') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Klavye kısayolları yardımı -->
      <v-dialog v-model="hotkeysHelpOpen" max-width="460">
        <v-card>
          <v-toolbar density="compact" color="surface">
            <v-icon icon="$keyboard" class="ml-3" />
            <v-toolbar-title class="text-body-large">{{ $t('hotkeys.title') }}</v-toolbar-title>
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
          <div class="pa-3 text-body-small text-medium-emphasis">{{ $t('hotkeys.hint') }}</div>
        </v-card>
      </v-dialog>
    </v-main>

    <!-- Sağdan açılan modal navigation drawer — v-app layout'una kaydolması
         için v-main DIŞINDA durur (ferro-root display:contents olduğundan
         layout açısından v-app'in doğrudan çocuğudur). -->
    <SiteManager v-model="siteManagerOpen" :focus-site-id="siteManagerFocusId" />
    <!-- Ekip paylaşımı + bulut senkron panelleri — SiteManager gibi v-main
         DIŞINDA (AppDrawer v-app layout'una kaydolur). -->
    <TeamDialog v-model="teamsOpen" />
    <SyncDrawer v-model="cloudSyncOpen" />
  </div>
</template>

<style scoped>
/* Kök sarmalayıcı layout'a şeffaf — app-bar/main doğrudan v-app'in (App.vue) çocuğu gibi davranır. */
.ferro-root {
  display: contents;
}
/* ── Kurumsal başlık ── */
.brand {
  padding-inline: 16px 8px;
}
/* Sözcük markası: sıkı, büyük harfli, hafif aralıklı — kurumsal kimlik. */
.brand-name {
  font-weight: 650;
  font-size: 0.95rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
/* Başlık butonları: M3 standart ikon butonu (dairesel), 40px hedef alan,
   aralarında ince nefes payı. */
.app-bar :deep(.v-btn--icon) {
  width: 40px;
  height: 40px;
  margin-inline: 2px;
}
.app-bar :deep(.v-toolbar__content) {
  padding-inline-end: 12px;
}
/* v-main, uygulama çubuğunun yüksekliği kadar padding ile içeriği aşağı iter.
   Yüksekliği görünüm alanına sabitleyince (border-box) içerik kutusu
   tam olarak "ekran − app-bar" kadar olur; böylece sayfa hiç kaydırılmaz. */
.main-area {
  height: 100vh;
  overflow: hidden;
}
/* M3: tonal kaplar arasında nefes payı — sınır yerine boşluk + kap rengi ayrıştırır. */
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
}
/* Üst satır: sol panel (sekmeli) + sağ sütun (uzak + log). */
.main-row {
  display: flex;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
}
/* swapPanes: kenar çubuğu sağa geçer. */
.main-row--swap {
  flex-direction: row-reverse;
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
/* Sol karta gömülü yerel panel: kart içinde kart görünmesin — köşeler düz,
   kap rengini dıştaki kart verir (renkler zaten aynı, tek parça okunur). */
.local-pane {
  border-radius: 0 !important;
}
/* Sekme içeriği kalan alanı doldurur; içindeki panel fill-height ile yayılır. */
.left-tab-pane {
  flex: 1 1 auto;
  min-height: 0;
}
.drawer-list {
  overflow-y: auto;
  /* v-list kendi surface zeminini basmasın — kartın M3 kap rengi görünsün. */
  background: transparent;
}
/* İkon ile metin arası boşluğu daralt. Vuetify 4'te bu boşluk --v-list-prepend-gap
   değişkeninden gelir (varsayılan 32px); değişkeni ezmek spacer genişliğini belirler. */
.drawer-list.v-list {
  --v-list-prepend-gap: 8px;
}
/* Sol girinti/boşluğu daralt: üst seviye küçük, grup içi öğeler daha az girinti. */
.drawer-list :deep(.v-list-item) {
  padding-inline-start: 0px !important;
}
.drawer-list :deep(.v-list-group__items .v-list-item) {
  padding-inline-start: 0px !important;
}
/* Sağ sütun: uzak sunucu üstte (esner), log altta (sabit). */
.right-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
/* ── Bağlantı sekmeleri + uzak panel: tek M3 kabı ──
   Sekme şeridi, uzak panel kartının başlığıdır: aynı kap rengi
   (surface-container-low), üstte 12px köşe; içerikten ince bir ayırıcıyla
   ayrılır. Alt kart köşeleri düzleştirilir — ikisi tek parça okunur.
   Şerit SABİT yükseklikte ve oturum yokken de (varsayılan sekmeyle) render
   edilir; ilk bağlantıda yerleşim oynamaz. */
.remote-group {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.conn-tabs {
  flex: 0 0 auto;
  height: 45px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  background: rgb(var(--v-theme-surface-container-low));
  border-radius: 12px 12px 0 0;
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.conn-tabs :deep(.v-tab.v-btn) {
  min-width: 0;
}
/* Kartın üst köşeleri şeride ait — m3-surface'ın 12px'ini alt köşelere indir. */
.remote-pane {
  border-radius: 0 0 12px 12px !important;
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
