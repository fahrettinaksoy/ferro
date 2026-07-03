import { describe, it, expect } from 'vitest'
import { isAsciiTransfer } from '../src/main/transfer/transferType'
import type { TransferTypeConfig } from '../src/shared/transfer'

const auto: TransferTypeConfig = {
  mode: 'auto',
  asciiExtensions: ['txt', 'html', 'css'],
  noExtAsAscii: true,
  dotfilesAsAscii: true
}

describe('isAsciiTransfer', () => {
  it('binary modu her zaman false', () => {
    expect(isAsciiTransfer('a.txt', { ...auto, mode: 'binary' })).toBe(false)
  })
  it('ascii modu her zaman true', () => {
    expect(isAsciiTransfer('a.bin', { ...auto, mode: 'ascii' })).toBe(true)
  })
  it('yapılandırma yoksa false', () => {
    expect(isAsciiTransfer('a.txt', undefined)).toBe(false)
  })
  it('auto: eşleşen uzantı ASCII', () => {
    expect(isAsciiTransfer('index.HTML', auto)).toBe(true) // büyük/küçük harf duyarsız
    expect(isAsciiTransfer('style.css', auto)).toBe(true)
  })
  it('auto: eşleşmeyen uzantı binary', () => {
    expect(isAsciiTransfer('photo.jpg', auto)).toBe(false)
  })
  it('auto: uzantısız dosya tercihe göre', () => {
    expect(isAsciiTransfer('README', auto)).toBe(true)
    expect(isAsciiTransfer('README', { ...auto, noExtAsAscii: false })).toBe(false)
  })
  it('auto: dotfile tercihe göre', () => {
    expect(isAsciiTransfer('.bashrc', auto)).toBe(true)
    expect(isAsciiTransfer('.bashrc', { ...auto, dotfilesAsAscii: false })).toBe(false)
  })
  it('auto: yol içeren adda yalnızca dosya adına bakar', () => {
    expect(isAsciiTransfer('/var/www/index.txt', auto)).toBe(true)
  })
})
