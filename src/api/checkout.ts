import request from './http'
import type { CheckoutPreview } from '@/types/domain'

export interface CreateOrderInput {
  deliveryTimeType: number
  payType: number
  payChannel: number
  buyerMessage: string
  goods: Array<{ skuId: string; count: number }>
  addressId: string
}

export const getcheckinfoapi = () =>
  request<CheckoutPreview>({ url: '/member/order/pre' })

export const createorderapi = (data: CreateOrderInput) =>
  request<{ id: string }>({ url: '/member/order', method: 'POST', data })
