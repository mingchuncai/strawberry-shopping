import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RecommendationCard from '@/features/agent/components/RecommendationCard.vue'
import recommendationCardSource from '@/features/agent/components/RecommendationCard.vue?raw'
import type { Recommendation } from '@/features/agent/types'

const recommendation: Recommendation = {
  productId: 'product-quiet-01',
  skuId: 'sku-black-220v',
  name: 'Quiet Burr Grinder',
  price: 499,
  inventory: 12,
  attrsText: 'Black / 220V',
  evidence: ['Measured noise stays below the requested threshold.', 'Fits the RMB 500 budget.'],
  constraints: ['Not suitable for espresso-fine grinding.'],
  uncertainty: 'Live inventory may change before checkout.',
}

describe('RecommendationCard', () => {
  it('keeps the product link, SKU, RMB price, and stock visible as structured data', () => {
    const wrapper = mount(RecommendationCard, { props: { recommendation } })

    const productLink = wrapper.get('a[data-testid="product-link"]')
    expect(productLink.attributes('href')).toBe('/detail/product-quiet-01')
    expect(productLink.text()).toContain('Quiet Burr Grinder')
    expect(wrapper.get('[data-testid="sku-specification"]').text()).toContain('Black / 220V')
    expect(wrapper.get('[data-testid="price"]').text()).toMatch(/RMB\s*499\.00/)
    expect(wrapper.get('[data-testid="stock"]').text()).toBe('12 in stock')
  })

  it('labels evidence, constraints, and uncertainty separately', () => {
    const wrapper = mount(RecommendationCard, { props: { recommendation } })

    expect(wrapper.get('[data-section="evidence"] h4').text()).toBe('Evidence')
    expect(wrapper.get('[data-section="evidence"]').text()).toContain(
      'Measured noise stays below the requested threshold.',
    )
    expect(wrapper.get('[data-section="constraints"] h4').text()).toBe('Constraints')
    expect(wrapper.get('[data-section="constraints"]').text()).toContain(
      'Not suitable for espresso-fine grinding.',
    )
    expect(wrapper.get('[data-section="uncertainty"] h4').text()).toBe('Uncertainty')
    expect(wrapper.get('[data-section="uncertainty"]').text()).toContain(
      'Live inventory may change before checkout.',
    )
  })

  it('uses a native 44px selection button and emits the complete typed recommendation', async () => {
    const wrapper = mount(RecommendationCard, { props: { recommendation } })
    const select = wrapper.get('button[data-testid="select-recommendation"]')

    expect(select.attributes('type')).toBe('button')
    expect(select.attributes('tabindex')).not.toBe('-1')
    expect(recommendationCardSource).toMatch(
      /\.recommendation-card__select[\s\S]*?min-height:\s*44px/,
    )

    await select.trigger('click')

    expect(wrapper.emitted('select')).toEqual([[recommendation]])
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({
      productId: 'product-quiet-01',
      skuId: 'sku-black-220v',
      attrsText: 'Black / 220V',
      evidence: recommendation.evidence,
      constraints: recommendation.constraints,
      uncertainty: recommendation.uncertainty,
    })
  })

  it('states when a product is out of stock and prevents proposal selection', () => {
    const wrapper = mount(RecommendationCard, {
      props: { recommendation: { ...recommendation, inventory: 0 } },
    })

    expect(wrapper.get('[data-testid="stock"]').text()).toBe('Out of stock')
    expect(wrapper.get('button[data-testid="select-recommendation"]').attributes())
      .toHaveProperty('disabled')
  })
})
