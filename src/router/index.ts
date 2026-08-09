import {
  createRouter,
  createWebHistory,
  type RouterHistory,
  type RouteRecordRaw,
} from 'vue-router'

import { useUserStore } from '@/stores/user'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/views/layout/LayoutIndex.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/home/HomeIndex.vue') },
      {
        path: 'category/:id',
        name: 'category',
        component: () => import('@/views/category/CategoryIndex.vue'),
      },
      {
        path: 'category/sub/:id',
        name: 'subcategory',
        component: () => import('@/views/SubCategory/SubCategoryIndex.vue'),
      },
      {
        path: 'detail/:id',
        name: 'detail',
        component: () => import('@/views/detail/DetailIndex.vue'),
      },
      { path: 'cartlist', name: 'cart', component: () => import('@/views/cartlist/CartListIndex.vue') },
      {
        path: 'checkout',
        name: 'checkout',
        component: () => import('@/views/checkout/CheckOutIndex.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'pay',
        name: 'pay',
        component: () => import('@/views/pay/PayIndex.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },
  { path: '/login', name: 'login', component: () => import('@/views/login/LoginIndex.vue') },
  {
    path: '/paycallback',
    name: 'pay-callback',
    component: () => import('@/views/pay/PayCallbackIndex.vue'),
  },
  {
    path: '/agent',
    name: 'agent',
    redirect: { name: 'home' },
    meta: { agentWorkspacePending: true },
  },
]

export const getSafeRedirect = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'

export const createAppRouter = (history: RouterHistory = createWebHistory(import.meta.env.BASE_URL)) => {
  const router = createRouter({
    history,
    routes,
    scrollBehavior: () => ({ top: 0 }),
  })

  router.beforeEach((to) => {
    if (to.meta.requiresAuth && !useUserStore().userInfo?.token) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    return true
  })

  return router
}

export default createAppRouter()
