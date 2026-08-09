import request from './http'
import type { ProductDetail } from '@/types/domain'

export const getdetail = (id: string) =>
  request<ProductDetail>({ url: '/goods', params: { id } })

export const getHotGoodsAPI = ({
  id,
  type,
  limit = 3,
}: {
  id: string
  type?: number
  limit?: number
}) => request<ProductDetail[]>({ url: '/goods/hot', params: { id, type, limit } })
