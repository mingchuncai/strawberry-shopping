import httpinstance from "@/utils/http";
export function getcategory(){
  return httpinstance({
    url:'/users'
  })
}
