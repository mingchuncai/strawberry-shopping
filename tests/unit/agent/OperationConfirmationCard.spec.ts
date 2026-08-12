import { createMemoryHistory, createRouter } from 'vue-router'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import OperationConfirmationCard from '@/features/agent/components/OperationConfirmationCard.vue'
import OperationResultCard from '@/features/agent/components/OperationResultCard.vue'
import confirmationCardSource from '@/features/agent/components/OperationConfirmationCard.vue?raw'
import type { OperationConfirmation } from '@/features/agent/types'

const confirmation: OperationConfirmation = Object.freeze({
  id: 'confirmation-quiet-grinder',
  operation: 'add_to_cart',
  productId: 'product-quiet-01',
  skuId: 'sku-black-220v',
  productName: 'Quiet Burr Grinder',
  attrsText: 'Black / 220V',
  quantity: 2,
  unitPrice: 199,
  totalPrice: 398,
  payloadHash: 'immutable-payload-hash',
  idempotencyKey: 'immutable-operation-key',
})

const resultRouter = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/cartlist', name: 'cart', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  return router
}

describe('OperationConfirmationCard', () => {
  it('shows the complete immutable operation snapshot and emits explicit intent only', async () => {
    const wrapper = mount(OperationConfirmationCard, {
      props: { confirmation, state: 'ready' },
    })

    expect(wrapper.get('[data-testid="operation-target"]').text()).toBe(
      'Add to existing cart',
    )
    expect(wrapper.get('[data-testid="operation-product-name"]').text()).toBe(
      'Quiet Burr Grinder',
    )
    expect(wrapper.get('[data-testid="operation-product-id"]').text()).toBe(
      'product-quiet-01',
    )
    expect(wrapper.get('[data-testid="operation-sku-id"]').text()).toBe('sku-black-220v')
    expect(wrapper.get('[data-testid="operation-attrs"]').text()).toBe('Black / 220V')
    expect(wrapper.get('[data-testid="operation-quantity"]').text()).toBe('2')
    expect(wrapper.get('[data-testid="operation-unit-price"]').text()).toBe('RMB 199.00')
    expect(wrapper.get('[data-testid="operation-total-price"]').text()).toBe('RMB 398.00')

    const confirm = wrapper.get('button[data-testid="confirm-operation"]')
    const reject = wrapper.get('button[data-testid="reject-operation"]')
    expect(confirm.attributes('type')).toBe('button')
    expect(confirm.text()).toBe('确认加入')
    expect(reject.attributes('type')).toBe('button')
    expect(reject.text()).toBe('暂不加入')
    expect(confirmationCardSource).toMatch(
      /\.operation-confirmation-card__action[\s\S]*?min-height:\s*44px/,
    )
    expect(confirmationCardSource).not.toMatch(/useCartStore|\.addcart\s*\(/)

    await confirm.trigger('click')
    await reject.trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([['confirmation-quiet-grinder']])
    expect(wrapper.emitted('reject')).toEqual([['confirmation-quiet-grinder']])
  })

  it.each([
    ['pending', '正在加入购物车，请稍候。'],
    ['stale', '此确认已过期，无法执行。请重新选择当前提案。'],
    ['invalid', '此确认与当前商品提案不匹配，无法执行。'],
    ['unavailable', '此操作当前不可用，购物车不会改变。'],
  ] as const)('disables both actions and explains the %s state', (state, explanation) => {
    const wrapper = mount(OperationConfirmationCard, { props: { confirmation, state } })

    expect(wrapper.get('[data-testid="confirmation-state"]').text()).toContain(explanation)
    expect(wrapper.get('[data-testid="confirm-operation"]').attributes())
      .toHaveProperty('disabled')
    expect(wrapper.get('[data-testid="reject-operation"]').attributes())
      .toHaveProperty('disabled')
    expect(wrapper.get('[data-testid="operation-confirmation"]').attributes('aria-busy'))
      .toBe(state === 'pending' ? 'true' : 'false')
  })
})

describe('OperationResultCard', () => {
  it.each([
    ['failed', '未能加入购物车', '商品提案和对话均已保留', '购物车没有变化'],
    ['unknown', '购物车结果需要核对', '本次更新结果未知', '请先查看购物车'],
    ['rejected', '已暂不加入', '购物车没有变化', '商品提案和对话仍保留'],
  ] as const)('explains the safe %s outcome', async (status, title, detail, recovery) => {
    const wrapper = mount(OperationResultCard, {
      props: { status },
      global: { plugins: [await resultRouter()] },
    })

    const result = wrapper.get('[data-testid="operation-result"]')
    expect(result.attributes('role')).toBe('status')
    expect(result.attributes('tabindex')).toBe('-1')
    expect(result.text()).toContain(title)
    expect(result.text()).toContain(detail)
    expect(result.text()).toContain(recovery)
  })

  it('summarizes success and links to the named existing cart route', async () => {
    const wrapper = mount(OperationResultCard, {
      props: { status: 'success', cartItemCount: 3 },
      global: { plugins: [await resultRouter()] },
    })

    const result = wrapper.get('[data-testid="operation-result"]')
    expect(result.text()).toContain('已加入现有购物车')
    expect(result.text()).toContain('购物车现在有 3 件商品')
    expect(result.get('a').attributes('href')).toBe('/cartlist')
  })
})
