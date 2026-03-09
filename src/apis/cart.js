// 封装购物车相关接口
import request from '@/utils/http'

// 加入购物车
export const insertcartapi = ({ skuId, count }) => {
  return request({
    url: '/member/cart',
    method: 'POST',
    data: {
      skuId,
      count
    }
  })
}

// 获取最新的购物车列表
export const findNewCartListAPI = () => {
  return request({
    url: '/member/cart'
  })
}

// 删除购物车
export const delCartAPI = (ids) => {
  return request({
    url: '/member/cart',
    method: 'DELETE',
    data: {
      ids
    }
  })
}

// 合并购物车

export const mergeCartAPI = (data) => {
  return request({
    url: '/member/cart/merge',
    method: 'POST',
    data
  })
}

export const delcartapi=(ids)=>{
  return request({
    url:'/member/cart',
    method:'DELETE',
    data:{
      ids
    }
  })
}

//合并购物车接口
export const mergecartapi=(data)=>{
  return request({
    url:'/member/cart/merge',
    method:'POST',
    data
  })
}
