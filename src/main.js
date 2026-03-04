import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import '@/styles/common.scss'
import { useIntersectionObserver } from '@vueuse/core'
const app = createApp(App)
app.use(createPinia())
app.use(router)

app.mount('#app')


//定义全局指令
app.directive('img-lazy',{
  mounted(el,blinding){
    //el:指令绑定的元素
    //blinding:绑定的属性值
    // console.log(el,blinding.value)
    useIntersectionObserver(
      el,
      ([{isIntersecting}])=>{
        console.log(isIntersecting)
        if(isIntersecting){
          el.src = blinding.value
        }
      },
    )
  }
})
