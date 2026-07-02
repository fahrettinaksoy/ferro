// Regresyon: remoteFs.slot() `??=` ile HAM (reaktif olmayan) nesne döndürüyordu;
// ilk yüklemenin mutasyonları (entries, loading=false) UI'ı tetiklemiyor ve uzak
// panel sonsuza dek iskelette kalıyordu. Bu test, UI gibi ÖNCEDEN kurulmuş bir
// computed'ın yükleme bitince gerçekten güncellendiğini doğrular.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@renderer/lib/ipc', () => ({
  invoke: vi.fn(async (channel: string) => {
    if (channel === 'fs:cwd') return { cwd: '/home/ajansuser' }
    if (channel === 'fs:pwd') return { cwd: '/home/ajansuser' }
    if (channel === 'fs:list')
      return Array.from({ length: 10 }, (_, i) => ({
        name: `f${i}`,
        type: 'file',
        size: 1,
        modifiedAt: null,
        permissions: null
      }))
    throw new Error('beklenmeyen kanal: ' + channel)
  }),
  FerroError: class FerroError extends Error {
    constructor(
      public code: string,
      msg: string
    ) {
      super(msg)
    }
  }
}))

import { useConnectionStore } from '@renderer/stores/connection'
import { useRemoteFsStore } from '@renderer/stores/remoteFs'
import { useLogStore } from '@renderer/stores/log'

describe('remoteFs reaktivitesi (ilk yükleme)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const conn = useConnectionStore()
    conn.sessions.push({
      tabId: 't1',
      sessionId: 's1',
      config: { protocol: 'sftp', host: 'h', port: 22, user: 'u' },
      name: 'test',
      status: 'connected',
      error: null
    })
    conn.activeId = 's1'
  })

  it('önceden izlenen computed, yükleme bitince güncellenir', async () => {
    const remote = useRemoteFsStore()
    const paneLoading = computed(() => remote.loading)
    const paneCount = computed(() => remote.entries.length)
    const paneCwd = computed(() => remote.cwd)

    // UI'ın ilk render'ı: yükleme öncesi durum okunur (cache kurulur).
    expect(paneLoading.value).toBe(false)
    expect(paneCount.value).toBe(0)

    const p = remote.load('/home/ajansuser')
    // Yükleme sürerken iskelet görünmeli.
    expect(paneLoading.value).toBe(true)
    await p

    // Hata: `??=` ham nesne döndürdüğünde bunlar eski (stale) kalıyordu.
    expect(paneLoading.value).toBe(false)
    expect(paneCount.value).toBe(10)
    expect(paneCwd.value).toBe('/home/ajansuser')
  })

  it('günlükte ilk satır ikinci satır beklemeden görünür', () => {
    const log = useLogStore()
    const lines = computed(() => log.entries.length)
    expect(lines.value).toBe(0)
    log.append({ sessionId: 's1', level: 'info', text: 'Bağlanılıyor…' })
    expect(lines.value).toBe(1)
  })
})
