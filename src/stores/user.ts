import { defineStore } from 'pinia'
import { ref } from 'vue'

import { mergeCartAPI } from '@/api/cart'
import { loginapi } from '@/api/user'
import type { CartItem, UserSession } from '@/types/domain'
import { useCartStore } from './cart'

export interface PersistedCommerceState {
  userInfo: UserSession | null
  cartList: CartItem[]
}

const isUserSession = (value: unknown): value is UserSession => {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<UserSession>
  return Boolean(session.id && session.account && session.token)
}

const isCartItem = (value: unknown): value is CartItem => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CartItem>
  return Boolean(
    item.skuId &&
      item.name &&
      item.picture &&
      item.attrsText !== undefined &&
      typeof item.price === 'number' &&
      Number.isFinite(item.price) &&
      typeof item.count === 'number' &&
      item.count > 0 &&
      item.count <= 99 &&
      typeof item.selected === 'boolean',
  )
}

export const migratePersistedCommerceState = (value: unknown): PersistedCommerceState => {
  const state = value && typeof value === 'object'
    ? (value as { userInfo?: unknown; cartList?: unknown })
    : {}
  return {
    userInfo: isUserSession(state.userInfo) ? state.userInfo : null,
    cartList: Array.isArray(state.cartList) ? state.cartList.filter(isCartItem) : [],
  }
}

export const useUserStore = defineStore(
  'user',
  () => {
    const cartStore = useCartStore()
    const userInfo = ref<UserSession | null>(null)
    const authError = ref<unknown>(null)
    const cartSyncError = ref<unknown>(null)

    const clearuserinfo = () => {
      userInfo.value = null
      authError.value = null
      cartSyncError.value = null
      cartStore.clearcart()
    }

    const getuserinfo = async ({ account, password }: { account: string; password: string }) => {
      authError.value = null
      cartSyncError.value = null

      let session: UserSession
      try {
        const response = await loginapi(account, password)
        if (!response.result?.token) throw new Error('登录失败：未获取到用户信息')
        session = response.result
      } catch (error) {
        authError.value = error
        throw error
      }

      userInfo.value = session
      const localCart = [...cartStore.cartList]
      if (localCart.length > 0) {
        try {
          await mergeCartAPI(localCart.map(({ skuId, selected, count }) => ({
            skuId,
            selected,
            count,
          })))
        } catch (error) {
          cartSyncError.value = error
          throw error
        }
        cartStore.clearcart()
      }

      await cartStore.updatenewlist()
      return session
    }

    return { userInfo, authError, cartSyncError, getuserinfo, clearuserinfo }
  },
  {
    persist: {
      pick: ['userInfo'],
      afterHydrate: ({ store }) => {
        store.userInfo = migratePersistedCommerceState({ userInfo: store.userInfo }).userInfo
      },
    },
  },
)
