import request from '@/utils/http'

export const getcheckinfoapi = () =>{
  return request({
    url:'/member/order/pre'
  })
}
