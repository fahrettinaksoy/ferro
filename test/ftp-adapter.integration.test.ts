import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Readable, Writable } from 'stream'
import { FtpAdapter } from '../src/main/transfer/adapters/FtpAdapter'
import type { ConnectionConfig } from '../src/shared/transfer'

// Bu test çalışmadan önce: docker compose -f test/docker-compose.yml up -d
const config: ConnectionConfig = {
  protocol: 'ftp',
  host: 'localhost',
  port: 21,
  user: 'ferro',
  password: 'ferropass',
  rejectUnauthorized: false
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

describe('FtpAdapter (gerçek vsftpd konteynerine karşı)', () => {
  const client = new FtpAdapter(config)

  beforeAll(async () => {
    await client.connect()
  })

  afterAll(async () => {
    await client.disconnect()
  })

  it('bağlanır ve çalışma dizinini döndürür', async () => {
    expect(client.connected).toBe(true)
    const pwd = await client.pwd()
    expect(pwd).toContain('/ftp/ferro')
  })

  it('dosya yükler, listeler, indirir ve siler (round-trip)', async () => {
    const name = 'ferro-test.txt'
    const content = 'Ferro FTP testi · çğşüöı\n'

    // upload
    let uploaded = 0
    await client.upload(Readable.from(Buffer.from(content)), name, {
      onProgress: (p) => (uploaded = p.bytes)
    })
    expect(uploaded).toBeGreaterThan(0)

    // list → girdi görünmeli
    const entries = await client.list()
    const entry = entries.find((e) => e.name === name)
    expect(entry).toBeDefined()
    expect(entry?.type).toBe('file')
    expect(entry?.size).toBe(Buffer.byteLength(content))

    // download → içerik aynı olmalı
    const { stream, done } = collect()
    await client.download(name, stream)
    const got = await done
    expect(got.toString('utf8')).toBe(content)

    // delete → artık listede olmamalı
    await client.delete(name)
    const after = await client.list()
    expect(after.find((e) => e.name === name)).toBeUndefined()
  })

  it('klasör oluşturur ve siler', async () => {
    const dir = 'ferro-test-dir'
    await client.mkdir(dir)
    const list = await client.list()
    const found = list.find((e) => e.name === dir)
    expect(found?.type).toBe('directory')
    await client.rmdir(dir)
    const after = await client.list()
    expect(after.find((e) => e.name === dir)).toBeUndefined()
  })
})
