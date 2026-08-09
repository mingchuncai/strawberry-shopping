import request from './http'
import type { CartItem } from '@/types/domain'

export interface CartMutation {
  skuId: string
  count: number
  selected?: boolean
}

export const insertCartAPI = ({ skuId, count }: CartMutation) =>
  request<null>({ url: '/member/cart', method: 'POST', data: { skuId, count } })

export const findNewCartListAPI = () =>
  request<CartItem[]>({ url: '/member/cart' })

export const deleteCartAPI = (ids: string[]) =>
  request<null>({ url: '/member/cart', method: 'DELETE', data: { ids } })

export const mergeCartAPI = (data: CartMutation[]) =>
  request<null>({ url: '/member/cart/merge', method: 'POST', data })

export const updateCartItemAPI = (
  skuId: string,
  data: Pick<CartMutation, 'count' | 'selected'>,
) => request<null>({ url: `/member/cart/${skuId}`, method: 'PUT', data })
