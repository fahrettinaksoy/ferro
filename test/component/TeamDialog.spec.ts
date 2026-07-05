import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import TeamDialog from '@renderer/components/TeamDialog.vue'
import { mountWithPlugins, stubFerro } from './testUtils'

describe('TeamDialog — create-team form validation', () => {
  beforeEach(() => {
    stubFerro({
      'team:list': () => ({ teams: [], encryptionAvailable: true }),
      'sites:list': () => ({ sites: [], encryptionAvailable: true })
    })
  })

  it('keeps the Create button disabled until required fields are filled, then enables it', async () => {
    const wrapper = mountWithPlugins(TeamDialog, { props: { modelValue: false } })

    // false → true geçişi: panelin açılış izleyicisini tetikler (reload()).
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    await nextTick()

    // Sol listedeki ilk öğe "Ekip Oluştur" — create moduna geçer.
    const firstListItem = wrapper.find('.team-list-scroll .v-list-item')
    await firstListItem.trigger('click')
    await nextTick()

    const actions = wrapper.find('.panel-actions')
    expect(actions.exists()).toBe(true)
    const buttons = actions.findAll('button')
    const createBtn = buttons[buttons.length - 1]

    // Boş form: zorunlu alanlar (ad, görünen ad, gist token) eksik → buton kilitli.
    expect(createBtn.attributes('disabled')).toBeDefined()

    const textInputs = wrapper.findAll('.panel-body input[type="text"]')
    await textInputs[0].setValue('Backend Team')
    await textInputs[1].setValue('Ada')
    const tokenInput = wrapper.find('.panel-body input[type="password"]')
    await tokenInput.setValue('ghp_faketoken123')
    await nextTick()
    await nextTick()

    expect(createBtn.attributes('disabled')).toBeUndefined()
  })
})
