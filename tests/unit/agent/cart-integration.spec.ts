import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAgentStore } from '@/features/agent/store'
import { useCartStore } from '@/stores/cart'
import AgentIndex from '@/views/agent/AgentIndex.vue'
import HeaderCart from '@/views/layout/components/HeaderCart.vue'

vi.mock('element-plus', () => ({ ElMessage: vi.fn() }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

const headerStubs = {
  'el-button': { template: '<button><slot /></button>' },
}

const createTestRouter = async () => {
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

const finishDefaultScenario = async (agentStore: ReturnType<typeof useAgentStore>) => {
  const stream = agentStore.sendMessage('500元内的安静宿舍咖啡方案')
  await vi.runAllTimersAsync()
  await stream
  await flushPromises()
  await nextTick()
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('agent confirmation cart integration', () => {
  it('keeps selection proposal-only and mutates the existing cart exactly once after confirmation', async () => {
    const router = await createTestRouter()
    const agentStore = useAgentStore()
    const cartStore = useCartStore()
    const addCart = vi.spyOn(cartStore, 'addcart')
    const workspace = mount(AgentIndex, {
      attachTo: document.body,
      global: { plugins: [router] },
    })
    const header = mount(HeaderCart, {
      attachTo: document.body,
      global: { plugins: [router], stubs: headerStubs },
    })

    vi.useFakeTimers()
    await finishDefaultScenario(agentStore)
    const confirmationId = agentStore.pendingConfirmation?.id
    expect(confirmationId).toBeTruthy()
    expect(cartStore.cartList).toEqual([])
    expect(header.get('.curr').text()).toContain('0')
    expect(workspace.get('.agent-workspace__log').attributes('aria-live')).toBeUndefined()

    const choices = workspace.findAll('button[data-testid="select-recommendation"]')
    const nonMatchingChoice = choices.find((choice) =>
      choice.attributes('aria-label')?.includes('静音计时咖啡秤'),
    )
    const matchingChoice = choices.find((choice) =>
      choice.attributes('aria-label')?.includes('V60 手冲滤杯套装'),
    )
    expect(nonMatchingChoice).toBeDefined()
    expect(matchingChoice).toBeDefined()

    await nonMatchingChoice!.trigger('click')
    expect(workspace.find('[data-testid="operation-confirmation"]').exists()).toBe(false)
    expect(cartStore.cartList).toEqual([])
    expect(addCart).not.toHaveBeenCalled()

    await matchingChoice!.trigger('click')
    const confirmation = workspace.get('[data-testid="operation-confirmation"]')
    expect(confirmation.text()).toContain('mock-dripper-01')
    expect(confirmation.text()).toContain('mock-dripper-01-clear')
    expect(confirmation.get('[data-testid="operation-attrs"]').text())
      .toBe('透明 01 号，含分享壶')
    expect(confirmation.get('[data-testid="operation-quantity"]').text()).toBe('1')
    expect(confirmation.get('[data-testid="operation-unit-price"]').text()).toBe('RMB 129.00')
    expect(confirmation.get('[data-testid="operation-total-price"]').text()).toBe('RMB 129.00')
    expect(cartStore.cartList).toEqual([])
    expect(addCart).not.toHaveBeenCalled()

    await confirmation.get('button[data-testid="confirm-operation"]').trigger('click')
    await vi.runAllTimersAsync()
    await flushPromises()
    await nextTick()

    expect(addCart).toHaveBeenCalledTimes(1)
    expect(cartStore.cartList).toEqual([
      expect.objectContaining({
        id: 'mock-dripper-01',
        skuId: 'mock-dripper-01-clear',
        name: 'V60 手冲滤杯套装',
        attrsText: '透明 01 号，含分享壶',
        price: 129,
        count: 1,
        selected: true,
      }),
    ])
    expect(cartStore.allcount).toBe(1)
    expect(header.get('.curr').text()).toContain('1')
    expect(header.get('.curr').attributes('aria-label')).toContain('1')

    const result = workspace.get('[data-testid="operation-result"]')
    expect(result.text()).toContain('已加入现有购物车')
    expect(result.get('a').attributes('href')).toBe('/cartlist')
    expect(document.activeElement).toBe(result.element)

    await expect(agentStore.confirmOperation(confirmationId!)).resolves.toBe(false)
    await expect(agentStore.retry()).resolves.toBe(false)
    await matchingChoice!.trigger('click')
    await flushPromises()
    expect(workspace.find('button[data-testid="confirm-operation"]').exists()).toBe(false)
    expect(addCart).toHaveBeenCalledTimes(1)
    expect(cartStore.allcount).toBe(1)
  })

  it('announces rejection at the focused result without changing cart state', async () => {
    const router = await createTestRouter()
    const agentStore = useAgentStore()
    const cartStore = useCartStore()
    const addCart = vi.spyOn(cartStore, 'addcart')
    const workspace = mount(AgentIndex, {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    vi.useFakeTimers()
    await finishDefaultScenario(agentStore)
    const matchingChoice = workspace.findAll('button[data-testid="select-recommendation"]')
      .find((choice) => choice.attributes('aria-label')?.includes('V60 手冲滤杯套装'))
    await matchingChoice!.trigger('click')
    await workspace.get('button[data-testid="reject-operation"]').trigger('click')
    await flushPromises()
    await nextTick()

    const result = workspace.get('[data-testid="operation-result"]')
    expect(result.text()).toContain('已暂不加入')
    expect(result.text()).toContain('购物车没有变化')
    expect(document.activeElement).toBe(result.element)
    expect(cartStore.cartList).toEqual([])
    expect(addCart).not.toHaveBeenCalled()
  })

  it('uses total quantity in the header badge and accessible cart name', async () => {
    const router = await createTestRouter()
    const cartStore = useCartStore()
    cartStore.cartList.push({
      id: 'product-existing',
      skuId: 'sku-existing',
      name: 'Existing cart item',
      picture: '/existing.png',
      price: 20,
      count: 3,
      selected: true,
      attrsText: 'Three pack',
    })
    const header = mount(HeaderCart, {
      global: { plugins: [router], stubs: headerStubs },
    })

    expect(header.get('.curr').text()).toContain('3')
    expect(header.get('.curr').attributes('aria-label')).toBe('购物车，共 3 件商品')
    expect(header.get('.curr').attributes('href')).toBe('/cartlist')
  })
})
