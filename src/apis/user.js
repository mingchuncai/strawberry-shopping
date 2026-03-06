//封装所有和用户有关的接口
import httpinstance from "@/utils/http";

export const loginapi=(account,password) => {
  return httpinstance({
    url:'/login',
    method:'post',
    data:{
      account,
      password
    }
  })
}
