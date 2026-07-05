import { randomUUID } from 'crypto'
import { FerroError } from '@shared/errors'
import { TEAM_FILE_NAME } from '@shared/team'
import type {
  TeamCreateInput,
  TeamInvitePayload,
  TeamJoinInput,
  TeamMember,
  TeamPayload,
  TeamPublic,
  TeamRole
} from '@shared/team'
import type { SiteExportEntry } from '@shared/transfer'
import { GistProvider, WebdavProvider, type SyncProvider } from '../sync/providers'
import { teamStore } from '../store/teams'
import { siteStore } from '../store/sites'
import { sitesImportFile } from '../ipc/validation'
import {
  decodeInviteCode,
  decryptInvite,
  decryptTeamPayload,
  encodeInviteCode,
  encryptInvite,
  encryptTeamPayload,
  generateTeamKey
} from './crypto'
import { createLogger } from '../core/logger'

const log = createLogger('team')

// ── Ekip motoru ─────────────────────────────────────────────────────────────
// createTeam: yeni kasa oluşturur (yaratıcı admin), ilk push'u yapar.
// join:       davet kodu+PIN ile kasaya erişir, kendini roster'a ekler.
// pull:       kasayı indirir/çözer, yerel önbelleği (roster+siteler) günceller.
// push:       (readonly hariç) seçilen siteleri kasaya ekler, roster'ı korur.
// invite:     (admin) TK+depo erişimini taşıyan, PIN ile sarılı davet kodu üretir.
// setRole/removeMember: (admin) roster'ı düzenler.
//
// EŞZAMANLILIK: son-yazan-kazanır. Her yazma önce uzaktaki güncel kasayı çeker,
// roster'ı birleştirir ve siteleri EKLEMELİ (union) yazar; revizyon artırılır.
// Kriptografik rol zorlaması yoktur (bkz. shared/team.ts başlığı).

/** Bir kayıtlı ekip için TEAM_FILE_NAME'e bağlı sağlayıcı kurar. */
function providerFor(creds: {
  provider: 'gist' | 'webdav'
  gist: { gistId: string; token: string }
  webdav: { url: string; user: string; password: string }
}): SyncProvider {
  if (creds.provider === 'gist') {
    return new GistProvider(creds.gist.token, creds.gist.gistId, TEAM_FILE_NAME)
  }
  return new WebdavProvider(
    creds.webdav.url,
    creds.webdav.user,
    creds.webdav.password,
    TEAM_FILE_NAME
  )
}

/** Uzaktan inen kasa yükündeki siteleri, dosyadan içe aktarımla aynı zod
 *  sınırlarından geçirir. Uzak yük başka bir cihazın yazdığı güvensiz veridir. */
