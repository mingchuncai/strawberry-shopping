//封装轮播图相应代码
import { getbannerapi } from '@/apis/home'
import { onMounted,ref } from 'vue'
export function useBanner(){
  const bannerlist=ref([])
  const getbanner=(async ()=>{
  const res = await getbannerapi({ distributionSite: '2' })
  bannerlist.value = res.result
})
onMounted(() => {
  getbanner()
})

return {
  bannerlist,
  getbanner
}
}


