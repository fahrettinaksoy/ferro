import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import SettingsDialog from '@renderer/components/SettingsDialog.vue'
import { useUiStore } from '@renderer/stores/ui'
import { mountWithPlugins } from './testUtils'

// SettingsDialog.vue'daki 18 "yalnızca :draft alan" sayfa, elle yazılmış bir
// v-if/v-else-if zinciri yerine bir key→component map'i + <component :is> ile
// çözülüyor (transferTypes ve passwords hâlâ açık kalıyor — ekstra v-model'leri
// var). Bu test o map'in gerçekten doğru bileşeni bulup render ettiğini,
// açık bırakılan iki özel sayfanın da bozulmadığını doğrular.
function clickPageByTitle(wrapper: ReturnType<typeof mountWithPlugins>, title: string): void {
  const item = wrapper
    .findAll('.v-list-item')
    .find((w) => w.text().trim() === title || w.text().includes(title))
  expect(item, `treeview item "${title}" not found`).toBeTruthy()
  void item!.trigger('click')
}

describe('SettingsDialog — page routing', () => {
  function mountOpenSettings(): ReturnType<typeof mountWithPlugins> {
    const pinia = createPinia()
    setActivePinia(pinia)
    useUiStore().openDrawer('settings')
    return mountWithPlugins(SettingsDialog, { pinia })
  }

  it('renders the default (connection) page on open', () => {
    const wrapper = mountOpenSettings()
    expect(wrapper.text()).toContain('Timeout')
  })

  it('resolves a plain map-driven page (Debug) via <component :is>', async () => {
    const wrapper = mountOpenSettings()
    clickPageByTitle(wrapper, 'Debug')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Debug settings')
  })

  it('still renders the special-cased Passwords page with its extra v-models', async () => {
    const wrapper = mountOpenSettings()
    clickPageByTitle(wrapper, 'Passwords')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Save passwords protected by a master password')

    // Master parola alanları yalnızca "master" modunda görünür — bu alanlar
    // parent'ın (SettingsDialog) v-model:master-pw'sine bağlıdır; sayfa doğru
    // mount edilmediyse hem metin hem bu alanlar hiç var olmaz.
    const masterRadio = wrapper
      .findAll('input[type="radio"]')
      .find((r) => (r.element as HTMLInputElement).value === 'master')
    expect(masterRadio, 'master password radio not found').toBeTruthy()
    await masterRadio!.setValue()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('input[type="password"]').length).toBeGreaterThan(0)
  })
})
