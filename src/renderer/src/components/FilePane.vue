<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { VVirtualScroll } from 'vuetify/components'
import type { EntryType } from '@shared/transfer'
import { formatSize, formatDate, entryIcon, formatPermissions } from '@renderer/lib/format'
import { dirRank, compareNames } from '@renderer/lib/fsEntries'
import { useUiStore } from '@renderer/stores/ui'

const { t, locale } = useI18n()
const ui = useUiStore()

/** Sanal listede satır yüksekliği (px) — CSS .grid-row ile eşleşmeli. */
const ROW_HEIGHT = 32

interface PaneEntry {
  name: string
  type: EntryType
  size: number
  modifiedAt: number | null
  permissions?: number | null
  /** Sahip kullanıcı (uzak; adapter sağlarsa). */
  owner?: string | null
  /** Sahip grup (uzak; adapter sağlarsa). */
  group?: string | null
}

interface DragPayload {
  side: 'local' | 'remote'
  name: string
  type: EntryType
  path?: string
}

const props = defineProps<{
  title: string
  icon: string
  cwd: string
  side: 'local' | 'remote'
  entries: PaneEntry[]
  loading: boolean
  error: string | null
  disabled?: boolean
  /** Bağlantı kuruluyor: iskelet + durum çubuğunda "Bağlanıyor…" gösterilir. */
  connecting?: boolean
  transferIcon: string
  transferTooltip: string
  supportsChmod?: boolean
  supportsEdit?: boolean
}>()

const emit = defineEmits<{
  open: [entry: PaneEntry]
  up: []
  refresh: []
  /** Breadcrumb tıklaması: mutlak dizine git. */
  navigate: [path: string]
  transfer: [entry: PaneEntry]
  mkdir: [name: string]
  rename: [payload: { entry: PaneEntry; newName: string }]
  remove: [entry: PaneEntry]
  chmod: [payload: { entry: PaneEntry; mode: number }]
  edit: [entry: PaneEntry]
  dropEntry: [payload: DragPayload]
}>()

const DRAG_MIME = 'application/x-ferro'
const dragOver = ref(false)

function onDragStart(e: DragEvent, entry: PaneEntry): void {
  const payload: DragPayload = {
    side: props.side,
    name: entry.name,
    type: entry.type,
    path: (entry as { path?: string }).path
  }
  e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(payload))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  const raw = e.dataTransfer?.getData(DRAG_MIME)
  if (!raw) return
  const payload = JSON.parse(raw) as DragPayload
  // Yalnızca karşı panelden gelen bırakmaları işle.
  if (payload.side === props.side) return
  emit('dropEntry', payload)
}

function onDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes(DRAG_MIME)) {
    e.preventDefault()
    dragOver.value = true
  }
}

// İzinler ve Sahip/Grup sütunları yalnızca uzak panelde gösterilir (FileZilla gibi).
const showRemoteCols = computed(() => props.side === 'remote')
const gridColsClass = computed(() => (showRemoteCols.value ? 'cols-remote' : 'cols-local'))

// ── Yol kırıntıları (breadcrumbs): cwd → tıklanabilir mutlak dizin adımları ──
const crumbs = computed(() => {
  const items: { title: string; path: string }[] = [{ title: '/', path: '/' }]
  let acc = ''
  for (const part of (props.cwd || '').split('/').filter(Boolean)) {
    acc += '/' + part
    items.push({ title: part, path: acc })
  }
  return items
})

function goCrumb(i: number): void {
  if (props.disabled || i === crumbs.value.length - 1) return
  emit('navigate', crumbs.value[i].path)
}

// ── Sütunlar: sıralama + dosya türü (FileZilla benzeri) ──
type SortKey = 'name' | 'size' | 'type' | 'modified'
const sortKey = ref<SortKey>('name')
const sortAsc = ref(true)
function toggleSort(key: SortKey): void {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = true
  }
}

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none'
  return sortAsc.value ? 'ascending' : 'descending'
}

/** Girdinin "Dosya türü" sütunu metni. */
function fileType(entry: PaneEntry): string {
  if (entry.type === 'directory') return t('panes.typeFolder')
  if (entry.type === 'symlink') return t('panes.typeSymlink')
  const dot = entry.name.lastIndexOf('.')
  if (dot > 0 && dot < entry.name.length - 1) {
    return t('panes.fileTypeExt', { ext: entry.name.slice(dot + 1).toUpperCase() })
  }
  return t('panes.typeFile')
}

