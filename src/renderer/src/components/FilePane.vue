<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EntryType } from '@shared/transfer'
import { formatSize, formatDate, entryIcon, formatPermissions } from '@renderer/lib/format'

const { t, locale } = useI18n()

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
  transferIcon: string
  transferTooltip: string
  supportsChmod?: boolean
  supportsEdit?: boolean
}>()

const emit = defineEmits<{
  open: [entry: PaneEntry]
  up: []
  refresh: []
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

// Klasörler önce; ardından seçili sütuna göre. Sıralama panele özgü (yerel/uzak).
const sortedEntries = computed(() => {
  const dir = sortAsc.value ? 1 : -1
  return [...props.entries].sort((a, b) => {
    const ad = a.type === 'directory' ? 0 : 1
    const bd = b.type === 'directory' ? 0 : 1
    if (ad !== bd) return ad - bd
    let r = 0
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
        r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    }
    return r * dir
  })
})

/** Boş satır için sütun sayısı. Uzak: +İzinler +Sahip/Grup. */
const colCount = computed(() => (showRemoteCols.value ? 7 : 5))

/** Alt durum çubuğu metni: uzak bağlı değilse "bağlantı yok", aksi halde özet. */
const statusText = computed(() => {
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

function openMenu(e: MouseEvent, entry: PaneEntry): void {
  if (props.disabled) return
  e.preventDefault()
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
  <v-card class="d-flex flex-column fill-height" variant="flat" border>
    <v-toolbar density="compact" color="surface">
      <v-icon :icon="icon" class="ml-3" />
      <v-toolbar-title class="text-body-1">{{ title }}</v-toolbar-title>
      <v-spacer />
      <!-- Bağlamsal defaults: bu toolbar'ın butonları küçük. Global VBtn'i ezmeden
           yalnızca bu alt-ağaç için size='small' verilir (defaults-provider). -->
      <v-defaults-provider :defaults="{ VBtn: { size: 'small' } }">
        <v-btn
          icon="$folderAdd"
          :title="$t('common.newFolder')"
          :disabled="disabled"
          @click="startMkdir()"
        />
        <v-btn icon="$navUp" :disabled="disabled" @click="emit('up')" />
        <v-btn icon="$refresh" :disabled="disabled" @click="emit('refresh')" />
      </v-defaults-provider>
    </v-toolbar>

    <div class="px-3 text-caption text-medium-emphasis path-bar" :title="cwd">
      {{ cwd || '—' }}
    </div>

    <v-divider />

    <v-alert v-if="error" type="error" density="compact" variant="tonal" class="ma-2">
      {{ error }}
    </v-alert>

    <v-progress-linear v-if="loading" indeterminate color="primary" />

    <div
      class="table-scroll flex-grow-1"
      :class="{ 'drop-active': dragOver }"
      @dragover="onDragOver"
      @dragleave="dragOver = false"
      @drop="onDrop"
    >
      <v-table fixed-header hover>
        <thead>
          <tr>
            <th class="col-sort" @click="toggleSort('name')">
              {{ $t('panes.colName') }}
              <v-icon
                v-if="sortKey === 'name'"
                :icon="sortAsc ? 'mdi-menu-up' : 'mdi-menu-down'"
                size="x-small"
              />
            </th>
            <th class="col-sort text-right" style="width: 90px" @click="toggleSort('size')">
              {{ $t('panes.colSize') }}
              <v-icon
                v-if="sortKey === 'size'"
                :icon="sortAsc ? 'mdi-menu-up' : 'mdi-menu-down'"
                size="x-small"
              />
            </th>
            <th class="col-sort" style="width: 130px" @click="toggleSort('type')">
              {{ $t('panes.colType') }}
              <v-icon
                v-if="sortKey === 'type'"
                :icon="sortAsc ? 'mdi-menu-up' : 'mdi-menu-down'"
                size="x-small"
              />
            </th>
            <th class="col-sort" style="width: 140px" @click="toggleSort('modified')">
              {{ $t('panes.colModified') }}
              <v-icon
                v-if="sortKey === 'modified'"
                :icon="sortAsc ? 'mdi-menu-up' : 'mdi-menu-down'"
                size="x-small"
              />
            </th>
            <th v-if="showRemoteCols" style="width: 100px">{{ $t('common.permissions') }}</th>
            <th v-if="showRemoteCols" style="width: 120px">{{ $t('panes.colOwner') }}</th>
            <th style="width: 48px"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in sortedEntries"
            :key="entry.name"
            class="row-entry"
            :draggable="true"
            @dblclick="emit('open', entry)"
            @contextmenu="openMenu($event, entry)"
            @dragstart="onDragStart($event, entry)"
          >
            <td>
              <v-icon :icon="entryIcon(entry.type)" size="small" class="mr-2" />
              {{ entry.name }}
            </td>
            <td class="text-right">
              {{ entry.type === 'directory' ? '' : formatSize(entry.size) }}
            </td>
            <td class="text-caption">{{ fileType(entry) }}</td>
            <td class="text-caption">{{ formatDate(entry.modifiedAt) }}</td>
            <td v-if="showRemoteCols" class="text-caption font-monospace">
              {{ formatPermissions(entry.permissions ?? null) }}
            </td>
            <td v-if="showRemoteCols" class="text-caption">
              {{ entry.owner ? entry.owner + '/' + (entry.group ?? '') : '' }}
            </td>
            <td>
              <v-btn
                :icon="transferIcon"
                size="x-small"
                variant="text"
                :title="
                  entry.type === 'directory' ? transferTooltip + ' (klasör)' : transferTooltip
                "
                @click.stop="emit('transfer', entry)"
              />
            </td>
          </tr>
          <tr v-if="!entries.length && !loading">
            <td :colspan="colCount" class="text-center text-medium-emphasis py-4">
              {{ disabled ? $t('panes.noConnection') : $t('common.empty') }}
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <!-- Alt durum çubuğu: yerelde özet (dosya/klasör/boyut), uzakta bağlantı durumu. -->
    <v-divider />
    <div class="status-bar px-3 text-caption text-medium-emphasis">
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
/* v-table parent'ı doldursun; kaydırma kendi __wrapper'ında olsun ki
   fixed-header (sticky thead) çalışsın. */
.table-scroll > :deep(.v-table) {
  flex: 1 1 auto;
  min-height: 0;
}
.drop-active {
  outline: 2px dashed rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
.row-entry[draggable='true'] {
  cursor: grab;
}
.path-bar {
  flex: 0 0 auto;
  height: 28px;
  line-height: 28px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.font-monospace {
  font-family: monospace;
}
.row-entry {
  cursor: default;
  user-select: none;
}
.col-sort {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.status-bar {
  flex: 0 0 auto;
  height: 24px;
  line-height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
