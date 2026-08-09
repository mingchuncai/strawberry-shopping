import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const auth = vi.hoisted(() => ({ userInfo: null as null | { token: string } }))
vi.mock('@/stores/user', () => ({ useUserStore: () => auth }))
vi.mock('@/views/login/LoginIndex.vue', () => ({
  default: { template: '<div>login</div>' },
}))

import { createAppRouter, routes } from '@/router'

describe('application routes', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    auth.userInfo = null
  })

  it('lazy loads every implemented page component', () => {
    const pageRecords = routes.flatMap((route) => [route, ...(route.children ?? [])])
      .filter((route) => route.component)

    expect(pageRecords.length).toBeGreaterThan(0)
    expect(pageRecords.every((route) => typeof route.component === 'function')).toBe(true)
  })

  it.each(['/checkout?coupon=berry', '/pay?id=order-1'])(
    'redirects unauthenticated access to login with the full path: %s',
    async (path) => {
      const router = createAppRouter(createMemoryHistory())
      await router.push(path)
      await router.isReady()

      expect(router.currentRoute.value.name).toBe('login')
      expect(router.currentRoute.value.query.redirect).toBe(path)
    },
  )

  it('keeps payment callback and the agent route boundary public', async () => {
    const router = createAppRouter(createMemoryHistory())

    expect(router.resolve('/paycallback?result=pending').matched.some(
      (record) => record.meta.requiresAuth,
    )).toBe(false)
    expect(router.resolve('/agent').name).toBe('agent')
    expect(router.resolve('/agent').matched.some((record) => record.meta.requiresAuth)).toBe(false)
  })
})
