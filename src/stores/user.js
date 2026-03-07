//管理用户类数据相关
import { ref } from "vue"
import { defineStore } from "pinia"
import { loginapi } from "@/apis/user"

export const userStore=defineStore('user',()=>{
  //define state
  const userInfo = ref({})


  //退出时清除用户信息
  const clearuserinfo=()=>{
    userInfo.value={}
  }
  //define action
  const getuserinfo=async({account,password})=>{
    const res=await loginapi(account,password)
    userInfo.value=res.result
  }
  return {userInfo,getuserinfo,clearuserinfo}
},{
  persist:true
}
)
