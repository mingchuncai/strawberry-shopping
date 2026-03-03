<script setup>
import layoutnav from './components/LayoutNav.vue';
import layoutfooter from './components/LayoutFooter.vue';
import layoutheader from './components/LayoutHeader.vue';
import layoutfixed from './components/LayoutFixed.vue';
</script>

<template>
  <!-- <div>我是首页</div> -->
  <!-- 二级路由出口 -->
   <layoutfixed/>
   <layoutnav/>
   <layoutheader/>
   <RouterView/>
   <layoutfooter/>
</template>
 <style></style>