// Gruplama + ad karşılaştırması Ayarlar → Dosya listeleri tercihlerine göre;
// seçili sütun ikinci anahtar olarak uygulanır. Sıralama panele özgü.
const sortedEntries = computed(() => {
  const fl = ui.prefs.fileLists
  const dir = sortAsc.value ? 1 : -1
  return [...props.entries].sort((a, b) => {
    const g = dirRank(a.type, fl.sortMode) - dirRank(b.type, fl.sortMode)
    if (g !== 0) return g
    let r: number
    switch (sortKey.value) {
      case 'size':
        r = a.size - b.size
        break
      case 'modified':
        r = (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0)
        break
      case 'type':
        r = fileType(a).localeCompare(fileType(b))
        break
      default:
        r = compareNames(a.name, b.name, fl.nameSort)
    }
    return r * dir
  })
})

/** Boş satır için sütun sayısı. Uzak: +İzinler +Sahip/Grup. */
const colCount = computed(() => (showRemoteCols.value ? 7 : 5))

// ── Klavye gezinme + seçim (roving focus, listbox deseni) ──
const scroller = ref<InstanceType<typeof VVirtualScroll> | null>(null)
const focusedIndex = ref(-1)

function rowId(index: number): string {
  return `pane-${props.side}-row-${index}`
}

function focusRow(index: number): void {
  focusedIndex.value = index
}

function moveFocus(delta: number): void {
  const max = sortedEntries.value.length - 1
  if (max < 0) return
  const next = Math.min(
    max,
    Math.max(0, (focusedIndex.value < 0 ? -1 : focusedIndex.value) + delta)
  )
  focusedIndex.value = next
  scroller.value?.scrollToIndex(next)
}

/** Çift tık / Enter davranışı — Ayarlar → Dosya listeleri tercihlerine göre. */
function activate(entry: PaneEntry): void {
  const fl = ui.prefs.fileLists
  if (entry.type === 'directory') {
    if (fl.dblClickDir === 'open') emit('open', entry)
    return
  }
  switch (fl.dblClickFile) {
    case 'transfer':
      if (!props.disabled) emit('transfer', entry)
      break
    case 'view-edit':
      if (props.supportsEdit) emit('edit', entry)
      else emit('open', entry)
      break
    default:
      break
  }
}

function menuAtFocusedRow(): void {
  const entry = sortedEntries.value[focusedIndex.value]
  if (!entry) return
  const el = document.getElementById(rowId(focusedIndex.value))
  const rect = el?.getBoundingClientRect()
  menuEntry.value = entry
  menuTarget.value = rect ? [rect.left + 40, rect.top + rect.height] : [0, 0]
  menuOpen.value = true
}

function onKeydown(e: KeyboardEvent): void {
  const entries = sortedEntries.value
  if (props.disabled) return
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      moveFocus(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveFocus(-1)
      break
    case 'Home':
      e.preventDefault()
      focusedIndex.value = entries.length ? 0 : -1
      scroller.value?.scrollToIndex(0)
      break
    case 'End':
      e.preventDefault()
      focusedIndex.value = entries.length - 1
      scroller.value?.scrollToIndex(entries.length - 1)
      break
    case 'Enter': {
      const entry = entries[focusedIndex.value]
      if (entry) activate(entry)
      break
    }
    case 'Backspace':
      e.preventDefault()
      emit('up')
      break
    case 'Delete': {
      const entry = entries[focusedIndex.value]
      if (entry) {
        menuEntry.value = entry
        startDelete()
      }
      break
    }
    case 'ContextMenu':
      e.preventDefault()
      menuAtFocusedRow()
      break
    case 'F10':
      if (e.shiftKey) {
        e.preventDefault()
        menuAtFocusedRow()
      }
      break
  }
}

// Liste değişince odak dizinini geçerli aralığa sabitle.
watch(sortedEntries, (list) => {
  if (focusedIndex.value >= list.length) focusedIndex.value = list.length - 1
})

// ── Boş durum (v-empty-state, M3): bağlı değilken ile boş klasörken ayrı
// ikon/başlık — kullanıcı nedenini tek bakışta ayırt eder. ──
const emptyIcon = computed(() =>
  props.disabled ? 'mdi-lan-disconnect' : 'mdi-folder-open-outline'
)
const emptyTitle = computed(() =>
  props.disabled ? t('panes.noConnectionTitle') : t('panes.emptyTitle')
)
const emptyText = computed(() => (props.disabled ? t('panes.noConnection') : t('common.empty')))

