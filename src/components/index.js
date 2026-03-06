//将component内所有组件进行全局化注册-插件方式
import imageview from '@/components/ImageView/ImageViewIndex.vue'
import sku from '@/components/XtxSku/index.vue'

export const componentPlugin={
  install(app){
    app.component('XtxImageView',imageview)
    app.component('XtxSku',sku)
  }
}
