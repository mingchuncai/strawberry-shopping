<script setup>
import layoutnav from './components/LayoutNav.vue';
import LayoutFooter from './components/LayoutFooter.vue';
import layoutheader from './components/LayoutHeader.vue';
</script>

<template>
  <!-- <div>我是首页</div> -->
  <!-- 二级路由出口 -->
   <layoutnav/>
   <layoutheader/>
   <RouterView/>
   <LayoutFooter/>
</template>
 <style></style>
