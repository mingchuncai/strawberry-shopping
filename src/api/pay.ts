import request from './http'

export interface OrderSummary {
  id: string
  payMoney: number
  countdown: number
  [key: string]: unknown
}

export const getorderapi = (id: string) =>
  request<OrderSummary>({ url: `/member/order/${id}` })
