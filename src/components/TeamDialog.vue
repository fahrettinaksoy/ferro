<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore, errText } from '@renderer/stores/toast'
import { useTeamsStore } from '@renderer/stores/teams'
import { useSitesStore } from '@renderer/stores/sites'
import { useRules } from '@renderer/lib/rules'
import type { TeamPublic, TeamRole } from '@shared/team'
import AppDrawer from '@renderer/components/AppDrawer.vue'

// ── Ekip paylaşımı paneli (sağ navigation-drawer, master-detail) ────────────
// Site Yöneticisi deseni: solda ekip listesi + giriş noktaları, sağda seçili
// ekip detayı / oluşturma / katılma formu. Sunucusuz model: ekip = paylaşılan
// bir depodaki (Gist/WebDAV) uçtan uca şifreli kasa. Davet = TK + depo erişimini
// PIN ile sarıp taşıyan tek satırlık kod. Roller işbirlikçidir (UI düzeyinde).

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean] }>()

const { t } = useI18n()
const toast = useToastStore()
const teams = useTeamsStore()
const sites = useSitesStore()
const { required, minLength } = useRules()

// Sağ panel kipi: boş / oluştur / katıl / detay.
type Mode = 'empty' | 'create' | 'join' | 'detail'
const mode = ref<Mode>('empty')
const busy = ref(false)
const selectedId = ref<string | null>(null)

const selected = computed<TeamPublic | null>(
  () => teams.teams.find((x) => x.teamId === selectedId.value) ?? null
)
const selectedMembers = computed(() =>
  selectedId.value ? (teams.members[selectedId.value] ?? []) : []
)

// Rol → renk/etiket.
// Rol renkleri okunur (tonal chip metni = renk; surface-variant çok soluk kalır).
const ROLE_COLOR: Record<TeamRole, string> = {
  admin: 'primary',
  member: 'info',
  readonly: 'secondary'
}
function roleLabel(r: TeamRole): string {
  return t(`team.roles.${r}`)
}
const roleOptions = computed(() =>
  (['admin', 'member', 'readonly'] as TeamRole[]).map((r) => ({ value: r, title: roleLabel(r) }))
)

// ── Oluşturma formu ──
const createForm = reactive({
  name: '',
  memberName: '',
  provider: 'gist' as 'gist' | 'webdav',
  gistId: '',
  gistToken: '',
  webdavUrl: '',
  webdavUser: '',
  webdavPassword: ''
})
// Vuetify v-form `valid` durumu: yalnızca o an DOM'da olan alanları izler.
// Bu paneller mod başına tek bir tam formu render ettiğinden (create/join
// birbirini dışlar) SiteManager'daki sekme senaryosunun aksine burada
// `v-model` doğrudan Kaydet/Katıl butonunun kapısı olarak güvenle kullanılır.
const createFormValid = ref(false)

// ── Katılma formu ──
const joinForm = reactive({ code: '', pin: '', memberName: '' })
const joinFormValid = ref(false)

// ── Davet üretimi ──
const inviteForm = reactive({ role: 'member' as TeamRole, pin: '' })
const inviteFormValid = ref(false)
const inviteCode = ref('')

// ── Paylaşım (site seçici) + ayrılma onayı ──
const shareOpen = ref(false)
const shareSelection = ref<string[]>([])
const leaveConfirm = ref<TeamPublic | null>(null)

const drawerTitle = computed(() => t('team.title'))
const drawerSubtitle = computed(() => t('team.subtitle', { count: teams.teams.length }))

async function reload(): Promise<void> {
  busy.value = true
  try {
    await teams.load()
    if (!sites.loaded) await sites.load()
  } catch (err) {
    toast.error(errText(err))
  } finally {
    busy.value = false
  }
}

// Panel açılınca listeyi tazele + seçimi sıfırla.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      mode.value = 'empty'
      selectedId.value = null
      inviteCode.value = ''
      void reload()
    }
  }
)

