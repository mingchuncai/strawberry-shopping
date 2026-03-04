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