/** Alt durum çubuğu metni: uzak bağlı değilse "bağlantı yok", aksi halde özet. */
const statusText = computed(() => {
  if (props.connecting) return t('panes.connecting')
  if (props.disabled) return t('panes.notConnected')
  const fileEntries = props.entries.filter((e) => e.type !== 'directory')
  const folders = props.entries.length - fileEntries.length
  const bytes = fileEntries.reduce((s, e) => s + e.size, 0)
  return t('panes.summary', {
    files: fileEntries.length,
    folders,
    bytes: new Intl.NumberFormat(locale.value).format(bytes)
  })
})

// ── Sağ tık menüsü ──
const menuOpen = ref(false)
const menuTarget = ref<[number, number]>([0, 0])
const menuEntry = ref<PaneEntry | null>(null)

function openMenu(e: MouseEvent, entry: PaneEntry, index: number): void {
  if (props.disabled) return
  e.preventDefault()
  focusedIndex.value = index
  menuEntry.value = entry
  menuTarget.value = [e.clientX, e.clientY]
  menuOpen.value = true
}

// ── Diyaloglar ──
const dialog = reactive<{
  type: 'mkdir' | 'rename' | 'chmod' | 'delete' | null
  value: string
  entry: PaneEntry | null
}>({ type: null, value: '', entry: null })

function startMkdir(): void {
  dialog.type = 'mkdir'
  dialog.value = ''
  dialog.entry = null
}
function startRename(): void {
  if (!menuEntry.value) return
  dialog.type = 'rename'
  dialog.value = menuEntry.value.name
  dialog.entry = menuEntry.value
}
function startChmod(): void {
  if (!menuEntry.value) return
  dialog.type = 'chmod'
  dialog.value = (menuEntry.value.permissions ?? 0o644).toString(8).padStart(3, '0')
  dialog.entry = menuEntry.value
}
function startDelete(): void {
  if (!menuEntry.value) return
  dialog.type = 'delete'
  dialog.entry = menuEntry.value
}

const dialogValid = computed(() => {
  if (dialog.type === 'mkdir' || dialog.type === 'rename') return dialog.value.trim().length > 0
  if (dialog.type === 'chmod') return /^[0-7]{3,4}$/.test(dialog.value.trim())
  return true
})

function confirmDialog(): void {
  const v = dialog.value.trim()
  switch (dialog.type) {
    case 'mkdir':
      emit('mkdir', v)
      break
    case 'rename':
      if (dialog.entry) emit('rename', { entry: dialog.entry, newName: v })
      break
    case 'chmod':
      if (dialog.entry) emit('chmod', { entry: dialog.entry, mode: parseInt(v, 8) })
      break
    case 'delete':
      if (dialog.entry) emit('remove', dialog.entry)
      break
  }
  dialog.type = null
}

const dialogTitle = computed(() => {
  switch (dialog.type) {
    case 'mkdir':
      return t('common.newFolder')
    case 'rename':
      return t('common.rename')
    case 'chmod':
      return t('panes.chmodTitle')
    case 'delete':
      return t('common.delete')
    default:
      return ''
  }
})
</script>

