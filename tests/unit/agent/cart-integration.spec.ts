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

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const createTestRouter = async (base = '') => {
  const router = createRouter({
    history: createMemoryHistory(base),
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

const recommendationChoice = (
  workspace: ReturnType<typeof mount>,
  name: string,
) => workspace.findAll('button[data-testid="select-recommendation"]')
  .find((choice) => choice.attributes('aria-label')?.includes(name))

const selectMatchingRecommendation = async (workspace: ReturnType<typeof mount>) => {
  const choice = recommendationChoice(workspace, 'V60 手冲滤杯套装')
  expect(choice).toBeDefined()
  await choice!.trigger('click')
  return choice!
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
    const messageLog = workspace.get('.agent-workspace__log')
    expect(messageLog.attributes('role')).toBe('log')
    expect(messageLog.attributes('aria-live')).toBe('off')
    const messageLiveRegions = messageLog.findAll('[aria-live]')
    expect(messageLiveRegions).toHaveLength(1)
    expect(messageLiveRegions[0]?.attributes('aria-live')).toBe('polite')
    expect(messageLiveRegions[0]?.attributes('data-testid')).toBe('message-complete')

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
    const unavailable = workspace.get('[data-testid="operation-confirmation"]')
    expect(unavailable.get('[data-testid="confirmation-state"]').text()).toContain(
      '此操作当前不可用，购物车不会改变。',
    )
    expect(unavailable.find('[data-testid="operation-target"]').exists()).toBe(false)
    expect(unavailable.find('.operation-confirmation-card__snapshot').exists()).toBe(false)
    expect(unavailable.get('[data-testid="confirm-operation"]').attributes())
      .toHaveProperty('disabled')
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
    expect(workspace.get('button[data-testid="confirm-operation"]').attributes())
      .toHaveProperty('disabled')
    expect(workspace.get('[data-testid="confirmation-state"]').text())
      .toContain('此操作当前不可用，购物车不会改变。')
    expect(addCart).toHaveBeenCalledTimes(1)
    expect(cartStore.allcount).toBe(1)
  })

  it('keeps a reset scoped away from an older in-flight confirmation result', async () => {
    const router = await createTestRouter()
    const agentStore = useAgentStore()
    const cartStore = useCartStore()
    const addGate = deferred<void>()
    const originalAddCart = cartStore.addcart
    const addCart = vi.spyOn(cartStore, 'addcart').mockImplementation(async (item) => {
      await addGate.promise
      await originalAddCart(item)
    })
    const workspace = mount(AgentIndex, {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    vi.useFakeTimers()
    await finishDefaultScenario(agentStore)
    await selectMatchingRecommendation(workspace)
    const confirmation = workspace.get('[data-testid="operation-confirmation"]')
    const confirm = confirmation.get('button[data-testid="confirm-operation"]')
    await confirm.trigger('click')
    await nextTick()

    expect(confirm.attributes()).toHaveProperty('disabled')
    expect(confirmation.get('button[data-testid="reject-operation"]').attributes())
      .toHaveProperty('disabled')
    expect(confirmation.get('[data-testid="confirmation-state"]').text())
      .toContain('正在加入购物车，请稍候。')
    confirm.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(addCart).toHaveBeenCalledTimes(1)

    const nonMatchingChoice = recommendationChoice(workspace, '静音计时咖啡秤')
    await nonMatchingChoice!.trigger('click')
    expect(workspace.get('[data-testid="operation-confirmation"]')
      .get('[data-testid="confirmation-state"]').text())
      .toContain('正在加入购物车，请稍候。')

    const newRequest = workspace.findAll('nav button')
      .find((button) => button.text().includes('New request'))!
    ;(newRequest.element as HTMLButtonElement).focus()
    await newRequest.trigger('click')
    expect(workspace.find('[data-testid="operation-result"]').exists()).toBe(false)
    expect(workspace.find('[data-testid="operation-confirmation"]').exists()).toBe(false)

    addGate.resolve()
    await flushPromises()
    await nextTick()

    expect(cartStore.allcount).toBe(1)
    expect(addCart).toHaveBeenCalledTimes(1)
    expect(workspace.find('[data-testid="operation-result"]').exists()).toBe(false)
    expect(workspace.text()).not.toContain('购物车现在有 0 件商品')
    expect(document.activeElement).toBe(newRequest.element)
  })

  it('renders a focused unknown result when a true write settles into review-cart failure', async () => {
    const router = await createTestRouter()
    const agentStore = useAgentStore()
    const cartStore = useCartStore()
    const addGate = deferred<void>()
    const originalAddCart = cartStore.addcart
    const addCart = vi.spyOn(cartStore, 'addcart').mockImplementation(async (item) => {
      await addGate.promise
      await originalAddCart(item)
    })
    const workspace = mount(AgentIndex, {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    vi.useFakeTimers()
    await finishDefaultScenario(agentStore)
    await selectMatchingRecommendation(workspace)
    await workspace.get('button[data-testid="confirm-operation"]').trigger('click')
    await nextTick()
    expect(workspace.get('[data-testid="operation-confirmation"]')
      .get('[data-testid="confirmation-state"]').text())
      .toContain('正在加入购物车，请稍候。')

    agentStore.protocolState = {
      ...agentStore.protocolState,
      pendingConfirmation: null,
    }
    addGate.resolve()
    await flushPromises()
    await nextTick()

    expect(addCart).toHaveBeenCalledTimes(1)
    expect(cartStore.allcount).toBe(1)
    expect(agentStore.stage).toBe('FAILED')
    expect(agentStore.error?.message).toMatch(/review the cart/i)
    const result = workspace.get('[data-testid="operation-result"]')
    expect(result.text()).toContain('购物车结果需要核对')
    expect(result.text()).not.toContain('已加入现有购物车')
    expect(document.activeElement).toBe(result.element)
  })

  it('focuses a known failure result when the guarded store declines before writing', async () => {
    const router = await createTestRouter()
    const agentStore = useAgentStore()
    const cartStore = useCartStore()
    cartStore.cartList.push({
      id: 'mock-dripper-01',
      skuId: 'mock-dripper-01-clear',
      name: 'Existing drippers',
      picture: '/existing.png',
      price: 129,
      count: 99,
      selected: true,
      attrsText: '透明 01 号，含分享壶',
    })
    const addCart = vi.spyOn(cartStore, 'addcart')
    const workspace = mount(AgentIndex, {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    vi.useFakeTimers()
    await finishDefaultScenario(agentStore)
    await selectMatchingRecommendation(workspace)
    await workspace.get('button[data-testid="confirm-operation"]').trigger('click')
    await flushPromises()
    await nextTick()

    const result = workspace.get('[data-testid="operation-result"]')
    expect(result.text()).toContain('未能加入购物车')
    expect(result.text()).not.toContain('购物车结果需要核对')
    expect(document.activeElement).toBe(result.element)
    expect(addCart).not.toHaveBeenCalled()
    expect(cartStore.allcount).toBe(99)
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
    const router = await createTestRouter('/shop/')
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
    expect(header.get('.curr').attributes('href')).toBe('/shop/cartlist')
  })
})
