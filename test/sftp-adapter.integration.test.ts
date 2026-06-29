import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Readable, Writable } from 'stream'
import { SftpAdapter } from '../src/main/transfer/adapters/SftpAdapter'
import type { ConnectionConfig } from '../src/shared/transfer'

// Bu test çalışmadan önce: docker compose -f test/docker-compose.yml up -d
// atmoz/sftp: kullanıcı ferro, yazılabilir dizin /upload
const config: ConnectionConfig = {
  protocol: 'sftp',
  host: 'localhost',
  port: 2222,
  user: 'ferro',
  password: 'ferropass'
}

function collect(): { stream: Writable; done: Promise<Buffer> } {
  const chunks: Buffer[] = []
  let resolveFn!: (b: Buffer) => void
  const done = new Promise<Buffer>((r) => (resolveFn = r))
  const stream = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(Buffer.from(chunk))
      cb()
    },
    final(cb): void {
      resolveFn(Buffer.concat(chunks))
      cb()
    }
  })
  return { stream, done }
}

describe('SftpAdapter (gerçek atmoz/sftp konteynerine karşı)', () => {
  const client = new SftpAdapter(config)

  beforeAll(async () => {
    await client.connect()
    await client.cwd('/upload')
  })

  afterAll(async () => {
    await client.disconnect()
  })

  it('bağlanır ve /upload dizinine geçer', async () => {
    expect(client.connected).toBe(true)
    expect(await client.pwd()).toBe('/upload')
  })

  it('dosya yükler, listeler, indirir ve siler (round-trip)', async () => {
    const name = 'ferro-sftp.txt'
    const content = 'Ferro SFTP testi · çğşüöı\n'

    let uploaded = 0
    await client.upload(Readable.from(Buffer.from(content)), name, {
      onProgress: (p) => (uploaded = p.bytes)
    })
    expect(uploaded).toBe(Buffer.byteLength(content))

    const entries = await client.list()
    const entry = entries.find((e) => e.name === name)
    expect(entry).toBeDefined()
    expect(entry?.type).toBe('file')
    expect(entry?.size).toBe(Buffer.byteLength(content))
    expect(entry?.permissions).not.toBeNull()

    const { stream, done } = collect()
    await client.download(name, stream, { onProgress: () => {} })
    expect((await done).toString('utf8')).toBe(content)

    await client.delete(name)
    expect((await client.list()).find((e) => e.name === name)).toBeUndefined()
  })

  it('klasör oluşturur, chmod uygular ve siler', async () => {
    const dir = 'ferro-sftp-dir'
    await client.mkdir(dir)
    const found = (await client.list()).find((e) => e.name === dir)
    expect(found?.type).toBe('directory')
    await client.chmod(dir, 0o700)
    await client.rmdir(dir)
    expect((await client.list()).find((e) => e.name === dir)).toBeUndefined()
  })
})

describe('SftpAdapter host key TOFU', () => {
  it('hostVerify callback SHA256 parmak izi alır ve kabul edince bağlanır', async () => {
    let seen: string | null = null
    const c = new SftpAdapter(config, async (fp) => {
      seen = fp
      return true
    })
    await c.connect()
    expect(c.connected).toBe(true)
    expect(seen).toMatch(/^SHA256:/)
    await c.disconnect()
  })

  it('hostVerify reddedince bağlantı başarısız olur', async () => {
    const c = new SftpAdapter(config, async () => false)
    await expect(c.connect()).rejects.toThrow()
    expect(c.connected).toBe(false)
  })
})
