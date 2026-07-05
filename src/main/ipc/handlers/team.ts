import { registerHandler } from '../router'
import { encryptionAvailable } from '../../store/vault'
import {
  createInvite,
  createTeam,
  importTeamSites,
  joinTeam,
  leaveTeam,
  listTeams,
  pullTeam,
  pushTeam,
  removeMember,
  setMemberRole,
  teamMembers
} from '../../team/engine'

export function registerTeamHandlers(): void {
  registerHandler('team:list', () => ({
    teams: listTeams(),
    encryptionAvailable: encryptionAvailable()
  }))

  registerHandler('team:create', async (input) => ({ team: await createTeam(input) }))

  registerHandler('team:join', async (input) => ({ team: await joinTeam(input) }))

  registerHandler('team:leave', ({ teamId }) => {
    leaveTeam(teamId)
    return { ok: true as const }
  })

  registerHandler('team:pull', ({ teamId }) => pullTeam(teamId))

  registerHandler('team:push', ({ teamId, siteIds }) => pushTeam(teamId, siteIds))

  registerHandler('team:invite', ({ teamId, role, pin }) => ({
    code: createInvite(teamId, role, pin)
  }))

  registerHandler('team:members', ({ teamId }) => ({ members: teamMembers(teamId) }))

  registerHandler('team:setRole', async ({ teamId, memberId, role }) => ({
    members: await setMemberRole(teamId, memberId, role)
  }))

  registerHandler('team:removeMember', async ({ teamId, memberId }) => ({
    members: await removeMember(teamId, memberId)
  }))

  registerHandler('team:importSites', ({ teamId }) => importTeamSites(teamId))
}
