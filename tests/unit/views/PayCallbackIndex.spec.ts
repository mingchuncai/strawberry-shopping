import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

import PayCallbackIndex from '@/views/pay/PayCallbackIndex.vue'

const renderResult = async (result?: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/paycallback', component: PayCallbackIndex },
      { path: '/cartlist', component: { template: '<div />' } },
      { path: '/', component: { template: '<div />' } },
    ],
  })
  await router.push({ path: '/paycallback', query: result ? { result } : {} })
  await router.isReady()
  return mount(PayCallbackIndex, { global: { plugins: [router] } })
}

describe('PayCallbackIndex', () => {
  it.each([
    ['success', '模拟支付已完成'],
    ['pending', '支付结果待确认'],
    ['failure', '模拟支付未完成'],
    [undefined, '支付结果待确认'],
    ['unexpected', '支付结果待确认'],
  ])('renders %s as %s', async (result, expected) => {
    const wrapper = await renderResult(result)
    expect(wrapper.get('h1').text()).toBe(expected)
    expect(wrapper.get('[href="/cartlist"]').text()).toContain('购物车')
    expect(wrapper.get('[href="/"]').text()).toContain('首页')
  })

  it('never describes the callback as proof that real funds moved', async () => {
    const wrapper = await renderResult('success')
    expect(wrapper.text()).not.toContain('资金到账')
    expect(wrapper.text()).toContain('模拟支付')
  })
})
