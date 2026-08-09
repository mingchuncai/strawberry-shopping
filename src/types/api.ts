export interface ApiResponse<T> {
  code: string
  msg: string
  result: T
}

export type AppErrorCode =
  | 'NETWORK_ERROR'
  | 'UNAUTHORIZED'
  | 'TIMEOUT'
  | 'API_ERROR'
  | 'UNKNOWN'

export interface AppError {
  code: AppErrorCode
  message: string
  status?: number
  recoverable: boolean
  cause?: unknown
}
