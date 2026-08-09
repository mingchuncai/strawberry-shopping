import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import XtxSku from '@/components/XtxSku/index.vue'

const createGoods = () => ({
  specs: [
    {
      id: 'color',
      name: '颜色',
      values: [{ name: '黑色' }, { name: '白色' }],
    },
    {
      id: 'size',
      name: '容量',
      values: [{ name: '300ml' }, { name: '500ml' }],
    },
  ],
  skus: [
    {
      id: 'sku-black-300',
      price: 99,
      oldPrice: 129,
      inventory: 8,
      specs: [
        { name: '颜色', valueName: '黑色' },
        { name: '容量', valueName: '300ml' },
      ],
    },
    {
      id: 'sku-white-500',
      price: 119,
      oldPrice: 149,
      inventory: 0,
      specs: [
        { name: '颜色', valueName: '白色' },
        { name: '容量', valueName: '500ml' },
      ],
    },
  ],
})

describe('XtxSku', () => {
  it('disables impossible combinations and emits a complete in-stock selection', async () => {
    const wrapper = mount(XtxSku, { props: { goods: createGoods() } })
    const choices = wrapper.findAll('span')

    expect(choices.find((choice) => choice.text() === '白色')?.classes()).toContain('disabled')
    await choices.find((choice) => choice.text() === '黑色')?.trigger('click')
    await choices.find((choice) => choice.text() === '300ml')?.trigger('click')

    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual({
      skuId: 'sku-black-300',
      price: 99,
      oldPrice: 129,
      inventory: 8,
      specsText: '颜色：黑色 容量：300ml',
    })
  })

  it('emits an empty selection after deselecting a chosen value', async () => {
    const wrapper = mount(XtxSku, { props: { goods: createGoods() } })
    const black = wrapper.findAll('span').find((choice) => choice.text() === '黑色')

    await black?.trigger('click')
    await black?.trigger('click')

    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual({})
  })
})
