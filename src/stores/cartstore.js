//封装购物车模块
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usecartstore=defineStore('cart',()=>{
  //state
  const cartList = ref([])
  //action
  const addcart=(goods)=>{
    const item=cartList.value.find((item)=>goods.skuId===item.skuId)
    if(!item){
      cartList.value.push(goods)
  }else{
    item.count++
  }
}
const deletecart=(skuId)=>{
  const idx=cartList.value.findIndex((item)=>skuId===item.skuId)
  cartList.value.splice(idx,1)
}
  return {cartList,addcart,deletecart}
},
{
  persist:true
}
)