function openCreate(): void {
  selectedId.value = null
  mode.value = 'create'
}
function openJoin(): void {
  selectedId.value = null
  mode.value = 'join'
}
function openDetail(team: TeamPublic): void {
  selectedId.value = team.teamId
  inviteCode.value = ''
  inviteForm.pin = ''
  mode.value = 'detail'
  if (!teams.members[team.teamId]) void teams.refreshMembers(team.teamId).catch(() => {})
}

async function run<T>(p: Promise<T>, ok?: string): Promise<T | undefined> {
  busy.value = true
  try {
    const r = await p
    if (ok) toast.success(ok)
    return r
  } catch (err) {
    toast.error(errText(err))
    return undefined
  } finally {
    busy.value = false
  }
}

// ── Eylemler ──
async function submitCreate(): Promise<void> {
  const team = await run(
    teams.create({
      name: createForm.name.trim(),
      memberName: createForm.memberName.trim(),
      provider: createForm.provider,
      gist: { gistId: createForm.gistId.trim(), token: createForm.gistToken.trim() },
      webdav: {
        url: createForm.webdavUrl.trim(),
        user: createForm.webdavUser.trim(),
        password: createForm.webdavPassword
      }
    }),
    t('team.created')
  )
  if (team) {
    Object.assign(createForm, {
      name: '',
      memberName: '',
      gistId: '',
      gistToken: '',
      webdavUrl: '',
      webdavUser: '',
      webdavPassword: ''
    })
    openDetail(team)
  }
}

async function submitJoin(): Promise<void> {
  const team = await run(
    teams.join({
      code: joinForm.code.trim(),
      pin: joinForm.pin,
      memberName: joinForm.memberName.trim()
    }),
    t('team.joined')
  )
  if (team) {
    joinForm.code = ''
    joinForm.pin = ''
    openDetail(team)
  }
}

async function doPull(): Promise<void> {
  if (!selected.value) return
  const res = await run(teams.pull(selected.value.teamId))
  if (res && !res.found) toast.info(t('team.remoteEmpty'))
  else if (res) toast.success(t('team.pulled', { sites: res.siteCount ?? 0 }))
}

function openShare(): void {
  shareSelection.value = []
  shareOpen.value = true
}
async function doShare(): Promise<void> {
  if (!selected.value) return
  const res = await run(teams.push(selected.value.teamId, shareSelection.value))
  if (res) {
    shareOpen.value = false
    toast.success(t('team.shared', { added: res.added }))
  }
}

async function doImport(): Promise<void> {
  if (!selected.value) return
  const res = await run(teams.importSites(selected.value.teamId))
  if (res) {
    await sites.load()
    toast.success(t('team.imported', { imported: res.imported, skipped: res.skipped }))
  }
}

async function doInvite(): Promise<void> {
  if (!selected.value) return
  const code = await run(
    teams.invite({ teamId: selected.value.teamId, role: inviteForm.role, pin: inviteForm.pin })
  )
  if (code) inviteCode.value = code
}

async function copyInvite(): Promise<void> {
  try {
    await navigator.clipboard.writeText(inviteCode.value)
    toast.success(t('team.copied'))
  } catch {
    toast.error(t('team.copyFailed'))
  }
}

async function changeRole(memberId: string, role: TeamRole): Promise<void> {
  if (!selected.value) return
  await run(teams.setRole(selected.value.teamId, memberId, role), t('team.roleChanged'))
}
async function kick(memberId: string): Promise<void> {
  if (!selected.value) return
  await run(teams.removeMember(selected.value.teamId, memberId), t('team.memberRemoved'))
}

async function confirmLeave(): Promise<void> {
  const team = leaveConfirm.value
  leaveConfirm.value = null
  if (!team) return
  await run(teams.leave(team.teamId), t('team.left'))
  if (selectedId.value === team.teamId) {
    selectedId.value = null
    mode.value = 'empty'
  }
}

const isAdmin = computed(() => selected.value?.role === 'admin')
const canWrite = computed(() => selected.value?.role !== 'readonly')

function lastSyncText(team: TeamPublic): string {
  if (!team.lastSyncAt) return t('team.neverSynced')
  return t('team.lastSync', { when: new Date(team.lastSyncAt).toLocaleString() })
}
</script>

