//axios基础封装
import axios from "axios";
import {ElMessage} from 'element-plus'
import 'element-plus/es/components/message/style/css'
const httpinstance=axios.create({
  baseURL:' http://pcapi-xiaotuxian-front-devtest.itheima.net',
  timeout:5000
})


//拦截器
//axios请求拦截器
httpinstance.interceptors.request.use(config=>{
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
