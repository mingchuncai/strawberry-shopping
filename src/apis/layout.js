import httpinstance from "@/utils/http";
export function getCategoryAPI(){
  return httpinstance({
    url:'/home/category/head'
  })
}
