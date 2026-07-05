import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { readJsonVersioned, writeJsonVersioned } from './jsonStore'
import { encryptSecret, decryptSecret } from './vault'
import type { TeamMember, TeamProviderKind, TeamPublic, TeamRole } from '@shared/team'
import type { SiteExportEntry } from '@shared/transfer'
import { createLogger } from '../core/logger'

const log = createLogger('teams')

// ── Yerel ekip deposu (teams.json) ──────────────────────────────────────────
// Her ekip için: kimlik + benim rolüm/kimliğim + depo erişim bilgisi + EKİP
// ANAHTARI. Sırlar (depo jetonu/parolası, ekip anahtarı) vault formatında
// şifreli saklanır — sites.json'daki site parolalarıyla aynı güvence. Renderer'a
// hiçbir sır dönmez; yalnızca "var/yok" bilgisi (toPublic).

interface StoredTeam {
  teamId: string
  name: string
  /** Bu cihazdaki kullanıcının ekipteki rolü (son pull'da roster'dan güncellenir). */
  role: TeamRole
  /** Bu cihazdaki kullanıcının roster'daki kimliği ve adı. */
  memberId: string
  memberName: string
  provider: TeamProviderKind
  gist: { gistId: string; tokenSecret?: string }
  webdav: { url: string; user: string; passwordSecret?: string }
  /** Ekip anahtarı (base64), vault ile şifreli. */
  teamKeySecret?: string
  /** Son çekilen roster (yerel önbellek — UI üye listesi için). */
  members?: TeamMember[]
  /** Son çekilen paylaşılan siteler (yerel önbellek — UI + Site Yöneticisine aktarım). */
  sites?: SiteExportEntry[]
  lastSyncAt?: string
  lastRevision?: number
}

const STORE_VERSION = 1

class TeamStore {
  private cache: StoredTeam[] | null = null

  private file(): string {
    return join(app.getPath('userData'), 'teams.json')
  }

  private load(): StoredTeam[] {
    if (this.cache) return this.cache
    this.cache = readJsonVersioned<StoredTeam[]>(this.file(), STORE_VERSION, () => [], {
      legacy: (parsed) => (Array.isArray(parsed) ? (parsed as StoredTeam[]) : null),
      onCorrupt: () => []
    })
    return this.cache
  }

  private save(): void {
    try {
      writeJsonVersioned(this.file(), STORE_VERSION, this.cache ?? [])
    } catch (err) {
      log.error('teams.json yazılamadı', String(err))
    }
  }

  private toPublic(t: StoredTeam): TeamPublic {
    const hasCredentials =
      t.provider === 'gist' ? !!t.gist.tokenSecret : !!t.webdav.url && !!t.webdav.passwordSecret
    return {
      teamId: t.teamId,
      name: t.name,
      role: t.role,
      memberName: t.memberName,
      provider: t.provider,
      hasCredentials,
      memberCount: t.members?.length ?? 0,
      siteCount: t.sites?.length ?? 0,
      lastSyncAt: t.lastSyncAt ?? null,
      lastRevision: t.lastRevision ?? null
    }
  }

  list(): TeamPublic[] {
    return this.load()
      .map((t) => this.toPublic(t))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  get(teamId: string): StoredTeam | undefined {
    return this.load().find((t) => t.teamId === teamId)
  }

  getPublic(teamId: string): TeamPublic | null {
    const t = this.get(teamId)
    return t ? this.toPublic(t) : null
  }

  /**
   * Yeni bir ekip kaydı ekler (oluşturma ya da katılma sonrası). Sırlar vault
   * ile şifrelenir; encryptSecret null dönerse (şifreleme yok) sır KAYDEDİLMEZ.
   * Aynı teamId zaten varsa üzerine yazar (yeniden katılma senaryosu).
   */
  add(input: {
    teamId: string
    name: string
    role: TeamRole
    memberId: string
    memberName: string
    provider: TeamProviderKind
    teamKey: string
    gist: { gistId: string; token: string }
    webdav: { url: string; user: string; password: string }
  }): void {
    const store = this.load()
    const record: StoredTeam = {
      teamId: input.teamId,
      name: input.name,
      role: input.role,
      memberId: input.memberId,
      memberName: input.memberName,
      provider: input.provider,
      gist: {
        gistId: input.gist.gistId.trim(),
        tokenSecret: input.gist.token ? (encryptSecret(input.gist.token) ?? undefined) : undefined
      },
      webdav: {
        url: input.webdav.url.trim(),
        user: input.webdav.user,
        passwordSecret: input.webdav.password
          ? (encryptSecret(input.webdav.password) ?? undefined)
          : undefined
      },
      teamKeySecret: input.teamKey ? (encryptSecret(input.teamKey) ?? undefined) : undefined
    }
    const idx = store.findIndex((t) => t.teamId === input.teamId)
    if (idx >= 0) store[idx] = record
    else store.push(record)
    this.save()
    log.info(`ekip kaydedildi: ${input.name} (${input.teamId})`)
  }

  /** Ekipten ayrıl — yerel kaydı siler (uzak kasa/roster değişmez; ayrı adım). */
  remove(teamId: string): void {
    this.cache = this.load().filter((t) => t.teamId !== teamId)
    this.save()
  }

  /** Pull/push sonrası yerel önbelleği günceller (roster + siteler + revizyon + rolüm). */
  markSynced(
    teamId: string,
    patch: { members: TeamMember[]; sites: SiteExportEntry[]; revision: number; myRole?: TeamRole }
  ): void {
    const t = this.get(teamId)
    if (!t) return
    t.members = patch.members
    t.sites = patch.sites
    t.lastRevision = patch.revision
    t.lastSyncAt = new Date().toISOString()
    if (patch.myRole) t.role = patch.myRole
    this.save()
  }

  /** Son çekilen paylaşılan siteler (Site Yöneticisine aktarım için). */
  cachedSites(teamId: string): SiteExportEntry[] {
    return this.get(teamId)?.sites ?? []
  }

  /** Son çekilen roster (UI üye listesi için). */
  cachedMembers(teamId: string): TeamMember[] {
    return this.get(teamId)?.members ?? []
  }

  // ── Motorun ihtiyaç duyduğu çözülmüş değerler (renderer'a asla dönmez) ──

  teamKey(teamId: string): string {
    const s = this.get(teamId)?.teamKeySecret
    return s ? decryptSecret(s) : ''
  }

  credentials(teamId: string): {
    provider: TeamProviderKind
    gist: { gistId: string; token: string }
    webdav: { url: string; user: string; password: string }
  } | null {
    const t = this.get(teamId)
    if (!t) return null
    return {
      provider: t.provider,
      gist: {
        gistId: t.gist.gistId,
        token: t.gist.tokenSecret ? decryptSecret(t.gist.tokenSecret) : ''
      },
      webdav: {
        url: t.webdav.url,
        user: t.webdav.user,
        password: t.webdav.passwordSecret ? decryptSecret(t.webdav.passwordSecret) : ''
      }
    }
  }

  /** Gist ilk push'ta oluşturulunca dönen kimliği kalıcılaştırır. */
  setGistId(teamId: string, gistId: string): void {
    const t = this.get(teamId)
    if (!t) return
    t.gist.gistId = gistId
    this.save()
  }

  /** Bir ekipteki benim kimliğim (roster'a self ekleme/çıkarma dışlaması için). */
  myMemberId(teamId: string): string {
    return this.get(teamId)?.memberId ?? ''
  }

  newMemberId(): string {
    return randomUUID()
  }
}

export const teamStore = new TeamStore()
