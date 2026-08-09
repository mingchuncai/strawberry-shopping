import request from './http'
import type { UserSession } from '@/types/domain'

export const loginapi = (account: string, password: string) =>
  request<UserSession>({
    url: '/login',
    method: 'POST',
    data: { account, password },
  })
