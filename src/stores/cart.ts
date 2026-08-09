import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  deleteCartAPI,
  findNewCartListAPI,
  insertCartAPI,
  updateCartItemAPI,
} from '@/api/cart'
import type { CartItem } from '@/types/domain'
import { migratePersistedCommerceState, useUserStore } from './user'

const boundedCount = (count: number) => Math.min(99, Math.max(1, Math.trunc(count)))

export const useCartStore = defineStore(
  'cart',
  () => {
    const userStore = useUserStore()
    const isLoggedIn = computed(() => Boolean(userStore.userInfo?.token))
    const cartList = ref<CartItem[]>([])

    const updatenewlist = async () => {
      const response = await findNewCartListAPI()
      cartList.value = response.result
    }

    const addcart = async (goods: CartItem) => {
      if (isLoggedIn.value) {
        await insertCartAPI({ skuId: goods.skuId, count: boundedCount(goods.count) })
        await updatenewlist()
        return
      }
      const item = cartList.value.find(({ skuId }) => skuId === goods.skuId)
      if (item) item.count = boundedCount(item.count + goods.count)
      else cartList.value.push({ ...goods, count: boundedCount(goods.count) })
    }

    const delcart = async (skuId: string) => {
      if (isLoggedIn.value) {
        await deleteCartAPI([skuId])
        await updatenewlist()
        return
      }
      const index = cartList.value.findIndex((item) => item.skuId === skuId)
      if (index > -1) cartList.value.splice(index, 1)
    }

    const clearcart = () => {
      cartList.value = []
    }

    const setSelected = async (skuId: string, selected: boolean) => {
      const item = cartList.value.find((entry) => entry.skuId === skuId)
      if (!item) return
      item.selected = selected
      if (isLoggedIn.value) {
        await updateCartItemAPI(skuId, { count: item.count, selected })
      }
    }

    const setCount = async (skuId: string, count: number) => {
      const item = cartList.value.find((entry) => entry.skuId === skuId)
      if (!item) return
      item.count = boundedCount(count)
      if (isLoggedIn.value) {
        await updateCartItemAPI(skuId, { count: item.count, selected: item.selected })
      }
    }

    const allcount = computed(() => cartList.value.reduce((sum, item) => sum + item.count, 0))
    const allprice = computed(() => cartList.value.reduce(
      (sum, item) => sum + item.count * item.price,
      0,
    ))
    const isall = computed(() => cartList.value.length > 0 && cartList.value.every(
      (item) => item.selected,
    ))
    const selectedCount = computed(() => cartList.value.filter(
      (item) => item.selected,
    ).reduce((sum, item) => sum + item.count, 0))
    const selectedPrice = computed(() => cartList.value.filter(
      (item) => item.selected,
    ).reduce((sum, item) => sum + item.count * item.price, 0))

    const allcheckcmc = async (selected: boolean) => {
      await Promise.all(cartList.value.map((item) => setSelected(item.skuId, selected)))
    }

    return {
      cartList,
      addcart,
      allcount,
      allprice,
      isall,
      allcheckcmc,
      selectedCount,
      selectedPrice,
      delcart,
      clearcart,
      updatenewlist,
      setSelected,
      setCount,
    }
  },
  {
    persist: {
      pick: ['cartList'],
      afterHydrate: ({ store }) => {
        store.cartList = migratePersistedCommerceState({ cartList: store.cartList }).cartList
      },
    },
  },
)
