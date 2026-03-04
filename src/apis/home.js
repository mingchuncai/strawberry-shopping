import httpinstance from '@/utils/http'

export function getbannerapi(){
  return httpinstance({
    url:'/home/banner'
  })
}

/**
 * @description: 获取新鲜好物
 * @param {*}
 * @return {*}
 */
export function getnewapi(){
  return httpinstance({
    url:'/home/new'
  })
}

/**
 * @description: 获取人气推荐
 * @param {*}
 * @return {*}
 */
export function gethotapi(){
  return httpinstance({
    url:'/home/hot'
  })
}

/**
 * @description: 获取商品数据
 * @param {*}
 * @return {*}
 */
export const getgoodsapi=()=>{
  return httpinstance({
    url:'/home/goods'
  })
}
