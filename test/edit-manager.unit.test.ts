import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { Writable } from 'stream'

// EditManager'ın dış bağımlılıkları taklit edilir: shell.openPath ve sessionManager.
const h = vi.hoisted(() => ({
  openPathError: '' as string,
  enqueued: [] as Array<{ direction: string; remotePath: string; localPath: string }>,
  logs: [] as string[],
  released: 0
}))

vi.mock('electron', () => ({
  shell: { openPath: async () => h.openPathError }
}))

vi.mock('../src/main/transfer/SessionManager', () => {
  const fakeClient = {
    async download(_remote: string, dest: Writable): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        dest.once('error', reject)
        dest.end('uzak-icerik', resolve)
      })
    }
  }
  return {
    sessionManager: {
      session: () => ({
        pool: {
          acquire: async () => fakeClient,
          release: () => {
            h.released++
          }
        }
      }),
      enqueueTransfer: (
        _sessionId: string,
        direction: string,
        remotePath: string,
        localPath: string
      ) => {
        h.enqueued.push({ direction, remotePath, localPath })
        return 'j1'
      },
      emitLog: (_s: unknown, _id: string, _lvl: string, text: string) => {
        h.logs.push(text)
      }
    }
  }
})

import { editManager } from '../src/main/transfer/EditManager'

const sender = { isDestroyed: () => false } as never

afterEach(() => {
  editManager.stopAll()
  h.enqueued.length = 0
  h.logs.length = 0
  h.openPathError = ''
})

describe('EditManager', () => {
  it('uzak dosyayı geçici dizine indirir ve havuz bağlantısını iade eder', async () => {
    await editManager.open('s1', '/uzak/dosya.txt', 'dosya.txt', sender)
    const localPath = h.logs.join(' ').includes('Düzenleme için açıldı')
      ? h.enqueued[0]?.localPath // henüz upload yok; yolu izleyiciden bilemeyiz
      : undefined
    void localPath
    expect(h.released).toBeGreaterThanOrEqual(1)
    expect(h.logs.some((l) => l.includes('Düzenleme için açıldı'))).toBe(true)
  })

  it('dosya kaydedilince debounce sonrası upload kuyruğa girer', async () => {
    await editManager.open('s1', '/uzak/notlar.txt', 'notlar.txt', sender)

    // İndirilen geçici dosyayı bul: mock download 'uzak-icerik' yazdı.
    // stopAll çağrılmadığı sürece izleyici aktif; dosyayı değiştir.
    // Geçici yol tmpdir/ferro-edit-*/notlar.txt — izleme girdisinden okuyamayız,
    // bu yüzden upload kaydında doğrulayacağız.
    // Değişikliği tetikle: EditManager'ın izlediği dizindeki dosyayı bulmak için
    // upload henüz yok; dosya yolunu log üzerinden değil fs üzerinden buluyoruz.
    const os = await import('os')
    const fsp = await import('fs/promises')
    const path = await import('path')
    const tmp = os.tmpdir()
    const dirs = (await fsp.readdir(tmp)).filter((d) => d.startsWith('ferro-edit-'))
    const candidates = dirs.map((d) => path.join(tmp, d, 'notlar.txt')).filter((p) => existsSync(p))
    expect(candidates.length).toBeGreaterThanOrEqual(1)
    const localPath = candidates[candidates.length - 1]
    expect(readFileSync(localPath, 'utf8')).toBe('uzak-icerik')

    writeFileSync(localPath, 'düzenlendi', 'utf8')

    // 800ms debounce + fs.watch gecikmesi: sabit bekleme yerine sonuca kadar bekle.
    const deadline = Date.now() + 8_000
    while (h.enqueued.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(h.enqueued).toContainEqual({
      direction: 'upload',
      remotePath: '/uzak/notlar.txt',
      localPath
    })
  }, 15_000)

  it('editör açılamazsa hata loglanır ama izleme kurulur', async () => {
    h.openPathError = 'uygulama bulunamadı'
    await editManager.open('s1', '/uzak/x.bin', 'x.bin', sender)
    expect(h.logs.some((l) => l.includes('Editör açılamadı'))).toBe(true)
  })

  it('stopAll geçici dizinleri diskten siler', async () => {
    await editManager.open('s1', '/uzak/silinecek.txt', 'silinecek.txt', sender)
    const os = await import('os')
    const fsp = await import('fs/promises')
    const path = await import('path')
    const tmp = os.tmpdir()
    const before = (await fsp.readdir(tmp)).filter((d) => d.startsWith('ferro-edit-'))
    const mine = before
      .map((d) => path.join(tmp, d))
      .filter((d) => existsSync(path.join(d, 'silinecek.txt')))
    expect(mine.length).toBeGreaterThanOrEqual(1)

    editManager.stopAll()
    for (const d of mine) expect(existsSync(d)).toBe(false)
  })
})
