import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniapluginpersistedstate from 'pinia-plugin-persistedstate'


import App from './App.vue'
import router from './router'
import '@/styles/common.scss'
//引入懒加载插件并注册
import { componentPlugin } from '@/components'
import {lazyPlugin }from '@/directives'
const app = createApp(App)
const pinia = createPinia()
pinia.use(piniapluginpersistedstate)
app.use(pinia)
app.use(router)
app.use(lazyPlugin)
app.use(componentPlugin)
app.mount('#app')



