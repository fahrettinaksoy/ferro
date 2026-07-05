import { defineStore } from 'pinia'
import { invoke } from '@renderer/lib/ipc'
import type {
  TeamCreateInput,
  TeamInviteInput,
  TeamJoinInput,
  TeamMember,
  TeamPublic,
  TeamRole
} from '@shared/team'

interface TeamsState {
  teams: TeamPublic[]
  encryptionAvailable: boolean
  loaded: boolean
  /** teamId → son çekilen roster (üye listesi UI'si için). */
  members: Record<string, TeamMember[]>
}

// ── Ekip Pinia deposu ───────────────────────────────────────────────────────
// İnce bir IPC sarmalayıcı: tüm iş main süreçte (team/engine) yapılır; burada
// yalnızca çağrı + yerel liste tazeleme vardır. Sırlar renderer'a hiç gelmez.

export const useTeamsStore = defineStore('teams', {
  state: (): TeamsState => ({
    teams: [],
    encryptionAvailable: true,
    loaded: false,
    members: {}
  }),
  actions: {
    async load(): Promise<void> {
      const res = await invoke('team:list', undefined)
      this.teams = res.teams
      this.encryptionAvailable = res.encryptionAvailable
      this.loaded = true
    },

    async create(input: TeamCreateInput): Promise<TeamPublic> {
      const { team } = await invoke('team:create', input)
      await this.load()
      return team
    },

    async join(input: TeamJoinInput): Promise<TeamPublic> {
      const { team } = await invoke('team:join', input)
      await this.load()
      return team
    },

    async leave(teamId: string): Promise<void> {
      await invoke('team:leave', { teamId })
      delete this.members[teamId]
      await this.load()
    },

    /** Kasayı çeker; roster/site önbelleğini tazeler. found=false → kasa yok. */
    async pull(teamId: string) {
      const res = await invoke('team:pull', { teamId })
      if (res.found) await this.refreshMembers(teamId)
      await this.load()
      return res
    },

    async push(teamId: string, siteIds: string[]): Promise<{ added: number; siteCount: number }> {
      const res = await invoke('team:push', { teamId, siteIds })
      await this.load()
      return res
    },

    async invite(input: TeamInviteInput): Promise<string> {
      const { code } = await invoke('team:invite', input)
      return code
    },

    async refreshMembers(teamId: string): Promise<TeamMember[]> {
      const { members } = await invoke('team:members', { teamId })
      this.members[teamId] = members
      return members
    },

    async setRole(teamId: string, memberId: string, role: TeamRole): Promise<void> {
      const { members } = await invoke('team:setRole', { teamId, memberId, role })
      this.members[teamId] = members
      await this.load()
    },

    async removeMember(teamId: string, memberId: string): Promise<void> {
      const { members } = await invoke('team:removeMember', { teamId, memberId })
      this.members[teamId] = members
      await this.load()
    },

    async importSites(
      teamId: string
    ): Promise<{ imported: number; skipped: number; total: number }> {
      return invoke('team:importSites', { teamId })
    }
  }
})
