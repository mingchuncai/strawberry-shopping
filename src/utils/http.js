//axios基础封装
import axios from "axios";
import {ElMessage} from 'element-plus'
import 'element-plus/es/components/message/style/css'
import {userStore} from '@/stores/user'
const httpinstance=axios.create({
  baseURL:' http://pcapi-xiaotuxian-front-devtest.itheima.net',
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
  //统一错误提示
  ElMessage(
    {
      type:'error',
      message:e.response.data.message
    }
  )
  return Promise.reject(e)
} )
export default httpinstance
