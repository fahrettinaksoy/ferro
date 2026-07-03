import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readJsonVersioned, writeJsonVersioned } from '../src/main/store/jsonStore'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ferro-jsonstore-'))
})

describe('jsonStore — atomik + sürümlü depo', () => {
  it('yazma {version, data} zarfı üretir ve geri okunur', () => {
    const path = join(dir, 'x.json')
    writeJsonVersioned(path, 1, { a: 1 })
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    expect(raw).toEqual({ version: 1, data: { a: 1 } })
    expect(readJsonVersioned(path, 1, () => null)).toEqual({ a: 1 })
    // atomik yazma ara dosya bırakmaz
    expect(existsSync(`${path}.tmp`)).toBe(false)
  })

  it('dosya yoksa onMissing çalışır', () => {
    expect(readJsonVersioned(join(dir, 'yok.json'), 1, () => 'ilk')).toBe('ilk')
  })

  it('bozuk dosya .corrupt olarak karantinaya alınır, veri kaybolmaz', () => {
    const path = join(dir, 'bozuk.json')
    writeFileSync(path, '{"version":1,"data":[trunca', 'utf8')
    const result = readJsonVersioned(path, 1, () => 'varsayilan')
    expect(result).toBe('varsayilan')
    expect(existsSync(`${path}.corrupt`)).toBe(true)
    expect(readFileSync(`${path}.corrupt`, 'utf8')).toContain('trunca')
  })

  it('bozulmada onCorrupt, onMissing yerine kullanılır', () => {
    const path = join(dir, 'bozuk2.json')
    writeFileSync(path, 'xxx', 'utf8')
    const result = readJsonVersioned(path, 1, () => 'seed', { onCorrupt: () => 'bos' })
    expect(result).toBe('bos')
  })

  it('eski (çıplak) format legacy() ile taşınır', () => {
    const path = join(dir, 'legacy.json')
    writeFileSync(path, JSON.stringify([{ id: 'a' }]), 'utf8')
    const result = readJsonVersioned<{ id: string }[]>(path, 1, () => [], {
      legacy: (p) => (Array.isArray(p) ? (p as { id: string }[]) : null)
    })
    expect(result).toEqual([{ id: 'a' }])
  })

  it('legacy tanıyamazsa bozuk kabul edilir ve karantinaya alınır', () => {
    const path = join(dir, 'garip.json')
    writeFileSync(path, JSON.stringify({ beklenmedik: true }), 'utf8')
    const result = readJsonVersioned(path, 1, () => 'varsayilan', {
      legacy: (p) => (Array.isArray(p) ? p : null)
    })
    expect(result).toBe('varsayilan')
    expect(existsSync(`${path}.corrupt`)).toBe(true)
  })

  it('eski zarf sürümü migrate() ile taşınır', () => {
    const path = join(dir, 'v0.json')
    writeJsonVersioned(path, 0, { eski: true })
    const result = readJsonVersioned(path, 1, () => null, {
      migrate: (v, data) => (v === 0 ? { yeni: true, kaynak: data } : null)
    })
    expect(result).toEqual({ yeni: true, kaynak: { eski: true } })
  })
})
