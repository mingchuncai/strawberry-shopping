<script setup>
import HomeCategory from './components/HomeCategory.vue';
import HomeBanner from './components/HomeBanner.vue';
import HomeProduct from './components/HomeProduct.vue';
import HomeHot from './components/HomeHot.vue';
import HomeNew from './components/HomeNew.vue';
import HomePanel from './components/HomePanel.vue';
</script>

<template>
  <div class="container">
    <HomeCategory/>
    <HomeBanner/>
  </div>
  <HomeNew/>
  <HomeHot/>
  <HomeProduct/>

  <!-- test-->
  <HomePanel title="新鲜好物" subtitle="新鲜好物 好多商品">
    <div>
      这是新鲜好物内部
    </div>
  </HomePanel>
  <HomePanel title="人气推荐" subtitle="人气推荐 好多商品">
    <div>
      这是人气推荐内部
    </div>
  </HomePanel>
</template>
