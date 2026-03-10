import request from '@/utils/http'

export const getcheckinfoapi = () =>{
  return request({
    url:'/member/order/pre'
  })
}


//create order
export const createorderapi=(data)=>{
  return request({
    url:'/member/order',
    method:'POST',
    data
  })
}
