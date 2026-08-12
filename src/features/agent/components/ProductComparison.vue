<script setup lang="ts">
import type { RecommendationGroup } from '../types'

defineProps<{
  group: RecommendationGroup
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
  <div class="product-comparison">
    <table :aria-label="`${group.title} product comparison`">
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col">Specification</th>
          <th scope="col">Price</th>
          <th scope="col">Stock</th>
          <th scope="col">Evidence</th>
          <th scope="col">Constraints</th>
          <th scope="col">Uncertainty</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="recommendation in group.recommendations" :key="recommendation.skuId">
          <th scope="row" data-label="Product">
            <a :href="`/detail/${encodeURIComponent(recommendation.productId)}`">
              {{ recommendation.name }}
            </a>
          </th>
          <td data-label="Specification">{{ recommendation.attrsText }}</td>
          <td class="product-comparison__number" data-label="Price">
            {{ formatPrice(recommendation.price) }}
          </td>
          <td class="product-comparison__number" data-label="Stock">
            {{ stockText(recommendation.inventory) }}
          </td>
          <td data-label="Evidence">
            <ul>
              <li v-for="item in recommendation.evidence" :key="item">{{ item }}</li>
            </ul>
          </td>
          <td data-label="Constraints">
            <ul>
              <li v-for="item in recommendation.constraints" :key="item">{{ item }}</li>
            </ul>
          </td>
          <td data-label="Uncertainty">{{ recommendation.uncertainty }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.product-comparison {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--agent-line);
  border-radius: var(--agent-radius-md);
  background: var(--agent-surface);
}

.product-comparison table {
  width: 100%;
  min-width: 920px;
  border-collapse: collapse;
  color: var(--agent-cocoa);
  font-size: 14px;
  line-height: 1.5;
}

.product-comparison th,
.product-comparison td {
  padding: var(--agent-space-3);
  border-bottom: 1px solid var(--agent-line);
  text-align: left;
  vertical-align: top;
}

.product-comparison thead th {
  background: var(--agent-cream);
  color: var(--agent-stone);
  font-size: 13px;
  font-weight: 750;
}

.product-comparison tbody th {
  min-width: 150px;
}

.product-comparison tbody tr:last-child > * {
  border-bottom: 0;
}

.product-comparison a {
  color: var(--agent-ripe-red);
  font-weight: 750;
  text-underline-offset: 3px;
}

.product-comparison a:focus-visible {
  outline: 3px solid var(--agent-berry-red);
  outline-offset: 2px;
}

.product-comparison ul {
  margin: 0;
  padding-left: 18px;
}

.product-comparison li + li {
  margin-top: var(--agent-space-1);
}

.product-comparison__number {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .product-comparison table {
    min-width: 760px;
  }

  .product-comparison :is(tbody th, tbody td)::before {
    display: block;
    margin-bottom: var(--agent-space-1);
    color: var(--agent-stone);
    content: attr(data-label);
    font-size: 12px;
    font-weight: 750;
  }
}
</style>
