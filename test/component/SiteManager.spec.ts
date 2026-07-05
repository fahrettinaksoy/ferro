import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import SiteManager from '@renderer/components/SiteManager.vue'
import { mountWithPlugins, stubFerro } from './testUtils'

describe('SiteManager — empty state', () => {
  it('shows a v-empty-state instead of a bare list item when there are no saved sites', async () => {
    stubFerro({
      'sites:list': () => ({ sites: [], encryptionAvailable: true })
    })
    const wrapper = mountWithPlugins(SiteManager, { props: { modelValue: false } })

    // false → true tetikler: sites.load() çağrılır (bkz. TeamDialog testindeki desen).
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    await nextTick()

    const empty = wrapper.findComponent({ name: 'VEmptyState' })
    expect(empty.exists()).toBe(true)
    expect(empty.props('icon')).toBe('mdi-server-off')
    expect(wrapper.text()).toContain('No saved sites')
  })
})
