import httpinstance from '@/utils/http'

export function getbannerapi(){
  return httpinstance({
    url:'/home/banner'
  })
}
