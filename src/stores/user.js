//管理用户类数据相关
import { ref } from "vue"
import { defineStore } from "pinia"
import { loginapi } from "@/api/user"
import { usecartstore } from "./cartstore"
import { mergeCartAPI } from "@/api/cart"

export const userStore = defineStore('user', () => {
  const cartstore = usecartstore()
  const userInfo = ref({})
  const authError = ref(null)
  const cartSyncError = ref(null)

  //退出时清除用户信息
  const clearuserinfo = () => {
    userInfo.value = {}
    authError.value = null
    cartSyncError.value = null
    cartstore.clearcart()
  }

  //define action
  const getuserinfo = async ({ account, password }) => {
    authError.value = null
    cartSyncError.value = null

    let session
    try {
      const res = await loginapi(account, password)
      if (!res?.result?.token) throw new Error('登录失败：未获取到用户信息')
      session = res.result
    } catch (error) {
      authError.value = error
      throw error
    }

    userInfo.value = session
    const localCartList = [...cartstore.cartList]
    if (localCartList.length > 0) {
      try {
        await mergeCartAPI(localCartList.map(item => ({
          skuId: item.skuId,
          selected: item.selected ?? true,
          count: item.count || 1
        })))
      } catch (error) {
        cartSyncError.value = error
        throw error
      }
      cartstore.clearcart()
    }

    await cartstore.updatenewlist()
    return session
  }

  return { userInfo, authError, cartSyncError, getuserinfo, clearuserinfo }
}, {
  persist: true
})
