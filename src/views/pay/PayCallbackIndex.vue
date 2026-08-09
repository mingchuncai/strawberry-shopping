<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const result = computed(() => route.query.result)

const content = computed(() => {
  if (result.value === 'success') {
    return {
      title: '模拟支付已完成',
      message: '回调已返回成功状态。此页面仅用于演示订单流程，不代表真实支付完成凭证。',
      status: 'success',
    }
  }
  if (result.value === 'failure') {
    return {
      title: '模拟支付未完成',
      message: '回调返回失败状态，订单数据仍然保留，你可以返回订单流程后重试。',
      status: 'failure',
    }
  }
  return {
    title: '支付结果待确认',
    message: '尚未收到可确认的模拟支付结果。订单数据仍然保留，请稍后查看。',
    status: 'pending',
  }
})
</script>

<template>
  <main class="pay-callback" :data-status="content.status">
    <section class="pay-callback__card" aria-live="polite">
      <p class="pay-callback__eyebrow">BerryPilot AI · 模拟支付回调</p>
      <h1>{{ content.title }}</h1>
      <p>{{ content.message }}</p>
      <div class="pay-callback__actions">
        <RouterLink to="/cartlist">查看购物车</RouterLink>
        <RouterLink to="/">返回首页</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.pay-callback {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  color: #35282c;
  background: #fff8f3;
}

.pay-callback__card {
  width: min(560px, 100%);
  padding: 40px;
  border: 1px solid #eadde0;
  background: #fff;
}

.pay-callback__eyebrow {
  color: #766b6e;
}

.pay-callback h1 {
  margin: 12px 0;
}

.pay-callback__actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.pay-callback__actions a {
  padding: 10px 16px;
  border: 1px solid #e9435e;
  color: #c92f4a;
}
</style>
