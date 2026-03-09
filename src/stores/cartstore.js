//封装购物车模块
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {userStore} from './user'
import {insertcartapi,findNewCartListAPI,delcartapi} from '@/apis/cart'
export const usecartstore=defineStore('cart',()=>{
  const userstore=userStore()
  const islogin=computed(()=>userstore.userInfo.token)
  //state
  const cartList = ref([])
  //获取最新购物车列表
  const updatenewlist=async()=>{
    const res=await findNewCartListAPI()
    cartList.value=res.result
  }
  //action
  const addcart=async(goods)=>{
    const {skuId,count}=goods
    if(islogin.value){
      await insertcartapi({skuId,count})
      updatenewlist()
    }else{
      const item=cartList.value.find((item)=>goods.skuId===item.skuId)
    if(!item){
      cartList.value.push(goods)
  }else{
    item.count++
  }
    }

}
//删除
const delcart=async(skuId)=>{
  if(islogin.value){
    // 登录态：调用后端接口+刷新列表
    await delcartapi([skuId])
    await updatenewlist() // 加await，确保列表刷新完成
  }else{
    // 未登录态：修正find→findIndex，且校验索引有效性
    const idx=cartList.value.findIndex((item)=>skuId===item.skuId)
    if(idx > -1){ // 避免索引为-1（没找到）时报错
      cartList.value.splice(idx,1)
    }
  }
}


const deletecart=(skuId)=>{
  const idx=cartList.value.findIndex((item)=>skuId===item.skuId)
  cartList.value.splice(idx,1)
}

//退出登录，清除购物车
const clearcart=()=>{
  cartList.value=[]
}
//单选
const singleCheckcmc =(skuId,selected)=>{
  const item=cartList.value.find((item)=>item.skuId===skuId)
  item.selected=selected
}
//caculate
//count
const allcount=computed(()=>cartList.value.reduce((a,c)=>a+c.count,0))
const allprice=computed(()=>cartList.value.reduce((a,c)=>a+c.count*c.price,0))
//是否呈现
const isall=computed(()=>
  cartList.value.every((item)=>item.selected)
)
//全选
const allcheckcmc=(selected)=>{
  cartList.value.forEach((item)=>item.selected=selected)
}
//caculate selected
const selectedCount=computed(()=>cartList.value.filter((item)=>item.selected).reduce((a,c)=>a+c.count,0))
const selectedPrice=computed(()=>cartList.value.filter((item)=>item.selected).reduce((a,c)=>a+c.count*c.price,0))

return {
  cartList,addcart,deletecart,allcount,allprice,singleCheckcmc,isall,allcheckcmc,selectedCount,selectedPrice,delcart,clearcart,updatenewlist}
},
{
  persist:true
}
)
