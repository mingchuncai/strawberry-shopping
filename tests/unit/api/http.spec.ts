import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const router = vi.hoisted(() => ({
  push: vi.fn(),
  currentRoute: { value: { fullPath: '/checkout?coupon=berry' } },
}))
const message = vi.hoisted(() => vi.fn())

vi.mock('@/router', () => ({ default: router }))
vi.mock('element-plus', () => ({ ElMessage: message }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))
vi.mock('@/apis/user', () => ({ loginapi: vi.fn() }))
vi.mock('@/apis/cart', () => ({
  insertCartAPI: vi.fn(),
  findNewCartListAPI: vi.fn(),
  deleteCartAPI: vi.fn(),
  updateCartItemAPI: vi.fn(),
  mergeCartAPI: vi.fn(),
}))

import http from '@/utils/http'
import { userStore } from '@/stores/user'

describe('HTTP error handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('normalizes a network error without dereferencing a missing response', async () => {
    const request = http.get('/offline', {
      adapter: async () => Promise.reject({ message: 'offline', request: {} }),
    })

    await expect(request).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'offline',
      recoverable: true,
    })
  })

  it('preserves the full requested route when redirecting after a 401', async () => {
    userStore().userInfo = { token: 'expired' }
    const request = http.get('/protected', {
      adapter: async () =>
        Promise.reject({
          message: 'unauthorized',
          response: { status: 401, data: { message: '请重新登录' } },
        }),
    })

    await expect(request).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(userStore().userInfo).toEqual({})
    expect(router.push).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/checkout?coupon=berry' },
    })
  })
})
