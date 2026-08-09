import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  insertCartAPI: vi.fn(),
  findNewCartListAPI: vi.fn(),
  deleteCartAPI: vi.fn(),
  updateCartItemAPI: vi.fn(),
  mergeCartAPI: vi.fn(),
}))

vi.mock('@/apis/cart', () => api)
vi.mock('@/apis/user', () => ({ loginapi: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: vi.fn() }))

import { usecartstore } from '@/stores/cartstore'
import { userStore } from '@/stores/user'

const item = (overrides = {}) => ({
  skuId: 'sku-1',
  count: 2,
  selected: true,
  name: '静音手冲壶',
  picture: '/kettle.png',
  price: 99,
  attrsText: '黑色',
  ...overrides,
})

describe('cart store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.findNewCartListAPI.mockResolvedValue({ result: [item()] })
  })

  it('adds the requested count for a duplicate guest SKU', async () => {
    const cart = usecartstore()
    const cartList = cart.cartList as Array<ReturnType<typeof item>>
    await cart.addcart(item({ count: 2 }) as never)
    await cart.addcart(item({ count: 3 }) as never)

    expect(cartList).toHaveLength(1)
    expect(cartList[0].count).toBe(5)
  })

  it('does not report an empty cart as all selected', () => {
    expect(usecartstore().isall).toBe(false)
  })

  it('treats deleting a missing guest SKU as a no-op', async () => {
    const cart = usecartstore()
    const cartList = cart.cartList as Array<ReturnType<typeof item>>
    cartList.push(item(), item({ skuId: 'sku-2' }))

    await cart.delcart('missing')

    expect(cartList.map((entry) => entry.skuId)).toEqual(['sku-1', 'sku-2'])
  })

  it('persists authenticated selection, count and deletion by skuId', async () => {
    userStore().userInfo = { id: 'user-1', account: 'berry', token: 'token-1' }
    const cart = usecartstore()
    ;(cart.cartList as Array<ReturnType<typeof item>>).push(item())

    await cart.setSelected('sku-1', false)
    await cart.setCount('sku-1', 4)
    await cart.delcart('sku-1')

    expect(api.updateCartItemAPI).toHaveBeenNthCalledWith(1, 'sku-1', {
      selected: false,
      count: 2,
    })
    expect(api.updateCartItemAPI).toHaveBeenNthCalledWith(2, 'sku-1', {
      selected: false,
      count: 4,
    })
    expect(api.deleteCartAPI).toHaveBeenCalledWith(['sku-1'])
  })
})
