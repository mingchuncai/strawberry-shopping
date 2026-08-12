<script setup lang="ts">
import { computed } from 'vue'

import type { OperationConfirmation } from '../types'

type OperationConfirmationState =
  | 'ready'
  | 'pending'
  | 'stale'
  | 'invalid'
  | 'unavailable'

const props = defineProps<{
  confirmation: OperationConfirmation | null
  state: OperationConfirmationState
}>()

const emit = defineEmits<{
  confirm: [confirmationId: string]
  reject: [confirmationId: string]
}>()

const stateText: Record<Exclude<OperationConfirmationState, 'ready'>, string> = {
  pending: '正在加入购物车，请稍候。',
  stale: '此确认已过期，无法执行。请重新选择当前提案。',
  invalid: '此确认与当前商品提案不匹配，无法执行。',
  unavailable: '此操作当前不可用，购物车不会改变。',
}

const disabled = computed(() => props.state !== 'ready')
const explanation = computed(() => props.state === 'ready' ? '' : stateText[props.state])
const formatPrice = (price: number): string => `RMB ${price.toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`

const confirm = () => {
  if (disabled.value || !props.confirmation) return
  emit('confirm', props.confirmation.id)
}

const reject = () => {
  if (disabled.value || !props.confirmation) return
  emit('reject', props.confirmation.id)
}
</script>

<template>
  <section
    class="operation-confirmation-card"
    data-testid="operation-confirmation"
    :aria-busy="state === 'pending'"
    aria-labelledby="operation-confirmation-title"
  >
    <header class="operation-confirmation-card__header">
      <div>
        <p class="operation-confirmation-card__eyebrow">Action requires confirmation</p>
        <h2 id="operation-confirmation-title">Review before the cart changes</h2>
      </div>
      <span
        v-if="confirmation"
        class="operation-confirmation-card__target"
        data-testid="operation-target"
      >
        Add to existing cart
      </span>
    </header>

    <dl v-if="confirmation" class="operation-confirmation-card__snapshot">
      <div class="operation-confirmation-card__product">
        <dt>Product</dt>
        <dd data-testid="operation-product-name">{{ confirmation.productName }}</dd>
      </div>
      <div>
        <dt>Product ID</dt>
        <dd data-testid="operation-product-id">{{ confirmation.productId }}</dd>
      </div>
      <div>
        <dt>SKU ID</dt>
        <dd data-testid="operation-sku-id">{{ confirmation.skuId }}</dd>
      </div>
      <div>
        <dt>Specification</dt>
        <dd data-testid="operation-attrs">{{ confirmation.attrsText }}</dd>
      </div>
      <div>
        <dt>Quantity</dt>
        <dd data-testid="operation-quantity">{{ confirmation.quantity }}</dd>
      </div>
      <div>
        <dt>Unit price</dt>
        <dd data-testid="operation-unit-price">{{ formatPrice(confirmation.unitPrice) }}</dd>
      </div>
      <div class="operation-confirmation-card__total">
        <dt>Total</dt>
        <dd data-testid="operation-total-price">{{ formatPrice(confirmation.totalPrice) }}</dd>
      </div>
    </dl>

    <p
      v-if="explanation"
      class="operation-confirmation-card__state"
      data-testid="confirmation-state"
    >
      {{ explanation }}
    </p>

    <div class="operation-confirmation-card__actions">
      <button
        class="operation-confirmation-card__action operation-confirmation-card__action--primary"
        data-testid="confirm-operation"
        type="button"
        :disabled="disabled"
        @click="confirm"
      >
        {{ state === 'pending' ? '正在加入…' : '确认加入' }}
      </button>
      <button
        class="operation-confirmation-card__action operation-confirmation-card__action--secondary"
        data-testid="reject-operation"
        type="button"
        :disabled="disabled"
        @click="reject"
      >
        暂不加入
      </button>
    </div>
  </section>
</template>

