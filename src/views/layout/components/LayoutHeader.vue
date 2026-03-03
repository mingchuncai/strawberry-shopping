<script setup>
// 核心修复：引入 RouterLink 组件
import { RouterLink } from 'vue-router';
import { categoryStore} from '@/stores/category';
//import { onMounted } from 'vue';
const CategoryStore = categoryStore()
</script>

<template>
  <header class='app-header'>
    <div class="container">
      <h1 class="logo">
        <RouterLink to="/">小兔鲜</RouterLink>
      </h1>
      <ul class="app-header-nav">
        <li class="home" v-for="item in CategoryStore.categorylist" :key="item.id">
          <RouterLink to="/">{{item.name}}</RouterLink>
        </li>
      </ul>
      <div class="search">
        <i class="iconfont icon-souyisou"></i>
        <input type="text" placeholder="搜一搜">
      </div>
    </div>
  </header>
</template>


<style scoped lang='scss'>
.app-header {
  background: #fff;

  .container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 1200px;
    margin: 0 auto;
  }

  .logo {
    width: 200px;

    a {
      display: block;
      height: 132px;
      width: 100%;
      text-indent: -9999px;
      background: url('@/assets/images/logo.png') no-repeat center 18px / contain;
    }
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

  .search {
    width: 170px;
    height: 32px;
    position: relative;
    border-bottom: 1px solid #e7e7e7;
    line-height: 32px;

    .icon-souyisou {
      font-size: 18px;
      margin-left: 5px;
    }

    input {
      width: 140px;
      padding-left: 5px;
      color: #666;
      border: none;
      outline: none;
    }
  }

  .cart {
    width: 50px;

    .curr {
      height: 32px;
      line-height: 32px;
      text-align: center;
      position: relative;
      display: block;

      .icon-cart {
        font-size: 22px;
      }

      em {
        font-style: normal;
        position: absolute;
        right: 0;
        top: 0;
        padding: 1px 6px;
        line-height: 1;
        background: #f00;
        color: #fff;
        font-size: 12px;
        border-radius: 10px;
        font-family: Arial;
      }
    }
  }
}
</style>