<template>
  <v-card class="d-flex flex-column fill-height m3-surface" variant="flat">
    <v-toolbar density="compact" color="transparent">
      <v-icon :icon="icon" class="ml-3" />
      <v-toolbar-title class="text-body-large">{{ title }}</v-toolbar-title>
      <v-spacer />
      <!-- Bağlamsal defaults: bu toolbar'ın butonları küçük. Global VBtn'i ezmeden
           yalnızca bu alt-ağaç için size='small' verilir (defaults-provider). -->
      <v-defaults-provider :defaults="{ VBtn: { size: 'small' } }">
        <v-btn
          icon="$folderAdd"
          :title="$t('common.newFolder')"
          :aria-label="$t('common.newFolder')"
          :disabled="disabled"
          @click="startMkdir()"
        />
        <v-btn
          icon="$navUp"
          :title="$t('panes.goUp')"
          :aria-label="$t('panes.goUp')"
          :disabled="disabled"
          @click="emit('up')"
        />
        <v-btn
          icon="$refresh"
          :title="$t('common.refresh')"
          :aria-label="$t('common.refresh')"
          :disabled="disabled"
          @click="emit('refresh')"
        />
      </v-defaults-provider>
    </v-toolbar>

    <!-- Bulunulan dizin: tıklanabilir breadcrumbs — her adım o dizine götürür. -->
    <v-breadcrumbs
      density="compact"
      bg-color="surface-variant"
      class="path-bar text-body-small"
      :title="cwd"
    >
      <template v-for="(c, i) in crumbs" :key="c.path">
        <v-breadcrumbs-item
          :disabled="disabled"
          :class="{ 'crumb-link': !disabled && i < crumbs.length - 1 }"
          :active="i === crumbs.length - 1"
          @click="goCrumb(i)"
        >
          <v-icon v-if="i === 0" icon="mdi-folder-home-outline" size="small" />
          <template v-else>{{ c.title }}</template>
        </v-breadcrumbs-item>
        <v-breadcrumbs-divider v-if="i < crumbs.length - 1" />
      </template>
    </v-breadcrumbs>

    <v-divider />

    <div v-if="error" class="pane-error px-3 d-flex align-center text-error text-body-small">
      <v-icon icon="mdi-alert-circle" size="small" class="mr-2 flex-shrink-0" />
      <span class="text-truncate" :title="error">{{ error }}</span>
    </div>

    <div
      class="table-scroll flex-grow-1"
      :class="{ 'drop-active': dragOver }"
      @dragover="onDragOver"
      @dragleave="dragOver = false"
      @drop="onDrop"
    >
      <div class="hscroll">
        <!-- Başlık satırı: sıralanabilir sütunlar gerçek buton (klavye erişilebilir). -->
        <div class="grid-head" :class="gridColsClass" role="row">
          <button
            class="head-cell col-sort"
            :aria-sort="ariaSort('name')"
            :aria-label="$t('panes.sortColumn', { column: $t('panes.colName') })"
            @click="toggleSort('name')"
          >
            {{ $t('panes.colName') }}
            <v-icon
              v-if="sortKey === 'name'"
              :icon="sortAsc ? 'mdi-menu-up' : 'mdi-menu-down'"
              size="x-small"
            />
          </button>
          <button
            class="head-cell col-sort text-right justify-end"
            :aria-sort="ariaSort('size')"
            :aria-label="$t('panes.sortColumn', { column: $t('panes.colSize') })"
            @click="toggleSort('size')"
          >
            {{ $t('panes.colSize') }}
            <v-icon
              v-if="sortKey === 'size'"
              :icon="sortAsc ? 'mdi-menu-up' : 'mdi-menu-down'"
              size="x-small"
            />
          </button>
          <button
            class="head-cell col-sort"
            :aria-sort="ariaSort('type')"
            :aria-label="$t('panes.sortColumn', { column: $t('panes.colType') })"
            @click="toggleSort('type')"
          >
            {{ $t('panes.colType') }}
            <v-icon
              v-if="sortKey === 'type'"
              :icon="sortAsc ? 'mdi-menu-up' : 'mdi-menu-down'"
              size="x-small"
            />
          </button>
          <button
            class="head-cell col-sort"
            :aria-sort="ariaSort('modified')"
            :aria-label="$t('panes.sortColumn', { column: $t('panes.colModified') })"
            @click="toggleSort('modified')"
          >
            {{ $t('panes.colModified') }}
            <v-icon
              v-if="sortKey === 'modified'"
              :icon="sortAsc ? 'mdi-menu-up' : 'mdi-menu-down'"
              size="x-small"
            />
          </button>
          <div v-if="showRemoteCols" class="head-cell">{{ $t('common.permissions') }}</div>
          <div v-if="showRemoteCols" class="head-cell">{{ $t('panes.colOwner') }}</div>
          <div class="head-cell"></div>
        </div>

        <!-- Yükleme: iskelet (skeleton) satırları. -->
        <template v-if="loading">
          <div v-for="n in 9" :key="'skeleton-' + n" class="grid-row" :class="gridColsClass">
            <div v-for="c in colCount" :key="c" class="cell">
              <v-skeleton-loader type="text" class="skeleton-cell" />
            </div>
          </div>
        </template>

        <v-empty-state
          v-else-if="!entries.length"
          class="empty-row"
          :icon="emptyIcon"
          :title="emptyTitle"
          :text="emptyText"
          size="48"
        />

        <!-- Sanal liste: binlerce girdide yalnızca görünen satırlar DOM'da. -->
        <v-virtual-scroll
          v-else
          ref="scroller"
          :items="sortedEntries"
          :item-height="ROW_HEIGHT"
          class="rows-scroll"
          role="listbox"
          :aria-label="$t('panes.fileList')"
          tabindex="0"
          :aria-activedescendant="focusedIndex >= 0 ? rowId(focusedIndex) : undefined"
          @keydown="onKeydown"
        >
          <template #default="{ item: entry, index }">
            <div
              :id="rowId(index)"
              class="grid-row row-entry"
              :class="[gridColsClass, { 'row-focused': index === focusedIndex }]"
              role="option"
              :aria-selected="index === focusedIndex"
              :draggable="true"
              @click="focusRow(index)"
              @dblclick="activate(entry)"
              @contextmenu="openMenu($event, entry, index)"
              @dragstart="onDragStart($event, entry)"
            >
              <div class="cell">
                <v-icon :icon="entryIcon(entry.type)" size="small" class="mr-2" />
                {{ entry.name }}
              </div>
              <div class="cell text-right justify-end">
                {{ entry.type === 'directory' ? '' : formatSize(entry.size, ui.prefs.fileSize) }}
              </div>
              <div class="cell text-body-small">{{ fileType(entry) }}</div>
              <div class="cell text-body-small">
                {{ formatDate(entry.modifiedAt, ui.prefs.dateTime) }}
              </div>
              <div v-if="showRemoteCols" class="cell text-body-small font-monospace">
                {{ formatPermissions(entry.permissions ?? null) }}
              </div>
              <div v-if="showRemoteCols" class="cell text-body-small">
                {{ entry.owner ? entry.owner + '/' + (entry.group ?? '') : '' }}
              </div>
              <div class="cell cell-actions">
                <!-- tabindex=-1: listbox option içinde odaklanabilir öğe ARIA'ya
                     aykırıdır; aktarım klavyeden Enter (tercihe göre) veya
                     bağlam menüsüyle yapılır. -->
                <v-btn
                  :icon="transferIcon"
                  size="x-small"
                  variant="text"
                  tabindex="-1"
                  :title="
                    entry.type === 'directory'
                      ? transferTooltip + $t('panes.folderSuffix')
                      : transferTooltip
                  "
                  :aria-label="
                    entry.type === 'directory'
                      ? transferTooltip + $t('panes.folderSuffix')
                      : transferTooltip
                  "
                  @click.stop="emit('transfer', entry)"
                />
              </div>
            </div>
          </template>
        </v-virtual-scroll>
      </div>
    </div>

    <!-- Alt durum çubuğu: yerelde özet (dosya/klasör/boyut), uzakta bağlantı durumu. -->
    <v-divider />
    <div class="status-bar px-3 text-body-small text-medium-emphasis">
      {{ statusText }}
    </div>

    <!-- Sağ tık menüsü -->
    <v-menu v-model="menuOpen" :target="menuTarget">
      <v-list density="compact" min-width="180">
        <v-list-item
          v-if="menuEntry"
          :prepend-icon="transferIcon"
          :title="transferTooltip"
          @click="menuEntry && emit('transfer', menuEntry)"
        />
        <v-list-item
          v-if="supportsEdit && menuEntry && menuEntry.type !== 'directory'"
          prepend-icon="mdi-pencil"
          :title="$t('panes.edit')"
          @click="menuEntry && emit('edit', menuEntry)"
        />
        <v-list-item
          prepend-icon="mdi-rename-box"
          :title="$t('common.rename')"
          @click="startRename()"
        />
        <v-list-item
          v-if="supportsChmod"
          prepend-icon="mdi-shield-key-outline"
          :title="$t('panes.chmod')"
          @click="startChmod()"
        />
        <v-divider />
        <v-list-item
          prepend-icon="$remove"
          :title="$t('common.delete')"
          base-color="error"
          @click="startDelete()"
        />
      </v-list>
    </v-menu>

    <!-- İşlem diyaloğu -->
    <v-dialog
      :model-value="dialog.type !== null"
      max-width="420"
      @update:model-value="dialog.type = null"
    >
      <v-card :title="dialogTitle">
        <v-card-text>
          <template v-if="dialog.type === 'delete'">
            {{ $t('panes.deleteConfirm', { name: dialog.entry?.name }) }}
          </template>
          <v-text-field
            v-else
            v-model="dialog.value"
            autofocus
            :label="dialog.type === 'chmod' ? '755' : $t('common.name')"
            @keyup.enter="dialogValid && confirmDialog()"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog.type = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            :color="dialog.type === 'delete' ? 'error' : 'primary'"
            :disabled="!dialogValid"
            @click="confirmDialog()"
          >
            {{ dialog.type === 'delete' ? $t('common.delete') : $t('common.ok') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.table-scroll {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* Yatay taşma tek sarmalayıcıda: başlık ve satırlar birlikte kayar. */
.hscroll {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-x: auto;
}
/* Sanal liste dikey kaydırmayı kendi içinde yapar. */
.rows-scroll {
  flex: 1 1 auto;
  min-height: 0;
}
.rows-scroll:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

/* Izgara sütunları — .grid-head ve .grid-row aynı şablonu paylaşır. */
.grid-head,
.grid-row {
  display: grid;
  align-items: center;
  min-width: 640px;
}
.cols-local {
  grid-template-columns: minmax(200px, 1fr) 90px 130px 140px 48px;
}
.cols-remote {
  grid-template-columns: minmax(200px, 1fr) 90px 130px 140px 100px 120px 48px;
}

.grid-head {
  flex: 0 0 auto;
  height: 32px;
  font-size: 0.75rem;
  font-weight: 500;
  background: rgb(var(--v-theme-surface-container-low));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
/* Sıralama başlıkları gerçek buton: tarayıcı varsayılanları sıfırlanır. */
.head-cell {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  font-weight: 500;
  text-align: left;
}
button.head-cell.col-sort {
  cursor: pointer;
  user-select: none;
}
button.head-cell.col-sort:hover {
  color: rgb(var(--v-theme-primary));
}
button.head-cell.col-sort:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.grid-row {
  height: 32px;
  border-bottom: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.6));
  cursor: default;
  user-select: none;
}
.grid-row.row-entry:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.grid-row.row-focused {
  background: rgba(var(--v-theme-primary), 0.1);
}
.row-entry[draggable='true'] {
  cursor: grab;
}
.cell {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}
/* Ad hücresinde uzun adlar üç nokta ile kesilir (flex çocukları için gerekli). */
.cell > * {
  min-width: 0;
}
.cell-actions {
  padding: 0 4px;
  justify-content: center;
}
.empty-row {
  min-width: 640px;
}

.drop-active {
  outline: 2px dashed rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
/* Breadcrumbs çubuğu: tek satır, SIKI sabit yükseklik (Vuetify'ın ul
   padding'i ezilir); uzun yol yatay kayar. */
.path-bar {
  flex: 0 0 auto;
  height: 28px;
  min-height: 28px;
  font-size: 0.6875rem; /* text-body-small'dan bir tık küçük */
  margin-top: 2px;
  margin-bottom: 0px;
  padding: 0px 10px !important;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* ince çubuk bile yüksekliği bozuyor */
}
/* Yatay kaydırma çubuğu yer kaplamasın (WebView). */
.path-bar::-webkit-scrollbar {
  display: none;
}
/* Kırıntı satır yüksekliğini metne indir — ul/li varsayılan boşlukları sıfır. */
.path-bar :deep(li) {
  line-height: 22px;
  margin: 0;
}
/* Adımlar ve slaş ayraçları arası boşluğu daralt. */
.path-bar :deep(.v-breadcrumbs-item) {
  padding: 0;
}
.path-bar :deep(.v-breadcrumbs-divider) {
  padding-inline: 2px;
}
/* Ara adımlar tıklanabilir: imleç + hover'da primary vurgu. */
.crumb-link {
  cursor: pointer;
}
.crumb-link:hover {
  color: rgb(var(--v-theme-primary));
}
/* Hata çubuğu: ince, tek satır — paneli şişirmeyen zarif bir uyarı. */
.pane-error {
  flex: 0 0 auto;
  min-height: 28px;
  background: rgba(var(--v-theme-error), 0.08);
  border-bottom: 1px solid rgba(var(--v-theme-error), 0.25);
}
.font-monospace {
  font-family: monospace;
}
.status-bar {
  flex: 0 0 auto;
  height: 22px;
  line-height: 22px;
  font-size: 0.6875rem; /* text-body-small'dan bir tık küçük */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* İskelet satırları: hücre içinde tek satırlık "kemik", saydam zemin. */
.skeleton-cell {
  background: transparent;
  width: 100%;
}
.skeleton-cell :deep(.v-skeleton-loader__text) {
  margin: 0;
  height: 12px;
  border-radius: 4px;
}
</style>