<style scoped>
.operation-confirmation-card {
  display: grid;
  width: min(100%, 760px);
  gap: var(--agent-space-4);
  margin: var(--agent-space-5) auto 0;
  padding: var(--agent-space-5);
  border: 1px solid var(--agent-line-strong);
  border-left: 4px solid var(--agent-berry-red);
  border-radius: var(--agent-radius-md);
  background: var(--agent-cream);
  color: var(--agent-cocoa);
  box-shadow: var(--agent-shadow);
}

.operation-confirmation-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--agent-space-4);
}

.operation-confirmation-card__eyebrow,
.operation-confirmation-card h2,
.operation-confirmation-card dl,
.operation-confirmation-card dd,
.operation-confirmation-card p {
  margin: 0;
}

.operation-confirmation-card__eyebrow {
  margin-bottom: var(--agent-space-1);
  color: var(--agent-ripe-red);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.operation-confirmation-card h2 {
  font-size: 18px;
  line-height: 1.35;
}

.operation-confirmation-card__target {
  flex: 0 0 auto;
  padding: var(--agent-space-2) var(--agent-space-3);
  border: 1px solid var(--agent-line);
  border-radius: var(--agent-radius-sm);
  background: var(--agent-surface);
  color: var(--agent-stone);
  font-size: 13px;
  font-weight: 700;
}

.operation-confirmation-card__snapshot {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--agent-space-3);
}

.operation-confirmation-card__snapshot > div {
  min-width: 0;
  padding: var(--agent-space-3);
  border: 1px solid var(--agent-line);
  border-radius: var(--agent-radius-sm);
  background: var(--agent-surface);
}

.operation-confirmation-card__product,
.operation-confirmation-card__total {
  grid-column: 1 / -1;
}

.operation-confirmation-card dt {
  color: var(--agent-stone);
  font-size: 12px;
  font-weight: 700;
}

.operation-confirmation-card dd {
  margin-top: var(--agent-space-1);
  overflow-wrap: anywhere;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}

.operation-confirmation-card__product dd,
.operation-confirmation-card__total dd {
  font-size: 16px;
  font-weight: 750;
}

.operation-confirmation-card__state {
  padding: var(--agent-space-3);
  border-left: 3px solid var(--agent-error);
  background: color-mix(in srgb, var(--agent-error) 7%, white);
  color: var(--agent-error);
  font-size: 14px;
  line-height: 1.55;
}

.operation-confirmation-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--agent-space-3);
}

.operation-confirmation-card__action {
  min-height: 44px;
  min-width: 120px;
  padding: var(--agent-space-2) var(--agent-space-4);
  border: 1px solid var(--agent-ripe-red);
  border-radius: var(--agent-radius-sm);
  cursor: pointer;
  font: inherit;
  font-size: 16px;
  font-weight: 750;
  transition: background-color var(--agent-motion), border-color var(--agent-motion);
}

.operation-confirmation-card__action--primary {
  background: var(--agent-ripe-red);
  color: #fff;
}

.operation-confirmation-card__action--secondary {
  background: var(--agent-surface);
  color: var(--agent-ripe-red);
}

.operation-confirmation-card__action:hover:not(:disabled) {
  border-color: var(--agent-cocoa);
}

.operation-confirmation-card__action--primary:hover:not(:disabled) {
  background: var(--agent-cocoa);
}

.operation-confirmation-card__action:disabled {
  border-color: var(--agent-line-strong);
  background: var(--agent-blush);
  color: var(--agent-stone);
  cursor: not-allowed;
}

.operation-confirmation-card__action:focus-visible {
  outline: 3px solid var(--agent-berry-red);
  outline-offset: 2px;
}

@media (max-width: 520px) {
  .operation-confirmation-card {
    padding: var(--agent-space-4);
  }

  .operation-confirmation-card__header {
    display: grid;
  }

  .operation-confirmation-card__target {
    justify-self: start;
  }

  .operation-confirmation-card__snapshot {
    grid-template-columns: minmax(0, 1fr);
  }

  .operation-confirmation-card__product,
  .operation-confirmation-card__total {
    grid-column: auto;
  }

  .operation-confirmation-card__action {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .operation-confirmation-card__action {
    transition: none;
  }
}
</style>
