import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  loginapi: vi.fn(),
  mergeCartAPI: vi.fn(),
  findNewCartListAPI: vi.fn(),
}))

vi.mock('@/apis/user', () => ({ loginapi: api.loginapi }))
vi.mock('@/apis/cart', () => ({
  insertCartAPI: vi.fn(),
  findNewCartListAPI: api.findNewCartListAPI,
  deleteCartAPI: vi.fn(),
  updateCartItemAPI: vi.fn(),
  mergeCartAPI: api.mergeCartAPI,
}))
vi.mock('element-plus', () => ({ ElMessage: vi.fn() }))

import { userStore } from '@/stores/user'
import { usecartstore } from '@/stores/cartstore'

describe('user store authentication', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.findNewCartListAPI.mockResolvedValue({ result: [] })
  })

  it('rejects a failed login and never creates an authenticated session', async () => {
    api.loginapi.mockRejectedValue(new Error('invalid credentials'))
    const store = userStore()

    await expect(
      store.getuserinfo({ account: 'wrong', password: 'wrong-password' }),
    ).rejects.toThrow('invalid credentials')
    expect(store.userInfo).toEqual({})
    expect(api.mergeCartAPI).not.toHaveBeenCalled()
  })

  it('preserves the authenticated user and local cart when merge fails', async () => {
    api.loginapi.mockResolvedValue({
      result: { id: 'user-1', account: 'berry', token: 'token-1' },
    })
    api.mergeCartAPI.mockRejectedValue(new Error('merge unavailable'))
    const cart = usecartstore()
    ;(cart.cartList as Array<Record<string, unknown>>).push({
      skuId: 'sku-1',
      count: 2,
      selected: true,
      name: '手冲壶',
      picture: '/kettle.png',
      price: 99,
      attrsText: '静音款',
    })
    const store = userStore()

    await expect(
      store.getuserinfo({ account: 'berry', password: 'password' }),
    ).rejects.toThrow('merge unavailable')
    expect(store.userInfo).toMatchObject({ token: 'token-1' })
    expect(cart.cartList).toHaveLength(1)
    expect(api.findNewCartListAPI).not.toHaveBeenCalled()
  })
})
