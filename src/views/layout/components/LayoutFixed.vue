<script setup>
import { useScroll } from '@vueuse/core';
import { getCategoryAPI } from '@/apis/layout';
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';

const { y } = useScroll(window)

const categorylist = ref([])
const getCategory = async () => {
  const res = await getCategoryAPI()
  categorylist.value = res.result
}

onMounted(() => {
  getCategory()
})
</script>

<template>
  <div class="app-header-sticky " :class="{show:y>78}">
    <div class="container">
      <RouterLink class="logo" to="/" />
      <!-- 导航区域 -->
      <ul class="app-header-nav">
        <li class="home" v-for="item in categorylist" :key="item.id">
          <RouterLink to="/">{{item.name}}</RouterLink>
        </li>
      </ul>
      <div class="right">
        <RouterLink to="/">品牌</RouterLink>
        <RouterLink to="/">专题</RouterLink>
      </div>
    </div>
  </div>
</template>


<style scoped lang='scss'>
.app-header-sticky {
  width: 100%;
  height: 80px;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 999;
  background-color: #fff;
  border-bottom: 1px solid #e4e4e4;
  transform: translateY(-100%);
  opacity: 0;

  &.show {
    transition: all 0.3s linear;
    transform: none;
    opacity: 1;
  }

  .container {
    display: flex;
    align-items: center;
    width: 1200px;
    margin: 0 auto;
  }

  .logo {
    width: 200px;
    height: 80px;
    background: url("@/assets/images/logo.png") no-repeat right 2px;
    background-size: 160px auto;
  }

  .app-header-nav {
    display: flex;
    gap: 25px;
    list-style: none;
    padding: 0;
    margin: 0;
    flex: 1;
    margin-left: 40px;

    li {
      a {
        text-decoration: none;
        color: #333;
        font-size: 16px;
        &:hover {
          color: #27ba9b;
        }
      }
    }
  }

  .right {
    width: 220px;
    display: flex;
    text-align: center;
    padding-left: 40px;
    border-left: 2px solid #27ba9b;

    a {
      width: 38px;
      margin-right: 40px;
      font-size: 16px;
      line-height: 1;
      text-decoration: none;
      color: #333;

      &:hover {
        color: #27ba9b;
      }
    }
  }
}
</style>
