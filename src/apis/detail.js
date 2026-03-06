import httpinstance from "@/utils/http";

export const getdetail = (id) =>{
  return httpinstance({
    url:'goods',
    params:{
      id
    }
  })
}
