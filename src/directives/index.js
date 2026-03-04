//定义懒加载插件
import { useIntersectionObserver } from '@vueuse/core'
export const lazyPlugin = {
  install(app) {
    //懒加载指令逻辑
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
          stop()
        }
      },
    )
  }
})
}
}
