import { describe, expect, it } from 'vitest'

import type { AppError } from '@/types/api'
import type { CartItem } from '@/types/domain'

const invalidPrice: CartItem = {
  skuId: 'sku-1',
  name: '手冲壶',
  picture: '/kettle.png',
  // @ts-expect-error prices are numeric at the domain boundary
  price: 'not-a-number',
  count: 1,
  selected: true,
  attrsText: '黑色',
}

// @ts-expect-error cart items always identify a concrete SKU
const missingSku: CartItem = {
  name: '滤杯',
  picture: '/dripper.png',
  price: 49,
  count: 1,
  selected: true,
  attrsText: '陶瓷',
}

const unknownError: AppError = {
  // @ts-expect-error API errors use the stable public code union
  code: 'SOMETHING_NEW',
  message: 'unexpected',
  recoverable: false,
}

describe('typed commerce contracts', () => {
  it('keeps runtime fixtures available to the test compiler', () => {
    expect([invalidPrice, missingSku, unknownError]).toHaveLength(3)
  })
})
