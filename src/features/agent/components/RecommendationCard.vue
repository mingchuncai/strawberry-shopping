<script setup lang="ts">
import type { Recommendation } from '../types'

const props = defineProps<{
  recommendation: Recommendation
}>()

const emit = defineEmits<{
  select: [recommendation: Recommendation]
}>()

const formatPrice = (price: number): string => `RMB ${price.toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`

const stockText = (inventory: number): string => inventory > 0
  ? `${inventory.toLocaleString('en-US')} in stock`
  : 'Out of stock'
</script>

<template>
  <article class="recommendation-card">
    <header class="recommendation-card__header">
      <div>
        <p class="recommendation-card__eyebrow">Recommended product</p>
        <h3>
          <a
            data-testid="product-link"
            :href="`/detail/${encodeURIComponent(recommendation.productId)}`"
          >
            {{ recommendation.name }}
          </a>
        </h3>
      </div>
      <p class="recommendation-card__price" data-testid="price">
        {{ formatPrice(recommendation.price) }}
      </p>
    </header>

    <dl class="recommendation-card__facts">
      <div>
        <dt>Specification</dt>
        <dd data-testid="sku-specification">{{ recommendation.attrsText }}</dd>
      </div>
      <div>
        <dt>Availability</dt>
        <dd data-testid="stock">{{ stockText(recommendation.inventory) }}</dd>
      </div>
    </dl>

    <section class="recommendation-card__section" data-section="evidence">
      <h4>Evidence</h4>
      <ul>
        <li v-for="item in recommendation.evidence" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="recommendation-card__section" data-section="constraints">
      <h4>Constraints</h4>
      <ul>
        <li v-for="item in recommendation.constraints" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="recommendation-card__section" data-section="uncertainty">
      <h4>Uncertainty</h4>
      <p>{{ recommendation.uncertainty }}</p>
    </section>

    <button
      class="recommendation-card__select"
      data-testid="select-recommendation"
      type="button"
      :aria-label="recommendation.inventory > 0
        ? `Choose ${recommendation.name}, ${recommendation.attrsText}`
        : `${recommendation.name}, ${recommendation.attrsText}, currently unavailable`"
      :disabled="recommendation.inventory <= 0"
      @click="emit('select', props.recommendation)"
    >
      {{ recommendation.inventory > 0 ? 'Choose this recommendation' : 'Currently unavailable' }}
    </button>
  </article>
</template>

<style scoped>
.recommendation-card {
  display: grid;
  gap: var(--agent-space-4);
  padding: var(--agent-space-4);
  border: 1px solid var(--agent-line);
  border-radius: var(--agent-radius-md);
  background: var(--agent-surface);
  color: var(--agent-cocoa);
  box-shadow: var(--agent-shadow);
}

.recommendation-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--agent-space-4);
}

.recommendation-card__eyebrow,
.recommendation-card h3,
.recommendation-card h4,
.recommendation-card p,
.recommendation-card ul,
.recommendation-card dl,
.recommendation-card dd {
  margin: 0;
}

.recommendation-card__eyebrow {
  margin-bottom: var(--agent-space-1);
  color: var(--agent-stone);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.recommendation-card h3 {
  font-size: 18px;
  line-height: 1.35;
}

.recommendation-card h3 a {
  color: var(--agent-ripe-red);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.recommendation-card__price {
  flex: 0 0 auto;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: 750;
  white-space: nowrap;
}

.recommendation-card__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--agent-space-3);
}

.recommendation-card__facts > div {
  padding: var(--agent-space-3);
  border-left: 3px solid var(--agent-line-strong);
  background: var(--agent-cream);
}

.recommendation-card dt,
.recommendation-card h4 {
  color: var(--agent-stone);
  font-size: 13px;
  font-weight: 750;
}

.recommendation-card dd,
.recommendation-card__section {
  font-size: 14px;
  line-height: 1.55;
}

.recommendation-card dd {
  margin-top: var(--agent-space-1);
  font-variant-numeric: tabular-nums;
}

.recommendation-card__section {
  padding-top: var(--agent-space-3);
  border-top: 1px solid var(--agent-line);
}

.recommendation-card__section h4 {
  margin-bottom: var(--agent-space-2);
  color: var(--agent-cocoa);
}

.recommendation-card__section ul {
  padding-left: 20px;
}

.recommendation-card__section li + li {
  margin-top: var(--agent-space-1);
}

.recommendation-card__select {
  min-height: 44px;
  justify-self: start;
  padding: var(--agent-space-2) var(--agent-space-4);
  border: 1px solid var(--agent-ripe-red);
  border-radius: var(--agent-radius-sm);
  background: var(--agent-ripe-red);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 16px;
  font-weight: 750;
  transition: background-color var(--agent-motion), border-color var(--agent-motion);
}

.recommendation-card__select:hover:not(:disabled) {
  border-color: var(--agent-cocoa);
  background: var(--agent-cocoa);
}

.recommendation-card__select:disabled {
  border-color: var(--agent-line-strong);
  background: var(--agent-blush);
  color: var(--agent-stone);
  cursor: not-allowed;
}

.recommendation-card :where(a, button):focus-visible {
  outline: 3px solid var(--agent-berry-red);
  outline-offset: 2px;
}

@media (max-width: 520px) {
  .recommendation-card__header,
  .recommendation-card__facts {
    grid-template-columns: minmax(0, 1fr);
  }

  .recommendation-card__header {
    display: grid;
  }

  .recommendation-card__select {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .recommendation-card__select {
    transition: none;
  }
}
</style>
