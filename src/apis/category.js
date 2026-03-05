import request from "@/utils/http"

export function getCategoryapi(id) {
  return request({
    url: '/category',
    params:{
      id
    }
  })
}

/**
 * @description:获取二级分类列表数据
 * @param {*}  id 分类id
 * @return {*}
*/
export function getCategoryFilterapi(id){
  return request({
    url:'/category/sub/filter',
    params:{
      id
    }
  })
}
