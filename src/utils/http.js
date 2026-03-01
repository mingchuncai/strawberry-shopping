//axios基础封装
import axios from "axios";
const httpinstance=axios.create({
  baseURL:'https://jsonplaceholder.typicode.com',
  timeout:5000
})


//拦截器
//axios请求拦截器
httpinstance.interceptors.request.use(config=>{
  return config
} ,e=>Promise.reject(e))
//axios响应式拦截器
httpinstance.interceptors.response.use(res=>res.data,e=>{
  return Promise.reject(e)
} )
export default httpinstance
