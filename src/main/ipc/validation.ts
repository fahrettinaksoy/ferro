import { z } from 'zod'
import { isAbsolute } from 'path'
import type { InvokeChannel } from '@shared/ipc'
import { FerroError } from '@shared/errors'

// ── IPC yük doğrulama ──────────────────────────────────────────────────────
// Router sınırında her kanalın yükü şemayla doğrulanır; renderer'dan gelen
// hiçbir değere doğrulanmadan güvenilmez. Şemalar bilinmeyen alanları da
// süzer (zod varsayılanı strip) — handler'lara yalnızca beklenen şekil ulaşır.

const sessionId = z.string().min(1).max(64)
const requestId = z.string().min(1).max(64)
const jobId = z.string().min(1).max(64)
const teamId = z.string().min(1).max(64)
const teamRole = z.enum(['admin', 'member', 'readonly'])
const teamProvider = z.enum(['gist', 'webdav'])

/** Uzak yol: null bayt içeremez. */
const remotePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => !p.includes('\0'), 'yol null bayt içeremez')

/** Yerel yol: mutlak olmalı, null bayt içeremez. */
const localPath = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => !p.includes('\0'), 'yol null bayt içeremez')
  .refine((p) => isAbsolute(p), 'yerel yol mutlak olmalı')

/** Dosya/dizin adı: yol ayırıcı ve null bayt içeremez. */
const entryName = z
  .string()
  .min(1)
  .max(255)
  .refine((n) => !/[/\\\0]/.test(n), 'ad yol ayırıcı içeremez')

const protocol = z.enum(['ftp', 'ftps', 'ftps-implicit', 'sftp'])

const connectionConfig = z.object({
  protocol,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  user: z.string().max(255),
  password: z.string().max(1024).optional(),
  privateKey: z.string().max(1_000_000).optional(),
  passphrase: z.string().max(1024).optional(),
  anonymous: z.boolean().optional(),
  encoding: z.string().max(40).optional(),
  rejectUnauthorized: z.boolean().optional(),
  maxConnections: z.number().int().min(1).max(10).optional()
})

const siteAdvancedFields = {
  comment: z.string().max(2000).optional(),
  colorLabel: z.string().max(32).optional(),
  serverType: z.string().max(32).optional(),
  bypassProxy: z.boolean().optional(),
  localDir: z.string().max(4096).optional(),
  remoteDir: z.string().max(4096).optional(),
  syncBrowsing: z.boolean().optional(),
  dirComparison: z.boolean().optional(),
  timezoneHours: z.number().int().min(-14).max(14).optional(),
  timezoneMinutes: z.number().int().min(-59).max(59).optional(),
  transferMode: z.enum(['default', 'active', 'passive']).optional(),
  limitConnections: z.boolean().optional(),
  maxConnections: z.number().int().min(1).max(10).optional()
}

const siteInput = z.object({
  id: z.string().max(64).optional(),
  name: z.string().min(1).max(200),
  folder: z.string().max(200).optional(),
  protocol,
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  user: z.string().max(255),
  password: z.string().max(1024).optional(),
  anonymous: z.boolean().optional(),
  askPassword: z.boolean().optional(),
  encoding: z.string().max(40).optional(),
  rejectUnauthorized: z.boolean().optional(),
  ...siteAdvancedFields
})

/** Dışa aktarma dosyasındaki tek kayıt: siteInput'un id'siz hâli. */
const siteExportEntry = siteInput.omit({ id: true })

/**
 * sites:import ile diskten okunan dosyanın şeması. Ferro zarfı
 * ({kind:'sites', version:1, sites:[...]}) ya da çıplak kayıt dizisi kabul
 * edilir; bilinmeyen alanlar süzülür. Dosya İÇERİĞİ de renderer yükü gibi
 * güvensiz girdidir — aynı sınırlarla doğrulanır.
 */
export const sitesImportFile = z.union([
  z.object({
    kind: z.literal('sites'),
    version: z.literal(1),
    sites: z.array(siteExportEntry).max(5000)
  }),
  z.array(siteExportEntry).max(5000)
])

