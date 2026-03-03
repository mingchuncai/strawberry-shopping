import { ref} from 'vue'
import { defineStore } from 'pinia'
import { getCategoryAPI } from '@/apis/layout';
export const categoryStore = defineStore('category', () => {
  const categorylist = ref([])
  const getCategory = async() => {
    const res = await getCategoryAPI()
    categorylist.value = res.result
}


  return { categorylist,getCategory }
})
