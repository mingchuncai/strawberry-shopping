import request from '@/utils/http'

export const getorderapi = (id) =>{
  return request({
    url: `/member/order/${id}`
  })
}
