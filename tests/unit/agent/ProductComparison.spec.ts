import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProductComparison from '@/features/agent/components/ProductComparison.vue'
import productComparisonSource from '@/features/agent/components/ProductComparison.vue?raw'
import type { RecommendationGroup } from '@/features/agent/types'

const group: RecommendationGroup = {
  id: 'quiet-options',
  title: 'Quiet options under RMB 500',
  recommendations: [
    {
      productId: 'product-1',
      skuId: 'sku-1',
      name: 'Manual Grinder',
      price: 199,
      inventory: 8,
      attrsText: 'Steel / 38mm burr',
      evidence: ['No electric motor noise.'],
      constraints: ['Requires hand grinding.'],
      uncertainty: 'Grinding time varies by bean density.',
    },
    {
      productId: 'product-2',
      skuId: 'sku-2',
      name: 'Compact Electric Grinder',
      price: 459,
      inventory: 0,
      attrsText: 'White / 220V',
      evidence: ['Fits the stated budget.'],
      constraints: ['Produces some motor noise.'],
      uncertainty: 'Restock date is not confirmed.',
    },
  ],
}

describe('ProductComparison', () => {
  it('uses one semantic comparison table with scoped headers', () => {
    const wrapper = mount(ProductComparison, { props: { group } })
    const table = wrapper.get('table')

    expect(table.attributes('aria-label')).toContain('Quiet options under RMB 500')
    expect(table.findAll('thead th').map((header) => header.text())).toEqual([
      'Product',
      'Specification',
      'Price',
      'Stock',
      'Evidence',
      'Constraints',
      'Uncertainty',
    ])
    expect(table.findAll('thead th').every((header) => header.attributes('scope') === 'col'))
      .toBe(true)
    expect(table.findAll('tbody tr')).toHaveLength(2)
    expect(table.findAll('tbody th[scope="row"]')).toHaveLength(2)
  })

  it('shows RMB prices, stock, and the public structured comparison fields', () => {
    const wrapper = mount(ProductComparison, { props: { group } })

    expect(wrapper.text()).toMatch(/RMB\s*199\.00/)
    expect(wrapper.text()).toContain('8 in stock')
    expect(wrapper.text()).toContain('Out of stock')
    expect(wrapper.text()).toContain('No electric motor noise.')
    expect(wrapper.text()).toContain('Requires hand grinding.')
    expect(wrapper.text()).toContain('Restock date is not confirmed.')
  })

  it('retains table semantics and labels each responsive cell at narrow widths', () => {
    const wrapper = mount(ProductComparison, { props: { group } })
    const firstRow = wrapper.get('tbody tr')

    expect(firstRow.get('th').attributes('data-label')).toBe('Product')
    expect(firstRow.findAll('td').map((cell) => cell.attributes('data-label'))).toEqual([
      'Specification',
      'Price',
      'Stock',
      'Evidence',
      'Constraints',
      'Uncertainty',
    ])
    expect(productComparisonSource).toMatch(/@media \(max-width:\s*720px\)/)
    expect(productComparisonSource).toContain('content: attr(data-label);')
    expect(productComparisonSource).not.toMatch(/table\s*\{[\s\S]*?display:\s*none/)
  })
})
