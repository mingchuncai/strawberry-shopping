// //管理用户类数据相关
// import { ref } from "vue"
// import { defineStore } from "pinia"
// import { loginapi } from "@/apis/user"
// import {usecartstore} from "./cartstore"
// import {mergecartapi} from "@/apis/cart"

// export const userStore=defineStore('user',()=>{
//   const cartstore=usecartstore()
//   //define state
//   const userInfo = ref({})


//   //退出时清除用户信息
//   const clearuserinfo=()=>{
//     userInfo.value={}
//     cartstore.clearcart()
//   }
//   //define action
//   const getuserinfo=async({account,password})=>{
//     const res=await loginapi(account,password)
//     userInfo.value=res.result

//   //合并购物车操作
//   await mergecartapi(cartstore.cartList.map(item=>{
//     return {
//       skuId:item.skuId,
//       selected:item.selected,
//       count:item.count
//     }
//   }))
//   await cartstore.updatenewlist()
// }
//   return {userInfo,getuserinfo,clearuserinfo}
// },{
//   persist:true
// }
// )
//管理用户类数据相关
import { ref } from "vue"
import { defineStore } from "pinia"
import { loginapi } from "@/apis/user"
import { usecartstore } from "./cartstore"
import { mergecartapi } from "@/apis/cart"
import { ElMessage } from 'element-plus' // 导入提示组件

export const userStore = defineStore('user', () => {
  const cartstore = usecartstore()
  //define state
  const userInfo = ref({})

  //退出时清除用户信息
  const clearuserinfo = () => {
    userInfo.value = {}
    cartstore.clearcart()
  }

  //define action
  const getuserinfo = async ({ account, password }) => {
    try { // 统一捕获所有异常
      // 1. 登录接口（核心：先确保登录成功，再合并购物车）
      const res = await loginapi(account, password)
      if (!res || !res.result || !res.result.token) {
        throw new Error('登录失败：未获取到用户信息')
      }
      userInfo.value = res.result

      // 2. 合并购物车：仅当本地有数据时才调用接口
      const localCartList = cartstore.cartList
      if (localCartList.length > 0) {
        // 构造合并参数：补全缺失字段，避免接口校验失败
        const mergeData = localCartList.map(item => ({
          skuId: item.skuId,
          selected: item.selected ?? true, // 补全默认值，避免undefined
          count: item.count || 1 // 确保count是有效数字
        }))
        // 调用合并接口
        const mergeRes = await mergecartapi(mergeData)
        console.log('购物车合并结果：', mergeRes) // 调试用，查看合并是否成功

        // 3. 合并后清空本地旧数据（关键：避免覆盖服务器数据）
        cartstore.clearcart()
      }

      // 4. 拉取合并后的最新购物车列表
      await cartstore.updatenewlist()

    } catch (error) {
      // 捕获所有异常，给出提示
      console.error('登录/合并购物车失败：', error)
      ElMessage({
        type: 'error',
        message: '登录成功，但购物车合并失败，请手动刷新'
      })
      // 即使合并失败，也保证登录态正常（仅提示，不中断）
    }
  }

  return { userInfo, getuserinfo, clearuserinfo }
}, {
  persist: true
})