/** Ayarlar anlık görüntüsü (sync): yalnızca ferro.* anahtarlı string değerler. */
const settingsSnapshot = z
  .record(
    z
      .string()
      .max(64)
      .refine((k) => k.startsWith('ferro.'), 'yalnızca ferro.* anahtarları'),
    z.string().max(200_000)
  )
  .refine((o) => Object.keys(o).length <= 100, 'en fazla 100 anahtar')

/** Kanal başına yük şeması. InvokeMap ile birebir aynı kümeyi kapsamalıdır. */
const schemas: Record<InvokeChannel, z.ZodType> = {
  'app:ping': z.void(),
  'app:info': z.void(),
  'dialog:pickDirectory': z.object({ defaultPath: localPath.optional() }),

  'connection:connect': connectionConfig,
  'connection:disconnect': z.object({ sessionId }),

  'fs:list': z.object({ sessionId, path: remotePath.optional() }),
  'fs:pwd': z.object({ sessionId }),
  'fs:cwd': z.object({ sessionId, path: remotePath }),
  'fs:mkdir': z.object({ sessionId, path: remotePath }),
  'fs:delete': z.object({ sessionId, path: remotePath }),
  'fs:rmdir': z.object({ sessionId, path: remotePath }),
  'fs:rename': z.object({ sessionId, from: remotePath, to: remotePath }),
  'fs:chmod': z.object({
    sessionId,
    path: remotePath,
    mode: z.number().int().min(0).max(0o7777)
  }),

  'transfer:enqueue': z.object({
    sessionId,
    direction: z.enum(['download', 'upload']),
    remotePath,
    localPath,
    name: entryName,
    isDirectory: z.boolean().optional()
  }),
  'transfer:cancel': z.object({ jobId }),
  'transfer:setPaused': z.object({ paused: z.boolean() }),
  'sync:compare': z.object({ sessionId, localPath, remotePath }),

  'local:home': z.void(),
  'local:list': z.object({ path: localPath }),
  'local:mkdir': z.object({ path: localPath }),
  'local:delete': z.object({ path: localPath }),
  'local:rename': z.object({ from: localPath, to: localPath }),

  'hostkey:decision': z.object({ requestId, accept: z.boolean() }),
  'tls:decision': z.object({ requestId, accept: z.boolean() }),

  'settings:apply': z.object({
    bandwidthBytesPerSec: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    maxConnections: z.number().int().min(1).max(10),
    connectTimeoutMs: z.number().int().min(0).max(600_000),
    keepAlive: z.boolean(),
    retryMaxAttempts: z.number().int().min(1).max(10),
    retryDelayMs: z.number().int().min(0).max(600_000),
    fileExistsDownload: z.enum([
      'ask',
      'overwrite',
      'overwrite-newer',
      'overwrite-size',
      'resume',
      'rename',
      'skip'
    ]),
    fileExistsUpload: z.enum([
      'ask',
      'overwrite',
      'overwrite-newer',
      'overwrite-size',
      'resume',
      'rename',
      'skip'
    ]),
    transferType: z.object({
      mode: z.enum(['auto', 'ascii', 'binary']),
      asciiExtensions: z.array(z.string().max(20)).max(500),
      noExtAsAscii: z.boolean(),
      dotfilesAsAscii: z.boolean()
    }),
    editor: z.object({
      mode: z.enum(['none', 'system', 'custom']),
      customPath: z.string().max(4096)
    }),
    proxy: z.object({
      type: z.enum(['none', 'http', 'socks4', 'socks5']),
      host: z.string().max(255),
      port: z.number().int().min(0).max(65535),
      user: z.string().max(255).optional(),
      password: z.string().max(1024).optional()
    }),
    logging: z.object({
      toFile: z.boolean(),
      maxSizeMiB: z.number().int().min(1).max(1024)
    }),
    updates: z.object({
      frequency: z.enum(['daily', 'weekly', 'never']),
      channel: z.enum(['stable', 'beta', 'nightly'])
    })
  }),
  'settings:pickEditor': z.void(),
  'vault:status': z.void(),
  'vault:setMaster': z.object({
    current: z.string().max(1024).optional(),
    next: z.string().min(1).max(1024)
  }),
  'vault:unlock': z.object({ password: z.string().min(1).max(1024) }),
  'vault:useOsKeychain': z.object({ current: z.string().min(1).max(1024) }),

  'app:setPanelState': z.object({
    servers: z.boolean(),
    log: z.boolean(),
    queue: z.boolean()
  }),
  'app:setConnState': z.object({
    hasActive: z.boolean(),
    connecting: z.boolean(),
    connected: z.boolean(),
    anyConnected: z.boolean(),
    paused: z.boolean()
  }),

  'edit:open': z.object({ sessionId, remotePath, name: entryName }),

  'sites:list': z.void(),
  'sites:save': siteInput,
  'sites:delete': z.object({ id: z.string().min(1).max(64) }),
  'sites:renameGroup': z.object({
    from: z.string().min(1).max(200),
    to: z.string().min(1).max(200)
  }),
  'sites:connect': z.object({
    id: z.string().min(1).max(64),
    password: z.string().max(1024).optional()
  }),
  'sites:export': z.object({ includePasswords: z.boolean() }),
  'sites:import': z.void(),

  'sync:getConfig': z.void(),
  'sync:setConfig': z.object({
    provider: z.enum(['gist', 'webdav']),
    include: z.object({ sites: z.boolean(), settings: z.boolean() }),
    gist: z.object({
      gistId: z.string().max(64),
      token: z.string().max(255).optional()
    }),
    webdav: z.object({
      url: z
        .string()
        .max(2048)
        .refine((u) => u === '' || /^https?:\/\//.test(u), 'http(s) adresi olmalı'),
      user: z.string().max(255),
      password: z.string().max(1024).optional()
    }),
    syncPassword: z.string().max(1024).optional(),
    autoSync: z.boolean().optional(),
    autoPush: z.boolean().optional()
  }),
  'sync:push': z.object({ settings: settingsSnapshot.optional() }),
  'sync:pull': z.void(),
  'sync:peek': z.void(),

  // ── Ekip paylaşımı ──
  'team:list': z.void(),
  'team:create': z.object({
    name: z.string().min(1).max(200),
    memberName: z.string().min(1).max(200),
    provider: teamProvider,
    gist: z.object({ gistId: z.string().max(64), token: z.string().max(255) }),
    webdav: z.object({
      url: z
        .string()
        .max(2048)
        .refine((u) => u === '' || /^https?:\/\//.test(u), 'http(s) adresi olmalı'),
      user: z.string().max(255),
      password: z.string().max(1024)
    })
  }),
  'team:join': z.object({
    code: z.string().min(1).max(200_000),
    pin: z.string().min(1).max(1024),
    memberName: z.string().min(1).max(200)
  }),
  'team:leave': z.object({ teamId }),
  'team:pull': z.object({ teamId }),
  'team:push': z.object({
    teamId,
    siteIds: z.array(z.string().min(1).max(64)).max(5000)
  }),
  'team:invite': z.object({ teamId, role: teamRole, pin: z.string().min(4).max(1024) }),
  'team:members': z.object({ teamId }),
  'team:setRole': z.object({ teamId, memberId: z.string().min(1).max(64), role: teamRole }),
  'team:removeMember': z.object({ teamId, memberId: z.string().min(1).max(64) }),
  'team:importSites': z.object({ teamId })
}

/**
 * Kanal yükünü doğrular ve (bilinmeyen alanlardan arındırılmış) yükü döndürür.
 * Geçersiz yük VALIDATION hatası fırlatır; router bunu zarfa çevirir.
 */
export function validatePayload(channel: InvokeChannel, payload: unknown): unknown {
  const schema = schemas[channel]
  const result = schema.safeParse(payload)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(kök)'}: ${i.message}`)
      .join('; ')
    throw new FerroError('VALIDATION', `Geçersiz IPC yükü (${channel})`, detail)
  }
  return result.data
}

/** Kanal adı bilinen bir InvokeChannel mı? */
export function isKnownChannel(channel: string): channel is InvokeChannel {
  return Object.prototype.hasOwnProperty.call(schemas, channel)
}
