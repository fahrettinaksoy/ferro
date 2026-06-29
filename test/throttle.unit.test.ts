import { describe, it, expect, afterEach } from 'vitest'
import { Readable } from 'stream'
import {
  setBandwidthLimit,
  getBandwidthLimit,
  maybeThrottle
} from '../src/main/transfer/throttle'

afterEach(() => setBandwidthLimit(0))

describe('throttle', () => {
  it('0 sınır → throttle yok', () => {
    setBandwidthLimit(0)
    expect(getBandwidthLimit()).toBe(0)
    expect(maybeThrottle()).toBeNull()
  })

  it('pozitif sınır → Transform döner', () => {
    setBandwidthLimit(1024 * 100)
    const t = maybeThrottle()
    expect(t).not.toBeNull()
  })

  it('veriyi bozmadan geçirir', async () => {
    setBandwidthLimit(1024 * 1024 * 50) // yüksek limit → gecikme ~0
    const t = maybeThrottle()!
    const input = Buffer.from('ferro throttle testi · çğşüöı'.repeat(20))
    const chunks: Buffer[] = []
    Readable.from(input).pipe(t)
    await new Promise<void>((resolve) => {
      t.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
      t.on('end', resolve)
    })
    expect(Buffer.concat(chunks)).toEqual(input)
  })

  it('düşük limit aktarımı yavaşlatır (gecikme uygular)', async () => {
    setBandwidthLimit(10_000) // 10 KB/s
    const t = maybeThrottle()!
    const input = Buffer.alloc(5000, 1) // ~0.5 sn beklenir
    const start = Date.now()
    Readable.from(input).pipe(t)
    await new Promise<void>((resolve) => t.on('end', resolve).resume())
    expect(Date.now() - start).toBeGreaterThan(150)
  })
})
