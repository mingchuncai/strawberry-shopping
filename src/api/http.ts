import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'

import router from '@/router'
import { userStore } from '@/stores/user'
import type { ApiResponse, AppError, AppErrorCode } from '@/types/api'
import type { UserSession } from '@/types/domain'

const DEVELOPMENT_API_URL = 'http://pcapi-xiaotuxian-front-devtest.itheima.net'

const httpInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || DEVELOPMENT_API_URL,
  timeout: 5000,
})

export const normalizeAppError = (cause: unknown): AppError => {
  const error = cause as AxiosError<{ message?: string }>
  const status = error.response?.status
  let code: AppErrorCode = 'UNKNOWN'
  if (status === 401) code = 'UNAUTHORIZED'
  else if (error.code === 'ECONNABORTED') code = 'TIMEOUT'
  else if (!error.response) code = 'NETWORK_ERROR'
  else if (error.response) code = 'API_ERROR'

  return {
    code,
    message: error.response?.data?.message || error.message || '网络请求失败',
    status,
    recoverable: code !== 'UNAUTHORIZED',
    cause,
  }
}

httpInstance.interceptors.request.use((config) => {
  const token = (userStore().userInfo as Partial<UserSession>)?.token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

httpInstance.interceptors.response.use(
  (response) => response.data,
  (cause) => {
    const error = normalizeAppError(cause)
    ElMessage({ type: 'error', message: error.message })
    if (error.code === 'UNAUTHORIZED') {
      const redirect = router.currentRoute.value.fullPath
      userStore().clearuserinfo()
      void router.push({ path: '/login', query: { redirect } })
    }
    return Promise.reject(error)
  },
)

const request = <T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> =>
  httpInstance.request(config) as unknown as Promise<ApiResponse<T>>

export { httpInstance }
export default request
