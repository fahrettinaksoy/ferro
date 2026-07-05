import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import AppDrawer from '@renderer/components/AppDrawer.vue'
import { mountWithPlugins } from './testUtils'

describe('AppDrawer', () => {
  it('renders the title, subtitle and body slot content', () => {
    const wrapper = mountWithPlugins(AppDrawer, {
      props: { modelValue: true, title: 'Site Manager', subtitle: 'Manage your connections' },
      slots: { default: '<div class="probe">body</div>' }
    })
    expect(wrapper.text()).toContain('Site Manager')
    expect(wrapper.text()).toContain('Manage your connections')
    expect(wrapper.find('.probe').exists()).toBe(true)
  })

  it('omits the footer bar when no footer slot is provided', () => {
    const wrapper = mountWithPlugins(AppDrawer, {
      props: { modelValue: true, title: 'No Footer' }
    })
    expect(wrapper.find('.app-drawer-footer').exists()).toBe(false)
  })

  it('renders the footer bar when a footer slot is provided', () => {
    const wrapper = mountWithPlugins(AppDrawer, {
      props: { modelValue: true, title: 'With Footer' },
      slots: { footer: '<button class="save-probe">Save</button>' }
    })
    expect(wrapper.find('.app-drawer-footer').exists()).toBe(true)
    expect(wrapper.find('.save-probe').exists()).toBe(true)
  })

  it('emits update:modelValue(false) when the close button is clicked', async () => {
    const wrapper = mountWithPlugins(AppDrawer, {
      props: { modelValue: true, title: 'Closeable' }
    })
    await wrapper.find('.app-drawer-header button').trigger('click')
    await nextTick()
    expect(wrapper.findComponent(AppDrawer).emitted('update:modelValue')).toEqual([[false]])
  })
})
