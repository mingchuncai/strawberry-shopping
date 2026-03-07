import { createRouter, createWebHistory } from 'vue-router'
import login from '@/views/login/LoginIndex.vue'
import layout from '@/views/layout/LayoutIndex.vue'
import home from '@/views/home/HomeIndex.vue'
import category from '@/views/category/CategoryIndex.vue'
import subcategory from '@/views/SubCategory/SubCategoryIndex.vue'
import detail from '@/views/detail/DetailIndex.vue'
import cartlist from '@/views/cartlist/CartListIndex.vue'
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path:'/',
      component:layout,
      children:[
        {
          path:'/',
          component:home
        },
        {
          path:'category/:id',
          component:category
        },
        {
          path:'category/sub/:id',
          component:subcategory
        },
        {
          path:'detail/:id',
          component:detail
        },
        {
          path:'cartlist',
          component:cartlist
        }
      ]
    },
    {
      path:'/login',
      component:login
    }
  ],
  //路由滚动定制
  scrollBehavior(){
    return{
      top:0
    }
  }
})

export default router
