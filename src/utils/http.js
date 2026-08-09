//axios基础封装
import axios from "axios";
import {ElMessage} from 'element-plus'
import 'element-plus/es/components/message/style/css'
import {userStore} from '@/stores/user'
import router from "@/router";

const httpinstance=axios.create({
  baseURL:'http://pcapi-xiaotuxian-front-devtest.itheima.net',
  timeout:5000
})


//拦截器
//axios请求拦截器
httpinstance.interceptors.request.use(config=>{
  //1.从pinia get token
  const userstore=userStore()
  //2.拼接token
  const token=userstore.userInfo.token
  if(token){
    config.headers.Authorization=`Bearer ${token}`
  }
  return config
} ,e=>Promise.reject(e))
//axios响应式拦截器
httpinstance.interceptors.response.use(res=>res.data,e=>{
  const status=e.response?.status
  const message=e.response?.data?.message || e.message || '网络请求失败'
  const error={
    code:status===401 ? 'UNAUTHORIZED' : e.response ? 'API_ERROR' : 'NETWORK_ERROR',
    message,
    status,
    recoverable:status!==401,
    cause:e
  }
  ElMessage({type:'error',message})
  //401
  //清除本地数据
  //跳转登录页
  if(status===401){
    userStore().clearuserinfo()
    router.push({
      path:'/login',
      query:{redirect:router.currentRoute.value.fullPath}
    })
  }
  return Promise.reject(error)
} )
export default httpinstance
