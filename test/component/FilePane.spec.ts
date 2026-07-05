import { describe, it, expect } from 'vitest'
import FilePane from '@renderer/components/FilePane.vue'
import { mountWithPlugins } from './testUtils'

// FilePane'in boş klasör / bağlı-değil ayrımı v-empty-state ile gösteriliyor
// (bkz. Vuetify empty-states component): iki durum farklı ikon+başlık kullanır
// ki kullanıcı "klasör boş" ile "sunucuya bağlı değilim"i karıştırmasın.
const BASE_PROPS = {
  title: 'Remote Server',
  icon: '$server',
  cwd: '/home',
  side: 'remote' as const,
  entries: [],
  loading: false,
  error: null,
  transferIcon: '$transferOut',
  transferTooltip: 'Upload'
}

describe('FilePane — empty state', () => {
  it('shows the "empty folder" empty-state when connected with zero entries', () => {
    const wrapper = mountWithPlugins(FilePane, { props: { ...BASE_PROPS, disabled: false } })
    const empty = wrapper.findComponent({ name: 'VEmptyState' })
    expect(empty.exists()).toBe(true)
    expect(empty.props('icon')).toBe('mdi-folder-open-outline')
    expect(wrapper.text()).toContain('Empty folder')
  })

  it('shows the "no connection" empty-state when disabled (not connected)', () => {
    const wrapper = mountWithPlugins(FilePane, { props: { ...BASE_PROPS, disabled: true } })
    const empty = wrapper.findComponent({ name: 'VEmptyState' })
    expect(empty.exists()).toBe(true)
    expect(empty.props('icon')).toBe('mdi-lan-disconnect')
    expect(wrapper.text()).toContain('No connection')
  })

  it('does not show an empty-state while entries are loading (skeleton instead)', () => {
    const wrapper = mountWithPlugins(FilePane, {
      props: { ...BASE_PROPS, disabled: false, loading: true }
    })
    expect(wrapper.findComponent({ name: 'VEmptyState' }).exists()).toBe(false)
  })
})
