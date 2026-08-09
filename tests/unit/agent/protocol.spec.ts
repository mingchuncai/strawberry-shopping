import { describe, expect, it } from 'vitest'

import {
  initialAgentProtocolState,
  parseAgentEvent,
  reduceAgentEvent,
} from '@/features/agent/protocol'

const recommendation = {
  productId: 'product-1',
  skuId: 'sku-1',
  name: 'Quiet Coffee Grinder',
  price: 399,
  inventory: 8,
  attrsText: 'Black',
  evidence: ['Low noise'],
  constraints: ['Manual cleaning'],
  uncertainty: 'Inventory may change before checkout',
}

const recommendationGroup = {
  id: 'group-1',
  title: 'Quiet dormitory options',
  recommendations: [recommendation],
}

const confirmation = {
  id: 'confirmation-1',
  operation: 'add_to_cart' as const,
  productId: 'product-1',
  skuId: 'sku-1',
  productName: 'Quiet Coffee Grinder',
  attrsText: 'Black',
  quantity: 1,
  unitPrice: 399,
  totalPrice: 399,
  payloadHash: 'payload-1',
  idempotencyKey: 'operation-1',
}

const eventCases = [
  { name: 'message.started', event: { id: 1, type: 'message.started', messageId: 'message-1', role: 'assistant' } },
  { name: 'message.delta', event: { id: 2, type: 'message.delta', messageId: 'message-1', delta: 'Hello' } },
  { name: 'message.completed', event: { id: 3, type: 'message.completed', messageId: 'message-1' } },
  { name: 'trail.updated', event: { id: 4, type: 'trail.updated', stage: 'PLAN', label: 'Comparing options', status: 'running' } },
  { name: 'recommendations.ready', event: { id: 5, type: 'recommendations.ready', groups: [recommendationGroup] } },
  { name: 'confirmation.requested', event: { id: 6, type: 'confirmation.requested', confirmation } },
  { name: 'operation.completed', event: { id: 7, type: 'operation.completed', confirmationId: 'confirmation-1', cartItemCount: 2 } },
  { name: 'stream.failed', event: { id: 8, type: 'stream.failed', code: 'NETWORK_ERROR', recoverable: true, message: 'Connection dropped' } },
  { name: 'stream.completed', event: { id: 9, type: 'stream.completed' } },
] as const

describe('agent event protocol', () => {
  it.each(eventCases)('parses the $name event', ({ event }) => {
    expect(parseAgentEvent(event)).toEqual(event)
  })

  it.each([
    { id: 1, type: 'message.delta', messageId: 'message-1', delta: 42 },
    { id: 1, type: 'trail.updated', stage: 'UNKNOWN', label: 'Nope', status: 'running' },
    { id: 1, type: 'recommendations.ready', groups: [{}] },
    { id: 1, type: 'confirmation.requested', confirmation: { ...confirmation, quantity: 0 } },
    { id: 1, type: 'operation.completed', confirmationId: 'confirmation-1', cartItemCount: -1 },
    { id: 1, type: 'unknown.event' },
    null,
  ])('returns a non-recoverable API error for malformed payloads', (payload) => {
    expect(parseAgentEvent(payload)).toMatchObject({ code: 'API_ERROR', recoverable: false })
  })

  it('accepts strictly sequential event IDs', () => {
    const afterFirst = reduceAgentEvent(initialAgentProtocolState, eventCases[0].event)
    const afterSecond = reduceAgentEvent(afterFirst.state, eventCases[1].event)

    expect(afterSecond.state.lastEventId).toBe(2)
    expect(afterSecond.effects).toEqual([])
  })

  it('suppresses duplicate and older events without changing state', () => {
    const afterFirst = reduceAgentEvent(initialAgentProtocolState, eventCases[0].event)
    const duplicate = reduceAgentEvent(afterFirst.state, eventCases[0].event)
    const older = reduceAgentEvent(afterFirst.state, { ...eventCases[0].event, id: 0 })

    expect(duplicate).toEqual({ state: afterFirst.state, effects: [] })
    expect(older).toEqual({ state: afterFirst.state, effects: [] })
  })

  it('returns a recoverable resume effect when an event ID has a gap', () => {
    const result = reduceAgentEvent(initialAgentProtocolState, eventCases[1].event)

    expect(result.state.error).toMatchObject({ code: 'API_ERROR', recoverable: true })
    expect(result.effects).toEqual([{ type: 'stream.resume', afterEventId: 0 }])
    expect(result.state.lastEventId).toBe(0)
  })

  it('concatenates deltas into their started message and marks it completed', () => {
    const started = reduceAgentEvent(initialAgentProtocolState, eventCases[0].event)
    const firstDelta = reduceAgentEvent(started.state, eventCases[1].event)
    const secondDelta = reduceAgentEvent(firstDelta.state, { id: 3, type: 'message.delta', messageId: 'message-1', delta: ', Berry!' })
    const completed = reduceAgentEvent(secondDelta.state, { id: 4, type: 'message.completed', messageId: 'message-1' })

    expect(completed.state.messages['message-1']).toEqual({ id: 'message-1', role: 'assistant', content: 'Hello, Berry!', completed: true })
  })

  it('marks the stream complete', () => {
    const result = reduceAgentEvent(initialAgentProtocolState, { id: 1, type: 'stream.completed' })

    expect(result.state).toMatchObject({ lastEventId: 1, isCompleted: true, stage: 'COMPLETE' })
  })

  it('replaces a pending confirmation and declares the previous snapshot stale', () => {
    const first = reduceAgentEvent(initialAgentProtocolState, {
      id: 1,
      type: 'confirmation.requested',
      confirmation,
    })
    const replacement = { ...confirmation, id: 'confirmation-2', payloadHash: 'payload-2' }
    const second = reduceAgentEvent(first.state, { id: 2, type: 'confirmation.requested', confirmation: replacement })

    expect(second.state.pendingConfirmation).toEqual(replacement)
    expect(second.effects).toEqual([{ type: 'confirmation.invalidated', confirmationId: 'confirmation-1' }])
  })

  it('stores a confirmation snapshot isolated from subsequent caller mutation', () => {
    const mutableConfirmation = { ...confirmation }
    const result = reduceAgentEvent(initialAgentProtocolState, {
      id: 1,
      type: 'confirmation.requested',
      confirmation: mutableConfirmation,
    })

    mutableConfirmation.productId = 'product-mutated'
    mutableConfirmation.quantity = 9

    expect(result.state.pendingConfirmation).toMatchObject({
      productId: 'product-1',
      quantity: 1,
    })
  })

  it.each([
    ['productId', 'product-2'],
    ['skuId', 'sku-2'],
    ['quantity', 2],
    ['unitPrice', 499],
    ['totalPrice', 499],
    ['operation', 'remove_from_cart'],
    ['payloadHash', 'payload-2'],
    ['idempotencyKey', 'operation-2'],
  ] as const)(
    'invalidates a pending confirmation when its %s changes despite a stable confirmation ID',
    (field, value) => {
      const first = reduceAgentEvent(initialAgentProtocolState, {
        id: 1,
        type: 'confirmation.requested',
        confirmation,
      })
      const changedConfirmation = { ...confirmation, [field]: value } as typeof confirmation
      const result = reduceAgentEvent(first.state, {
        id: 2,
        type: 'confirmation.requested',
        confirmation: changedConfirmation,
      })

      expect(result.effects).toEqual([
        { type: 'confirmation.invalidated', confirmationId: 'confirmation-1' },
      ])
    },
  )
})