<template>
  <AppDrawer
    :model-value="modelValue"
    :title="drawerTitle"
    :subtitle="drawerSubtitle"
    icon="mdi-account-group"
    :width="880"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- Gövde: solda ekip listesi + giriş noktaları, sağda detay/form. -->
    <div class="d-flex flex-column flex-grow-1" style="min-height: 0">
      <v-alert
        v-if="!teams.encryptionAvailable"
        type="warning"
        density="compact"
        variant="tonal"
        class="ma-2"
      >
        {{ $t('sites.encWarning') }}
      </v-alert>

      <div class="d-flex flex-grow-1" style="min-height: 0">
        <!-- ── Sol: ekip listesi (M3 tonal kap) ── -->
        <div class="team-list d-flex flex-column">
          <v-list density="compact" nav class="team-list-scroll flex-grow-1">
            <v-list-item
              prepend-icon="mdi-plus"
              :title="$t('team.create')"
              :active="mode === 'create'"
              @click="openCreate()"
            />
            <v-list-item
              prepend-icon="mdi-account-plus"
              :title="$t('team.join')"
              :active="mode === 'join'"
              @click="openJoin()"
            />
            <v-divider class="my-2" />

            <v-list-item
              v-for="tm in teams.teams"
              :key="tm.teamId"
              :active="selectedId === tm.teamId"
              @click="openDetail(tm)"
            >
              <template #prepend>
                <v-icon icon="mdi-account-group" />
              </template>
              <v-list-item-title>{{ tm.name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ $t('team.summary', { members: tm.memberCount, sites: tm.siteCount }) }}
              </v-list-item-subtitle>
              <template #append>
                <v-chip :color="ROLE_COLOR[tm.role]" size="x-small" variant="tonal">
                  {{ roleLabel(tm.role) }}
                </v-chip>
              </template>
            </v-list-item>

            <v-empty-state
              v-if="!teams.teams.length"
              icon="mdi-account-group-outline"
              :text="$t('team.noTeams')"
              size="40"
            />
          </v-list>

          <!-- Dip şerit: yenile. -->
          <div class="list-actions d-flex pa-1">
            <v-btn
              size="small"
              variant="text"
              prepend-icon="$refresh"
              class="flex-grow-1"
              :loading="busy"
              @click="reload()"
            >
              {{ $t('common.refresh') }}
            </v-btn>
          </div>
        </div>

        <!-- ── Sağ: detay / form (M3 tonal kap) ── -->
        <div class="team-panel flex-grow-1 d-flex flex-column">
          <!-- Boş durum -->
          <v-empty-state
            v-if="mode === 'empty'"
            class="flex-grow-1"
            icon="mdi-account-group-outline"
            size="64"
            :text="$t('team.intro')"
            :text-width="380"
          >
            <template #actions>
              <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate()">
                {{ $t('team.create') }}
              </v-btn>
              <v-btn variant="tonal" prepend-icon="mdi-account-plus" @click="openJoin()">
                {{ $t('team.join') }}
              </v-btn>
            </template>
          </v-empty-state>

          <!-- ── Ekip oluştur ── -->
          <template v-else-if="mode === 'create'">
            <v-toolbar density="compact" color="transparent" class="panel-toolbar">
              <v-toolbar-title class="text-body-large">
                <v-icon icon="mdi-plus" size="small" class="mr-2" />{{ $t('team.createTitle') }}
              </v-toolbar-title>
            </v-toolbar>
            <v-form v-model="createFormValid" class="panel-body flex-grow-1 pa-4">
              <p class="text-body-medium text-medium-emphasis mb-4">{{ $t('team.createHint') }}</p>
              <v-text-field
                v-model="createForm.name"
                :label="$t('team.name')"
                :rules="[required]"
                hide-details="auto"
                density="comfortable"
                class="mb-2"
              />
              <v-text-field
                v-model="createForm.memberName"
                :label="$t('team.yourName')"
                :hint="$t('team.yourNameHint')"
                :rules="[required]"
                hide-details="auto"
                persistent-hint
                density="comfortable"
                class="mb-3"
              />
              <v-radio-group v-model="createForm.provider" inline hide-details class="mb-2">
                <v-radio label="GitHub Gist" value="gist" />
                <v-radio label="WebDAV" value="webdav" />
              </v-radio-group>

              <template v-if="createForm.provider === 'gist'">
                <v-text-field
                  v-model="createForm.gistToken"
                  :label="$t('team.gistToken')"
                  type="password"
                  autocomplete="off"
                  :rules="[required]"
                  hide-details="auto"
                  density="comfortable"
                  class="mb-2"
                />
                <v-text-field
                  v-model="createForm.gistId"
                  :label="$t('team.gistId')"
                  :hint="$t('team.gistIdHint')"
                  persistent-hint
                  density="comfortable"
                />
              </template>
              <template v-else>
                <v-text-field
                  v-model="createForm.webdavUrl"
                  :label="$t('team.webdavUrl')"
                  placeholder="https://dav.ornek.com/ferro-ekip"
                  :rules="[required]"
                  hide-details="auto"
                  density="comfortable"
                  class="mb-2"
                />
                <div class="d-flex ga-2">
                  <v-text-field
                    v-model="createForm.webdavUser"
                    :label="$t('connect.user')"
                    density="comfortable"
                  />
                  <v-text-field
                    v-model="createForm.webdavPassword"
                    :label="$t('connect.password')"
                    type="password"
                    autocomplete="off"
                    :rules="[required]"
                    hide-details="auto"
                    density="comfortable"
                  />
                </div>
              </template>
            </v-form>
            <div class="panel-actions d-flex align-center pa-2">
              <v-spacer />
              <v-btn variant="text" @click="mode = 'empty'">{{ $t('common.cancel') }}</v-btn>
              <v-btn
                color="primary"
                variant="flat"
                class="ml-2"
                :disabled="!createFormValid"
                :loading="busy"
                @click="submitCreate()"
              >
                {{ $t('team.create') }}
              </v-btn>
            </div>
          </template>

          <!-- ── Ekibe katıl ── -->
          <template v-else-if="mode === 'join'">
            <v-toolbar density="compact" color="transparent" class="panel-toolbar">
              <v-toolbar-title class="text-body-large">
                <v-icon icon="mdi-account-plus" size="small" class="mr-2" />{{
                  $t('team.joinTitle')
                }}
              </v-toolbar-title>
            </v-toolbar>
            <v-form v-model="joinFormValid" class="panel-body flex-grow-1 pa-4">
              <p class="text-body-medium text-medium-emphasis mb-4">{{ $t('team.joinHint') }}</p>
              <v-textarea
                v-model="joinForm.code"
                :label="$t('team.inviteCode')"
                :rules="[required]"
                hide-details="auto"
                rows="3"
                auto-grow
                density="comfortable"
                class="mb-2"
              />
              <v-text-field
                v-model="joinForm.pin"
                :label="$t('team.invitePin')"
                type="password"
                autocomplete="off"
                :rules="[required]"
                hide-details="auto"
                density="comfortable"
                class="mb-2"
              />
              <v-text-field
                v-model="joinForm.memberName"
                :label="$t('team.yourName')"
                :rules="[required]"
                hide-details="auto"
                density="comfortable"
              />
            </v-form>
            <div class="panel-actions d-flex align-center pa-2">
              <v-spacer />
              <v-btn variant="text" @click="mode = 'empty'">{{ $t('common.cancel') }}</v-btn>
              <v-btn
                color="primary"
                variant="flat"
                class="ml-2"
                :disabled="!joinFormValid"
                :loading="busy"
                @click="submitJoin()"
              >
                {{ $t('team.join') }}
              </v-btn>
            </div>
          </template>

          <!-- ── Ekip detayı ── -->
          <template v-else-if="mode === 'detail' && selected">
            <v-toolbar density="compact" color="transparent" class="panel-toolbar">
              <v-toolbar-title class="text-body-large">
                <v-icon icon="mdi-account-group" size="small" class="mr-2" />{{ selected.name }}
              </v-toolbar-title>
              <v-chip :color="ROLE_COLOR[selected.role]" size="small" variant="tonal" class="mr-2">
                {{ roleLabel(selected.role) }}
              </v-chip>
            </v-toolbar>

            <div class="panel-body flex-grow-1 pa-4">
              <div class="text-body-small text-medium-emphasis mb-3">
                {{ lastSyncText(selected) }}
              </div>

              <v-alert
                v-if="!canWrite"
                type="warning"
                variant="tonal"
                density="compact"
                class="mb-4"
                :text="$t('team.readonlyNote')"
              />

              <!-- Üyeler -->
              <div class="text-label-large mb-1">
                {{ $t('team.members') }} ({{ selectedMembers.length }})
              </div>
              <v-list density="compact" class="mb-4 rounded team-sub">
                <v-list-item v-for="m in selectedMembers" :key="m.id">
                  <template #prepend>
                    <v-icon icon="mdi-account" size="small" class="mr-2" />
                  </template>
                  <v-list-item-title>{{ m.name }}</v-list-item-title>
                  <template #append>
                    <template v-if="isAdmin">
                      <v-select
                        :model-value="m.role"
                        :items="roleOptions"
                        density="compact"
                        variant="plain"
                        hide-details
                        style="width: 120px"
                        @update:model-value="(r) => changeRole(m.id, r as TeamRole)"
                      />
                      <v-btn
                        icon="mdi-account-remove"
                        size="x-small"
                        variant="text"
                        color="error"
                        :title="$t('team.removeMember')"
                        @click="kick(m.id)"
                      />
                    </template>
                    <v-chip v-else :color="ROLE_COLOR[m.role]" size="x-small" variant="tonal">
                      {{ roleLabel(m.role) }}
                    </v-chip>
                  </template>
                </v-list-item>
                <v-empty-state
                  v-if="!selectedMembers.length"
                  icon="mdi-account-off-outline"
                  :text="$t('team.noMembers')"
                  size="36"
                />
              </v-list>

              <!-- Davet (yalnızca admin) -->
              <template v-if="isAdmin">
                <div class="text-label-large mb-1">{{ $t('team.inviteTitle') }}</div>
                <p class="text-body-small text-medium-emphasis mb-2">{{ $t('team.inviteHint') }}</p>
                <v-form v-model="inviteFormValid" class="d-flex ga-2 align-start">
                  <v-select
                    v-model="inviteForm.role"
                    :items="roleOptions"
                    :label="$t('team.inviteRole')"
                    density="comfortable"
                    hide-details
                    style="max-width: 150px"
                  />
                  <v-text-field
                    v-model="inviteForm.pin"
                    :label="$t('team.invitePin')"
                    :hint="$t('team.invitePinHint')"
                    persistent-hint
                    :rules="[minLength(4)]"
                    hide-details="auto"
                    density="comfortable"
                  />
                  <v-btn
                    color="primary"
                    :disabled="!inviteFormValid"
                    :loading="busy"
                    class="mt-1"
                    @click="doInvite()"
                  >
                    {{ $t('team.generateInvite') }}
                  </v-btn>
                </v-form>

                <template v-if="inviteCode">
                  <v-textarea
                    :model-value="inviteCode"
                    readonly
                    rows="3"
                    auto-grow
                    density="comfortable"
                    class="mt-3"
                    :label="$t('team.inviteCode')"
                  />
                  <div class="d-flex align-center ga-2">
                    <v-btn
                      size="small"
                      variant="tonal"
                      prepend-icon="mdi-content-copy"
                      @click="copyInvite()"
                    >
                      {{ $t('team.copyCode') }}
                    </v-btn>
                    <span class="text-body-small text-warning">{{
                      $t('team.invitePinReminder')
                    }}</span>
                  </div>
                </template>
              </template>
            </div>

            <!-- Detay eylem şeridi -->
            <div class="panel-actions d-flex align-center pa-2 flex-wrap ga-1">
              <v-btn
                size="small"
                variant="text"
                color="error"
                prepend-icon="mdi-logout"
                @click="leaveConfirm = selected"
              >
                {{ $t('team.leave') }}
              </v-btn>
              <v-spacer />
              <v-btn
                size="small"
                variant="tonal"
                prepend-icon="mdi-cloud-download"
                :loading="busy"
                @click="doPull()"
              >
                {{ $t('team.pull') }}
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                prepend-icon="mdi-download"
                :disabled="!selected.siteCount"
                @click="doImport()"
              >
                {{ $t('team.importSites') }}
              </v-btn>
              <v-btn
                v-if="canWrite"
                size="small"
                color="primary"
                variant="flat"
                prepend-icon="mdi-cloud-upload"
                @click="openShare()"
              >
                {{ $t('team.share') }}
              </v-btn>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Paylaşım: yerel sitelerden seçim -->
    <v-dialog v-model="shareOpen" max-width="520" scrollable>
      <v-card :title="$t('team.shareTitle')">
        <v-card-text class="pa-0">
          <p class="text-body-small text-medium-emphasis px-4 pt-3 mb-1">
            {{ $t('team.shareHint') }}
          </p>
          <v-list v-if="sites.sites.length" density="compact" select-strategy="classic">
            <v-list-item
              v-for="s in sites.sites"
              :key="s.id"
              @click="
                shareSelection.includes(s.id)
                  ? (shareSelection = shareSelection.filter((x) => x !== s.id))
                  : shareSelection.push(s.id)
              "
            >
              <template #prepend>
                <v-checkbox-btn :model-value="shareSelection.includes(s.id)" />
              </template>
              <v-list-item-title>{{ s.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ s.host }}:{{ s.port }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
          <v-empty-state v-else icon="mdi-server-off" :text="$t('sites.noSites')" size="48" />
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <span class="text-body-small text-medium-emphasis ml-2">
            {{ $t('team.shareCount', { count: shareSelection.length }) }}
          </span>
          <v-spacer />
          <v-btn variant="text" @click="shareOpen = false">{{ $t('common.cancel') }}</v-btn>
          <v-btn
            color="primary"
            :disabled="!shareSelection.length"
            :loading="busy"
            @click="doShare()"
          >
            {{ $t('team.share') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Ayrılma onayı -->
    <v-dialog
      :model-value="!!leaveConfirm"
      max-width="440"
      @update:model-value="leaveConfirm = null"
    >
      <v-card :title="$t('team.leaveTitle')">
        <v-card-text class="text-body-medium">{{ $t('team.leaveConfirm') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="leaveConfirm = null">{{ $t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="tonal" @click="confirmLeave()">{{
            $t('team.leave')
          }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppDrawer>
</template>

<style scoped>
/* M3: sınır çizgisi yok — liste, panelden bir ton farklı kap ve köşe
   yumuşamasıyla ayrışır (Site Yöneticisi deseni). */
.team-list {
  width: 260px;
  flex: 0 0 260px;
  margin: 8px;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container));
  overflow: hidden;
}
.team-list-scroll {
  overflow-y: auto;
  min-height: 0;
}
.team-list :deep(.v-list) {
  background: transparent;
  --v-list-prepend-gap: 8px;
}
.team-list :deep(.v-list-item) {
  padding-inline-start: 8px !important;
}
.list-actions {
  flex: 0 0 auto;
  background: rgb(var(--v-theme-surface-container-high));
}
/* Sağ panel: liste gibi tonal M3 alt-kabı. */
.team-panel {
  margin: 8px 8px 8px 0;
  border-radius: 12px;
  background: rgb(var(--v-theme-surface-container));
  min-width: 0;
  overflow: hidden;
}
.panel-toolbar {
  flex: 0 0 auto;
}
.panel-body {
  overflow-y: auto;
  min-height: 0;
}
/* Eylem şeridi: panel dibinde bir ton daha koyu zemin (M3 katmanı). */
.panel-actions {
  flex: 0 0 auto;
  background: rgb(var(--v-theme-surface-container-high));
}
/* Üye listesi alt-kabı. */
.team-sub {
  background: rgb(var(--v-theme-surface-container-low));
}
</style>
