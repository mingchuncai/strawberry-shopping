//封装分类相应代码
import { onBeforeRouteUpdate } from 'vue-router'
import { getCategoryapi } from '@/apis/category'
import { useRoute } from 'vue-router'
import { onMounted,ref } from 'vue'
export function useCategory(){

const categoryData = ref({})
const route = useRoute()
const getCategory = async(id=route.params.id) => {
  const res = await getCategoryapi(id)
  categoryData.value = res.result
}
onMounted(() => {
  getCategory()
})
onBeforeRouteUpdate((to) => {
  getCategory(to.params.id)
})

return {
  categoryData,
  getCategory
}
}
