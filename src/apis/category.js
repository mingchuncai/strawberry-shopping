import request from "@/utils/http"

export function getCategoryapi(id) {
  return request({
    url: '/category',
    params:{
      id
    }
  })
}
