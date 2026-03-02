<script setup>
import { RouterView } from 'vue-router';

</script>

<template>
  <router-view />
  <div class="test">
    test scss
  </div>
</template>

<style scoped lang="scss">
.test{
  color: $priceColor;
}

header{
  line-height: 1.5;
  max-height: 100vh;
}

.logo{
  display:block;
  margin:0 auto 2rem;
}

nav{
  width: 100%;
  font-size: 12px;
  text-align: center;
  margin-top: 2rem;
}
</style>
