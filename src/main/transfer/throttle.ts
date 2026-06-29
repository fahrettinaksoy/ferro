import { Transform, type TransformCallback } from 'stream'

// Global bant genişliği sınırı (bayt/sn). 0 = sınırsız.
let limitBps = 0

export function setBandwidthLimit(bytesPerSec: number): void {
  limitBps = Math.max(0, Math.floor(bytesPerSec))
}

export function getBandwidthLimit(): number {
  return limitBps
}

/** Sınır aktifse veriyi hedef hıza pace eden bir Transform döndürür; değilse null. */
export function maybeThrottle(now: () => number = () => Date.now()): Transform | null {
  if (limitBps <= 0) return null
  return new ThrottleStream(limitBps, now)
}

class ThrottleStream extends Transform {
  private sent = 0
  private start: number

  constructor(
    private readonly bytesPerSec: number,
    private readonly now: () => number
  ) {
    super()
    this.start = now()
  }

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    this.sent += chunk.length
    const elapsedSec = (this.now() - this.start) / 1000
    const allowed = this.bytesPerSec * elapsedSec
    if (this.sent > allowed) {
      const delayMs = ((this.sent - allowed) / this.bytesPerSec) * 1000
      setTimeout(() => cb(null, chunk), delayMs)
    } else {
      cb(null, chunk)
    }
  }
}
