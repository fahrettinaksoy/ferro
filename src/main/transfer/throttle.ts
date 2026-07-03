import { Transform, type TransformCallback } from 'stream'

// Uygulama geneli bant genişliği sınırı (bayt/sn). 0 = sınırsız.
// Sınır tüm oturumlara ortak uygulanır (Ayarlar'daki anlamı budur); her transfer
// kendi ThrottleStream örneğini alır.
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

/** Kova en fazla bu kadar saniyelik "birikim" tutar — duraklama sonrası patlamayı sınırlar. */
const BURST_WINDOW_SEC = 0.25

/**
 * Token-bucket pacer. Eski uygulama "başlangıçtan beri ortalama" hesabı yaptığı
 * için uzun bir duraklamadan sonra biriken payı tek seferde boşaltıyordu (burst).
 * Kova modeli birikimi BURST_WINDOW_SEC ile sınırlar: anlık hız hedefin üzerine
 * kalıcı olarak çıkamaz.
 */
class ThrottleStream extends Transform {
  private tokens = 0
  private lastRefill: number
  private readonly capacity: number

  constructor(
    private readonly bytesPerSec: number,
    private readonly now: () => number
  ) {
    super()
    this.capacity = Math.max(16 * 1024, bytesPerSec * BURST_WINDOW_SEC)
    this.lastRefill = now()
  }

  private refill(): void {
    const t = this.now()
    const elapsedSec = (t - this.lastRefill) / 1000
    if (elapsedSec > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.bytesPerSec)
      this.lastRefill = t
    }
  }

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    this.refill()
    if (this.tokens >= chunk.length) {
      this.tokens -= chunk.length
      cb(null, chunk)
      return
    }
    // Eksik kalan pay için bekle; bekleme süresince birikenlerin tamamı bu
    // chunk'a harcanmış sayılır (kova sıfırdan devam eder).
    const deficit = chunk.length - this.tokens
    this.tokens = 0
    const delayMs = (deficit / this.bytesPerSec) * 1000
    setTimeout(() => {
      this.lastRefill = this.now()
      cb(null, chunk)
    }, delayMs)
  }
}
