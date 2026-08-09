import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  loginapi: vi.fn(),
  mergeCartAPI: vi.fn(),
  findNewCartListAPI: vi.fn(),
}))

vi.mock('@/api/user', () => ({ loginapi: api.loginapi }))
vi.mock('@/api/cart', () => ({
  insertCartAPI: vi.fn(),
  findNewCartListAPI: api.findNewCartListAPI,
  deleteCartAPI: vi.fn(),
  updateCartItemAPI: vi.fn(),
  mergeCartAPI: api.mergeCartAPI,
}))
vi.mock('element-plus', () => ({ ElMessage: vi.fn() }))

import { migratePersistedCommerceState, useUserStore } from '@/stores/user'
import { useCartStore } from '@/stores/cart'

describe('user store authentication', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    api.findNewCartListAPI.mockResolvedValue({ result: [] })
  })

  it('rejects a failed login and never creates an authenticated session', async () => {
    api.loginapi.mockRejectedValue(new Error('invalid credentials'))
    const store = useUserStore()

    await expect(
      store.getuserinfo({ account: 'wrong', password: 'wrong-password' }),
    ).rejects.toThrow('invalid credentials')
    expect(store.userInfo).toBeNull()
    expect(api.mergeCartAPI).not.toHaveBeenCalled()
  })

  it('migrates legacy persistence without passwords, errors or malformed cart rows', () => {
    const migrated = migratePersistedCommerceState({
      userInfo: {},
      password: 'must-not-persist',
      authError: { message: 'must-not-persist' },
      cartList: [
        {
          skuId: 'sku-1',
          count: 2,
          selected: true,
          name: '手冲壶',
          picture: '/kettle.png',
          price: 99,
          attrsText: '黑色',
        },
        {
          skuId: 'sku-invalid',
          count: 150,
          selected: true,
          name: '异常商品',
          picture: '/invalid.png',
          price: 1,
          attrsText: '',
        },
      ],
    })

    expect(migrated).toEqual({
      userInfo: null,
      cartList: [expect.objectContaining({ skuId: 'sku-1', count: 2 })],
    })
    expect(migrated).not.toHaveProperty('password')
    expect(migrated).not.toHaveProperty('authError')
  })

  it('preserves the authenticated user and local cart when merge fails', async () => {
    api.loginapi.mockResolvedValue({
      result: { id: 'user-1', account: 'berry', token: 'token-1' },
    })
    api.mergeCartAPI.mockRejectedValue(new Error('merge unavailable'))
    const cart = useCartStore()
    ;(cart.cartList as Array<Record<string, unknown>>).push({
      skuId: 'sku-1',
      count: 2,
      selected: true,
      name: '手冲壶',
      picture: '/kettle.png',
      price: 99,
      attrsText: '静音款',
    })
    const store = useUserStore()

    await expect(
      store.getuserinfo({ account: 'berry', password: 'password' }),
    ).rejects.toThrow('merge unavailable')
    expect(store.userInfo).toMatchObject({ token: 'token-1' })
    expect(cart.cartList).toHaveLength(1)
    expect(api.findNewCartListAPI).not.toHaveBeenCalled()
  })
})
