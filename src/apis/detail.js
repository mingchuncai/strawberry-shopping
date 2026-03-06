import httpinstance from "@/utils/http";

export const getdetail = (id) =>{
  return httpinstance({
    url:'goods',
    params:{
      id
    }
  })
}

export const getHotGoodsAPI=(id,type,limit = 3)=>{
  return httpinstance({
    url:'/goods/hot',
    params:{
      id,
      type,
      limit
    }
  })
}
