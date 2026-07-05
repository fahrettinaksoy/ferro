import { describe, it, expect } from 'vitest'
import TransferTabs from '@renderer/components/TransferTabs.vue'
import { mountWithPlugins } from './testUtils'

// Regresyon: 'queued' sekmesinin boş-durum ikonu düz 'mdi-tray' idi — bu glyph
// sığ/açık bir U çizdiğinden 44px'te yarım kesilmiş görünüyordu (kullanıcı
// ekran görüntüsüyle bildirdi). $queuePanel (mdi-tray-full, panelin zaten
// kullandığı dolu tepsi ikonu) ile değiştirildi; bu test o ikonu sabitler.
describe('TransferTabs — empty state icons', () => {
  it('uses the filled $queuePanel icon (not the clipped-looking mdi-tray) for the empty queued tab', () => {
    const wrapper = mountWithPlugins(TransferTabs)
    const empty = wrapper.findComponent({ name: 'VEmptyState' })
    expect(empty.exists()).toBe(true)
    expect(empty.props('icon')).toBe('$queuePanel')
    expect(empty.props('icon')).not.toBe('mdi-tray')
  })
})
