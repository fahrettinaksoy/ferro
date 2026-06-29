import { registerHandler } from '../router'
import { sessionManager } from '../../transfer/SessionManager'
import { editManager } from '../../transfer/EditManager'

export function registerFsHandlers(): void {
  registerHandler('fs:list', async ({ sessionId, path }) => {
    return sessionManager.require(sessionId).list(path)
  })

  registerHandler('fs:pwd', async ({ sessionId }) => {
    return { cwd: await sessionManager.require(sessionId).pwd() }
  })

  registerHandler('fs:cwd', async ({ sessionId, path }) => {
    const client = sessionManager.require(sessionId)
    await client.cwd(path)
    return { cwd: await client.pwd() }
  })

  registerHandler('fs:mkdir', async ({ sessionId, path }) => {
    await sessionManager.require(sessionId).mkdir(path)
    return { ok: true as const }
  })

  registerHandler('fs:delete', async ({ sessionId, path }) => {
    await sessionManager.require(sessionId).delete(path)
    return { ok: true as const }
  })

  registerHandler('fs:rmdir', async ({ sessionId, path }) => {
    await sessionManager.require(sessionId).rmdir(path)
    return { ok: true as const }
  })

  registerHandler('fs:rename', async ({ sessionId, from, to }) => {
    await sessionManager.require(sessionId).rename(from, to)
    return { ok: true as const }
  })

  registerHandler('fs:chmod', async ({ sessionId, path, mode }) => {
    await sessionManager.require(sessionId).chmod(path, mode)
    return { ok: true as const }
  })

  registerHandler(
    'transfer:enqueue',
    async ({ sessionId, direction, remotePath, localPath, name, isDirectory }) => {
      const jobId = sessionManager.enqueueTransfer(
        sessionId,
        direction,
        remotePath,
        localPath,
        name,
        isDirectory
      )
      return { jobId }
    }
  )

  registerHandler('transfer:cancel', async ({ jobId }) => {
    sessionManager.cancelTransfer(jobId)
    return { ok: true as const }
  })

  registerHandler('sync:compare', async ({ sessionId, localPath, remotePath }) => {
    const entries = await sessionManager.compareDirs(sessionId, localPath, remotePath)
    return { entries }
  })

  registerHandler('edit:open', async ({ sessionId, remotePath, name }, ctx) => {
    await editManager.open(sessionId, remotePath, name, ctx.sender)
    return { ok: true as const }
  })
}