function validateRemoteSites(sites: unknown): SiteExportEntry[] {
  const parsed = sitesImportFile.safeParse(sites)
  if (!parsed.success) {
    throw new FerroError('VALIDATION', 'Ekip kasasındaki site kayıtları geçersiz')
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.sites
}

/** İki site kümesini (protokol+host+port+kullanıcı+ad) beşlisiyle birleştirir;
 *  var olan korunur, yeni gelen eklenir (ekleme temelli paylaşım). */
function unionSites(base: SiteExportEntry[], incoming: SiteExportEntry[]): SiteExportEntry[] {
  const key = (s: SiteExportEntry): string =>
    [s.protocol, s.host.toLowerCase(), s.port, s.user, s.name].join(' ')
  const seen = new Set(base.map(key))
  const out = [...base]
  for (const s of incoming) {
    const k = key(s)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

/** Roster'a bir üyeyi ekler/günceller (id eşleşirse rol+ad güncellenir). */
function upsertMember(members: TeamMember[], member: TeamMember): TeamMember[] {
  const idx = members.findIndex((m) => m.id === member.id)
  if (idx >= 0) {
    members[idx] = { ...members[idx], name: member.name, role: member.role }
    return members
  }
  return [...members, member]
}

/** Uzaktaki kasayı indirir/çözer. found=false → kasa henüz yok. */
async function fetchPayload(provider: SyncProvider, teamKey: string): Promise<TeamPayload | null> {
  const content = await provider.download()
  if (content === null) return null
  let blob
  try {
    blob = JSON.parse(content)
  } catch (err) {
    throw new FerroError('VALIDATION', 'Uzak ekip kasası geçerli JSON değil', String(err))
  }
  return decryptTeamPayload(blob, teamKey)
}

/** Yükü şifreleyip uzağa yazar; gist ilk oluşturmada dönen id kalıcılaştırılır. */
async function uploadPayload(
  provider: SyncProvider,
  teamKey: string,
  payload: TeamPayload,
  teamId: string
): Promise<void> {
  const blob = encryptTeamPayload(payload, teamKey)
  const result = await provider.upload(JSON.stringify(blob, null, 2))
  if (result?.gistId) teamStore.setGistId(teamId, result.gistId)
}

function requireTeam(teamId: string): void {
  if (!teamStore.get(teamId)) throw new FerroError('NOT_FOUND', 'Ekip bulunamadı')
}

function requireCreds(teamId: string): ReturnType<typeof teamStore.credentials> {
  const creds = teamStore.credentials(teamId)
  const teamKey = teamStore.teamKey(teamId)
  if (!creds || !teamKey) {
    throw new FerroError('VALIDATION', 'Ekip erişim bilgisi eksik (kasa açılamıyor)')
  }
  return creds
}

// ── Genel API ────────────────────────────────────────────────────────────────

export function listTeams(): TeamPublic[] {
  return teamStore.list()
}

/** Yeni ekip oluşturur: yaratıcı admin, kasa ilk kez push edilir. */
export async function createTeam(input: TeamCreateInput): Promise<TeamPublic> {
  const teamId = randomUUID()
  const teamKey = generateTeamKey()
  const memberId = teamStore.newMemberId()
  const now = new Date().toISOString()

  const creator: TeamMember = {
    id: memberId,
    name: input.memberName || 'admin',
    role: 'admin',
    addedAt: now
  }
  const payload: TeamPayload = {
    kind: 'ferro-team-payload',
    version: 1,
    teamId,
    name: input.name,
    updatedAt: now,
    revision: 1,
    members: [creator],
    sites: []
  }

  // Önce yerelde sakla (sağlayıcı kurulumu erişim bilgisini ister), sonra push.
  teamStore.add({
    teamId,
    name: input.name,
    role: 'admin',
    memberId,
    memberName: creator.name,
    provider: input.provider,
    teamKey,
    gist: input.gist,
    webdav: input.webdav
  })

  const creds = requireCreds(teamId)!
  const provider = providerFor(creds)
  await uploadPayload(provider, teamKey, payload, teamId)
  teamStore.markSynced(teamId, { members: payload.members, sites: payload.sites, revision: 1 })
  log.info(`ekip oluşturuldu: ${input.name} (${teamId})`)
  return teamStore.getPublic(teamId)!
}

/** Davet koduyla ekibe katılır: kasaya erişir, kendini roster'a ekler. */
export async function joinTeam(input: TeamJoinInput): Promise<TeamPublic> {
  const file = decodeInviteCode(input.code)
  let payload: TeamInvitePayload
  try {
    payload = decryptInvite(file, input.pin)
  } catch (err) {
    if (err instanceof FerroError) throw err
    throw new FerroError('AUTH_FAILED', 'Davet çözülemedi', String(err))
  }

  const memberId = teamStore.newMemberId()
  const now = new Date().toISOString()
  const creds = {
    provider: payload.provider,
    gist: payload.gist ?? { gistId: '', token: '' },
    webdav: payload.webdav ?? { url: '', user: '', password: '' }
  }
  const provider = providerFor(creds)

  // Kasayı çek: teamId/ad/roster/revizyonu öğren. Kasa yoksa davet bayattır.
  const remote = await fetchPayload(provider, payload.teamKey)
  if (!remote) {
    throw new FerroError('NOT_FOUND', 'Ekip kasası bulunamadı — davet artık geçerli olmayabilir')
  }
  if (remote.teamId !== file.teamId) {
    throw new FerroError('VALIDATION', 'Davet ile kasa kimliği uyuşmuyor')
  }

  // Yerelde sakla (davetteki rol ile).
  teamStore.add({
    teamId: remote.teamId,
    name: remote.name,
    role: file.role,
    memberId,
    memberName: input.memberName || 'üye',
    provider: creds.provider,
    teamKey: payload.teamKey,
    gist: creds.gist,
    webdav: creds.webdav
  })

  // Kendini roster'a ekle ve geri yaz (best-effort: yazamazsak yerelde kalırız).
  const me: TeamMember = {
    id: memberId,
    name: input.memberName || 'üye',
    role: file.role,
    addedAt: now,
    addedBy: 'invite'
  }
  const members = upsertMember([...remote.members], me)
  try {
    const next: TeamPayload = {
      ...remote,
      members,
      updatedAt: now,
      revision: remote.revision + 1
    }
    await uploadPayload(provider, payload.teamKey, next, remote.teamId)
    teamStore.markSynced(remote.teamId, {
      members,
      sites: remote.sites,
      revision: next.revision,
      myRole: file.role
    })
  } catch (err) {
    log.warn(`roster'a eklenemedi (yerelde kalındı): ${String(err)}`)
    teamStore.markSynced(remote.teamId, {
      members: remote.members,
      sites: remote.sites,
      revision: remote.revision,
      myRole: file.role
    })
  }
  log.info(`ekibe katılındı: ${remote.name} (${remote.teamId}) rol=${file.role}`)
  return teamStore.getPublic(remote.teamId)!
}

export interface TeamPullResult {
  found: boolean
  revision?: number
  memberCount?: number
  siteCount?: number
  role?: TeamRole
}

/** Kasayı çeker, yerel önbelleği (roster+siteler+revizyon+rolüm) günceller. */
export async function pullTeam(teamId: string): Promise<TeamPullResult> {
  requireTeam(teamId)
  const creds = requireCreds(teamId)!
  const teamKey = teamStore.teamKey(teamId)
  const provider = providerFor(creds)

  const remote = await fetchPayload(provider, teamKey)
  if (!remote) return { found: false }

  const sites = validateRemoteSites(remote.sites)
  // Roster'daki kendi rolüm değişmiş olabilir (admin beni terfi/tenzil etmiş).
  const myId = teamStore.myMemberId(teamId)
  const myRole = remote.members.find((m) => m.id === myId)?.role
  teamStore.markSynced(teamId, {
    members: remote.members,
    sites,
    revision: remote.revision,
    myRole
  })
  log.info(`ekip çekildi: ${remote.name} rev=${remote.revision}, ${sites.length} site`)
  return {
    found: true,
    revision: remote.revision,
    memberCount: remote.members.length,
    siteCount: sites.length,
    role: myRole
  }
}

export interface TeamPushResult {
  revision: number
  siteCount: number
  added: number
}

/**
 * Seçilen yerel siteleri kasaya EKLER (readonly hariç). Uzaktaki güncel kasayı
 * çekip roster'ı korur, siteleri union'lar, revizyonu artırır.
 */
export async function pushTeam(teamId: string, siteIds: string[]): Promise<TeamPushResult> {
  requireTeam(teamId)
  const team = teamStore.get(teamId)!
  if (team.role === 'readonly') {
    throw new FerroError('VALIDATION', 'Salt-okunur üye ekip kasasına yazamaz')
  }
  const creds = requireCreds(teamId)!
  const teamKey = teamStore.teamKey(teamId)
  const provider = providerFor(creds)

  // Paylaşılacak siteler: parolalar main'de çözülür, folder ekip adıyla gruplanır.
  const mine = siteStore.exportSitesByIds(siteIds, team.name)

  const now = new Date().toISOString()
  const remote = await fetchPayload(provider, teamKey)
  const base: TeamPayload = remote ?? {
    kind: 'ferro-team-payload',
    version: 1,
    teamId,
    name: team.name,
    updatedAt: now,
    revision: 0,
    members: team.members ?? [],
    sites: []
  }
  const beforeCount = base.sites.length
  const merged = unionSites(base.sites, mine)
  const next: TeamPayload = {
    ...base,
    name: team.name,
    updatedAt: now,
    revision: base.revision + 1,
    sites: merged
  }
  await uploadPayload(provider, teamKey, next, teamId)
  teamStore.markSynced(teamId, {
    members: next.members,
    sites: merged,
    revision: next.revision
  })
  log.info(`ekibe push: ${merged.length - beforeCount} yeni site, toplam ${merged.length}`)
  return { revision: next.revision, siteCount: merged.length, added: merged.length - beforeCount }
}

/** (Admin) Davet kodu üretir: TK + depo erişimini PIN ile sarıp taşınabilir kod döner. */
export function createInvite(teamId: string, role: TeamRole, pin: string): string {
  requireTeam(teamId)
  const team = teamStore.get(teamId)!
  if (team.role !== 'admin') {
    throw new FerroError('VALIDATION', 'Yalnızca admin davet oluşturabilir')
  }
  if (pin.length < 4) {
    throw new FerroError('VALIDATION', 'Davet PIN’i en az 4 karakter olmalı')
  }
  const creds = requireCreds(teamId)!
  const teamKey = teamStore.teamKey(teamId)
  const payload: TeamInvitePayload = {
    teamKey,
    provider: creds.provider,
    ...(creds.provider === 'gist' ? { gist: creds.gist } : { webdav: creds.webdav })
  }
  const file = encryptInvite(payload, pin, {
    teamId,
    teamName: team.name,
    role
  })
  log.info(`davet üretildi: ekip=${team.name} rol=${role}`)
  return encodeInviteCode(file)
}

/** Son çekilen roster (UI için — pull çağrısından gelir). */
export function teamMembers(teamId: string): TeamMember[] {
  requireTeam(teamId)
  return teamStore.cachedMembers(teamId)
}

/** (Admin) Bir üyenin rolünü değiştirir — kasayı çek, roster'ı güncelle, geri yaz. */
export async function setMemberRole(
  teamId: string,
  memberId: string,
  role: TeamRole
): Promise<TeamMember[]> {
  return mutateRoster(teamId, (members) => {
    const idx = members.findIndex((m) => m.id === memberId)
    if (idx < 0) throw new FerroError('NOT_FOUND', 'Üye bulunamadı')
    members[idx] = { ...members[idx], role }
    return members
  })
}

/** (Admin) Bir üyeyi roster'dan çıkarır. Kriptografik iptal DEĞİLDİR
 *  (bkz. shared/team.ts başlığı) — üye eski TK'yı hâlâ biliyorsa erişimi sürer. */
export async function removeMember(teamId: string, memberId: string): Promise<TeamMember[]> {
  const myId = teamStore.myMemberId(teamId)
  if (memberId === myId) {
    throw new FerroError('VALIDATION', 'Kendinizi çıkaramazsınız — ekipten ayrılmayı kullanın')
  }
  return mutateRoster(teamId, (members) => members.filter((m) => m.id !== memberId))
}

/** Ortak roster düzenleme: admin kontrolü + çek/güncelle/geri-yaz. */
async function mutateRoster(
  teamId: string,
  mutate: (members: TeamMember[]) => TeamMember[]
): Promise<TeamMember[]> {
  requireTeam(teamId)
  const team = teamStore.get(teamId)!
  if (team.role !== 'admin') {
    throw new FerroError('VALIDATION', 'Yalnızca admin üyeleri düzenleyebilir')
  }
  const creds = requireCreds(teamId)!
  const teamKey = teamStore.teamKey(teamId)
  const provider = providerFor(creds)

  const remote = await fetchPayload(provider, teamKey)
  if (!remote) throw new FerroError('NOT_FOUND', 'Ekip kasası bulunamadı')

  const members = mutate([...remote.members])
  const next: TeamPayload = {
    ...remote,
    members,
    updatedAt: new Date().toISOString(),
    revision: remote.revision + 1
  }
  await uploadPayload(provider, teamKey, next, teamId)
  teamStore.markSynced(teamId, { members, sites: remote.sites, revision: next.revision })
  return members
}

/**
 * Son çekilen ekip sitelerini yerel Site Yöneticisine aktarır (folder = ekip
 * adı). Yinelenenler atlanır (siteStore.importSites semantiği).
 */
export function importTeamSites(teamId: string): {
  imported: number
  skipped: number
  total: number
} {
  requireTeam(teamId)
  const team = teamStore.get(teamId)!
  const cached = teamStore.cachedSites(teamId)
  // folder'ı ekip adıyla değiştir: Site Yöneticisinde ekip grubu altında görünsün.
  const entries = cached.map((s) => ({ ...s, folder: team.name }))
  const { imported, skipped } = siteStore.importSites(entries)
  return { imported, skipped, total: entries.length }
}

/** Ekipten ayrıl — yalnızca yerel kaydı siler (uzak kasa/roster değişmez). */
export function leaveTeam(teamId: string): void {
  teamStore.remove(teamId)
}
