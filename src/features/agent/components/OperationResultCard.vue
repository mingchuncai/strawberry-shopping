<script setup lang="ts">
import { ref } from 'vue'

type OperationResultStatus = 'success' | 'failed' | 'unknown' | 'rejected'

withDefaults(defineProps<{
  status: OperationResultStatus
  cartItemCount?: number
}>(), {
  cartItemCount: 0,
})

const resultElement = ref<HTMLElement | null>(null)
const focus = () => resultElement.value?.focus()

defineExpose({ focus })
</script>

<template>
  <section
    ref="resultElement"
    class="operation-result-card"
    :class="`operation-result-card--${status}`"
    data-testid="operation-result"
    role="status"
    tabindex="-1"
  >
    <template v-if="status === 'success'">
      <p class="operation-result-card__eyebrow">Action complete</p>
      <h2>已加入现有购物车</h2>
      <p>购物车现在有 {{ cartItemCount }} 件商品。结算前仍可在购物车中修改数量或移除商品。</p>
      <RouterLink :to="{ name: 'cart' }">查看购物车</RouterLink>
    </template>

    <template v-else-if="status === 'unknown'">
      <p class="operation-result-card__eyebrow">Check required</p>
      <h2>购物车结果需要核对</h2>
      <p>商品提案和对话均已保留，但本次更新结果未知。请先查看购物车，确认后再开始其他操作。</p>
      <RouterLink :to="{ name: 'cart' }">请先查看购物车</RouterLink>
    </template>

    <template v-else-if="status === 'failed'">
      <p class="operation-result-card__eyebrow">Action not completed</p>
      <h2>未能加入购物车</h2>
      <p>商品提案和对话均已保留，购物车没有变化。请检查当前提案和购物车后再决定下一步。</p>
      <RouterLink :to="{ name: 'cart' }">查看购物车</RouterLink>
    </template>

    <template v-else>
      <p class="operation-result-card__eyebrow">Action declined</p>
      <h2>已暂不加入</h2>
      <p>购物车没有变化。商品提案和对话仍保留，可继续比较其他选择。</p>
    </template>
  </section>
</template>

<style scoped>
.operation-result-card {
  display: grid;
  width: min(100%, 760px);
  gap: var(--agent-space-2);
  margin: var(--agent-space-5) auto 0;
  padding: var(--agent-space-5);
  border: 1px solid var(--agent-line-strong);
  border-left: 4px solid var(--agent-leaf-green);
  border-radius: var(--agent-radius-md);
  background: var(--agent-cream);
  color: var(--agent-cocoa);
}

.operation-result-card--failed,
.operation-result-card--unknown {
  border-left-color: var(--agent-error);
}

.operation-result-card--rejected {
  border-left-color: var(--agent-stone);
}

.operation-result-card:focus {
  outline: 3px solid var(--agent-berry-red);
  outline-offset: 3px;
}

.operation-result-card__eyebrow,
.operation-result-card h2,
.operation-result-card p {
  margin: 0;
}

.operation-result-card__eyebrow {
  color: var(--agent-stone);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.operation-result-card h2 {
  font-size: 18px;
  line-height: 1.4;
}

.operation-result-card p:last-of-type {
  color: var(--agent-stone);
  font-size: 14px;
  line-height: 1.6;
}

.operation-result-card a {
  min-height: 44px;
  justify-self: start;
  display: inline-flex;
  align-items: center;
  margin-top: var(--agent-space-2);
  color: var(--agent-ripe-red);
  font-weight: 750;
  text-underline-offset: 3px;
}

.operation-result-card a:focus-visible {
  outline: 3px solid var(--agent-berry-red);
  outline-offset: 2px;
}
</style>
