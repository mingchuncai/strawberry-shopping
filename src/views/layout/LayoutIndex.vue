<script setup>
import layoutnav from './components/LayoutNav.vue';
import layoutfooter from './components/LayoutFooter.vue';
import layoutheader from './components/LayoutHeader.vue';
import layoutfixed from './components/LayoutFixed.vue';
import { categoryStore } from '@/stores/category';
import { onMounted } from 'vue';
const CategoryStore = categoryStore()

onMounted(()=>{
  CategoryStore.getCategory()
})
</script>

<template>
  <!-- <div>我是首页</div> -->
  <!-- 二级路由出口 -->
   <layoutfixed/>
   <layoutnav/>
   <layoutheader/>
   <!--添加key 破坏复用机制 强制销毁重建-->
   <!-- <RouterView :key="$route.fullPath"/> -->
    <RouterView/>
   <layoutfooter/>
</template>
 <style></style>
