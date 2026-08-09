import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp, toRaw } from 'vue'

vi.mock('element-plus', () => ({ ElMessage: vi.fn() }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

import { createAgentStore } from '@/features/agent/store'
import type { AgentEvent, AgentTransport, OperationConfirmation } from '@/features/agent/types'
import { useCartStore } from '@/stores/cart'

const confirmation = (overrides: Partial<OperationConfirmation> = {}): OperationConfirmation => ({
  id: 'confirmation-1',
  operation: 'add_to_cart',
  productId: 'product-1',
  skuId: 'sku-1',
  productName: 'Quiet Coffee Grinder',
  attrsText: 'Black',
  quantity: 2,
  unitPrice: 199,
  totalPrice: 398,
  payloadHash: 'payload-1',
  idempotencyKey: 'operation-1',
  ...overrides,
})

const transportFrom = (
  stream: AgentTransport['stream'],
): AgentTransport => ({ stream })

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe('agent conversation store', () => {
  let transport: AgentTransport
  const useTestAgentStore = createAgentStore(() => transport, 'agent-test')

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('rejects empty input without opening a stream', async () => {
    const stream = vi.fn()
    transport = transportFrom(stream)
    const store = useTestAgentStore()

    await expect(store.sendMessage('   ')).resolves.toBe(false)

    expect(stream).not.toHaveBeenCalled()
    expect(store.canSend).toBe(true)
    expect(store.isStreaming).toBe(false)
  })

  it('allows only one stream and progressively reduces message deltas', async () => {
    const releaseDelta = deferred<void>()
    const releaseCompletion = deferred<void>()
    const stream = vi.fn(async function* () {
      yield { id: 1, type: 'message.started', messageId: 'message-1', role: 'assistant' } satisfies AgentEvent
      await releaseDelta.promise
      yield { id: 2, type: 'message.delta', messageId: 'message-1', delta: 'Hello' } satisfies AgentEvent
      await releaseCompletion.promise
      yield { id: 3, type: 'message.delta', messageId: 'message-1', delta: ', Berry!' } satisfies AgentEvent
      yield { id: 4, type: 'message.completed', messageId: 'message-1' } satisfies AgentEvent
      yield { id: 5, type: 'stream.completed' } satisfies AgentEvent
    })
    transport = transportFrom(stream)
    const store = useTestAgentStore()

    const active = store.sendMessage('Find quiet coffee gear')
    await flush()

    expect(store.isStreaming).toBe(true)
    expect(store.canSend).toBe(false)
    expect(store.messages['message-1']?.content).toBe('')
    await expect(store.sendMessage('Start another request')).resolves.toBe(false)
    expect(stream).toHaveBeenCalledTimes(1)

    releaseDelta.resolve()
    await vi.waitFor(() => {
      expect(store.messages['message-1']?.content).toBe('Hello')
    })

    releaseCompletion.resolve()
    await expect(active).resolves.toBe(true)
    expect(store.messages['message-1']).toMatchObject({ content: 'Hello, Berry!', completed: true })
    expect(store.stage).toBe('COMPLETE')
    expect(store.isStreaming).toBe(false)
  })

  it('resumes from the last reduced event after a recoverable transport failure', async () => {
    const calls: Array<{ message: string; afterEventId: number | undefined }> = []
    let attempt = 0
    transport = transportFrom(async function* (request, options) {
      calls.push({ message: request.message, afterEventId: options.afterEventId })
      attempt += 1
      if (attempt === 1) {
        yield { id: 1, type: 'message.started', messageId: 'message-1', role: 'assistant' }
        yield { id: 2, type: 'message.delta', messageId: 'message-1', delta: 'Part one' }
        throw Object.assign(new Error('Connection dropped'), { recoverable: true })
      }
      yield { id: 3, type: 'message.delta', messageId: 'message-1', delta: ' and two' }
      yield { id: 4, type: 'stream.completed' }
    })
    const store = useTestAgentStore()

    await expect(store.sendMessage('Resume me')).resolves.toBe(false)
    expect(store.lastEventId).toBe(2)
    expect(store.error).toMatchObject({ code: 'NETWORK_ERROR', recoverable: true })
    expect(store.canRetry).toBe(true)

    await expect(store.retry()).resolves.toBe(true)

    expect(calls).toEqual([
      { message: 'Resume me', afterEventId: undefined },
      { message: 'Resume me', afterEventId: 2 },
    ])
    expect(store.messages['message-1']?.content).toBe('Part one and two')
    expect(store.lastEventId).toBe(4)
    expect(store.canRetry).toBe(false)
  })

  it('aborts runtime work outside persisted state and transitions to CANCELLED', async () => {
    let observedSignal: AbortSignal | undefined
    transport = transportFrom(async function* (_request, { signal }) {
      observedSignal = signal
      yield { id: 1, type: 'message.started', messageId: 'message-1', role: 'assistant' }
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
    })
    const store = useTestAgentStore()

    const active = store.sendMessage('Cancel me')
    await flush()
    expect(Object.values(store.$state).some((value) => value instanceof AbortController)).toBe(false)

    store.cancel()
    await expect(active).resolves.toBe(false)

    expect(observedSignal?.aborted).toBe(true)
    expect(store.stage).toBe('CANCELLED')
    expect(store.isStreaming).toBe(false)
    expect(() => JSON.stringify(store.$state)).not.toThrow()
  })

  it('does not let a cancelled stream clear the streaming state of its replacement', async () => {
    const releaseReplacement = deferred<void>()
    let streamNumber = 0
    const stream = vi.fn(async function* (_request, { signal }) {
      streamNumber += 1
      if (streamNumber === 1) {
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
        return
      }
      yield { id: 1, type: 'message.started', messageId: 'replacement', role: 'assistant' } satisfies AgentEvent
      await releaseReplacement.promise
    })
    transport = transportFrom(stream)
    const store = useTestAgentStore()

    const cancelled = store.sendMessage('First request')
    await flush()
    store.resetConversation()
    const replacement = store.sendMessage('Replacement request')
    await cancelled
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2))

    expect(store.isStreaming).toBe(true)
    await expect(store.sendMessage('Must stay blocked')).resolves.toBe(false)
    expect(stream).toHaveBeenCalledTimes(2)

    releaseReplacement.resolve()
    await replacement
  })

  it('surfaces a non-recoverable stream error without enabling retry', async () => {
    transport = transportFrom(async function* () {
      yield {
        id: 1,
        type: 'stream.failed',
        code: 'API_ERROR',
        recoverable: false,
        message: 'Request rejected',
      }
    })
    const store = useTestAgentStore()

    await expect(store.sendMessage('Fail permanently')).resolves.toBe(false)

    expect(store.stage).toBe('FAILED')
    expect(store.error).toEqual({ code: 'API_ERROR', recoverable: false, message: 'Request rejected' })
    expect(store.canRetry).toBe(false)
    await expect(store.retry()).resolves.toBe(false)
  })

  it('ignores a replayed older stream failure and continues with sequential events', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'message.started', messageId: 'message-1', role: 'assistant' }
      yield {
        id: 1,
        type: 'stream.failed',
        code: 'NETWORK_ERROR',
        recoverable: true,
        message: 'Old replayed failure',
      }
      yield { id: 2, type: 'stream.completed' }
    })
    const store = useTestAgentStore()

    await expect(store.sendMessage('Ignore the replay')).resolves.toBe(true)

    expect(store.lastEventId).toBe(2)
    expect(store.stage).toBe('COMPLETE')
    expect(store.error).toBeNull()
  })

  it('keeps the confirmation snapshot immutable and rejects a changed payload hash as stale', async () => {
    const first = { ...confirmation() }
    const changed = confirmation({ payloadHash: 'payload-changed' })
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: first }
      yield { id: 2, type: 'confirmation.requested', confirmation: changed }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart')

    await store.sendMessage('Prepare an operation')
    first.quantity = 99

    expect(store.pendingConfirmation).toMatchObject({ quantity: 2, payloadHash: 'payload-changed' })
    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(false)
    expect(store.staleConfirmationIds).toContain('confirmation-1')
    expect(add).not.toHaveBeenCalled()
  })

  it.each([
    ['duplicate', 1],
    ['gapped', 3],
  ])('does not let an ignored %s confirmation poison the accepted snapshot', async (_case, ignoredId) => {
    const accepted = confirmation()
    const ignored = confirmation({ payloadHash: 'ignored-payload' })
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: accepted }
      yield { id: ignoredId, type: 'confirmation.requested', confirmation: ignored }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart').mockResolvedValue(undefined)

    await store.sendMessage('Prepare an operation')

    expect(store.confirmationSnapshots['confirmation-1']?.payloadHash).toBe('payload-1')
    expect(store.staleConfirmationIds).not.toContain('confirmation-1')
    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(true)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('re-freezes validated confirmation snapshots after persisted-state hydration', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
    })
    const seed = useTestAgentStore()
    await seed.sendMessage('Persist an operation')
    localStorage.setItem('agent-test', JSON.stringify({
      protocolState: seed.protocolState,
      lastRequest: seed.lastRequest,
      confirmationSnapshots: seed.confirmationSnapshots,
      staleConfirmationIds: seed.staleConfirmationIds,
      rejectedConfirmationIds: seed.rejectedConfirmationIds,
    }))

    const hydratedPinia = createPinia()
    hydratedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(hydratedPinia)
    setActivePinia(hydratedPinia)
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart').mockResolvedValue(undefined)
    const snapshot = store.confirmationSnapshots['confirmation-1']

    expect(Object.isFrozen(toRaw(snapshot))).toBe(true)
    expect(() => {
      ;(snapshot as { quantity: number }).quantity = 99
    }).toThrow()
    expect(store.pendingConfirmation).toMatchObject({
      id: 'confirmation-1',
      payloadHash: 'payload-1',
    })
    expect(store.staleConfirmationIds).toEqual([])
    expect(store.rejectedConfirmationIds).toEqual([])
    expect(store.completedConfirmationIds).toEqual([])
    expect(store.attemptedIdempotencyKeys).toEqual([])
    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(true)
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ count: 2 }))
  })

  it('mutates the cart exactly once across concurrent and repeated confirmations', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const added = deferred<void>()
    const add = vi.spyOn(cart, 'addcart').mockImplementation(() => added.promise)
    await store.sendMessage('Prepare an operation')

    const first = store.confirmOperation('confirmation-1')
    const concurrent = store.confirmOperation('confirmation-1')
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      id: 'product-1',
      skuId: 'sku-1',
      name: 'Quiet Coffee Grinder',
      attrsText: 'Black',
      price: 199,
      count: 2,
      selected: true,
    }))

    added.resolve()
    await expect(Promise.all([first, concurrent])).resolves.toEqual([true, true])
    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(false)

    expect(add).toHaveBeenCalledTimes(1)
    expect(store.completedConfirmationIds).toContain('confirmation-1')
    expect(store.pendingConfirmation).toBeNull()
  })

  it('does not share an in-flight write after a same-ID confirmation becomes stale', async () => {
    const replace = deferred<void>()
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
      await replace.promise
      yield {
        id: 2,
        type: 'confirmation.requested',
        confirmation: confirmation({ payloadHash: 'payload-replaced' }),
      }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const added = deferred<void>()
    const add = vi.spyOn(cart, 'addcart').mockImplementation(() => added.promise)
    const stream = store.sendMessage('Prepare an operation')
    await vi.waitFor(() => expect(store.pendingConfirmation).not.toBeNull())
    const first = store.confirmOperation('confirmation-1')

    replace.resolve()
    await vi.waitFor(() => expect(store.staleConfirmationIds).toContain('confirmation-1'))
    const stale = store.confirmOperation('confirmation-1')
    added.resolve()

    await expect(Promise.all([first, stale])).resolves.toEqual([true, false])
    await stream
    expect(add).toHaveBeenCalledTimes(1)
    expect(store.pendingConfirmation).toMatchObject({ payloadHash: 'payload-replaced' })
  })

  it('keeps an ambiguous failed cart write from being invoked a second time', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart').mockImplementation(async (item) => {
      cart.cartList.push(item)
      throw new Error('Cart refresh failed after the write')
    })
    await store.sendMessage('Prepare an operation')

    await expect(store.confirmOperation('confirmation-1')).rejects.toThrow('Cart refresh failed')
    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(false)

    expect(add).toHaveBeenCalledTimes(1)
    expect(cart.cartList).toHaveLength(1)
    expect(store.attemptedIdempotencyKeys).toContain('operation-1')
  })

  it('does not clear or leak an in-flight confirmation write across reset', async () => {
    const stream = vi.fn(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() } satisfies AgentEvent
    })
    transport = transportFrom(stream)
    const store = useTestAgentStore()
    const cart = useCartStore()
    const added = deferred<void>()
    vi.spyOn(cart, 'addcart').mockImplementation(() => added.promise)
    await store.sendMessage('Prepare an operation')
    const write = store.confirmOperation('confirmation-1')

    store.resetConversation()

    expect(store.canSend).toBe(false)
    await expect(store.sendMessage('Must wait for the write')).resolves.toBe(false)
    expect(stream).toHaveBeenCalledTimes(1)
    const missing = store.confirmOperation('confirmation-1')

    added.resolve()
    await expect(Promise.all([write, missing])).resolves.toEqual([true, false])
    expect(store.stage).toBeNull()
    expect(store.pendingConfirmation).toBeNull()
    expect(store.completedConfirmationIds).toEqual([])
    expect(store.canSend).toBe(true)
  })

  it('retains the idempotency key and cart completion across a stream retry', async () => {
    const disconnect = deferred<void>()
    let attempt = 0
    transport = transportFrom(async function* (_request, { afterEventId }) {
      attempt += 1
      if (attempt === 1) {
        yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
        await disconnect.promise
        throw Object.assign(new Error('Connection dropped'), { recoverable: true })
      }
      expect(afterEventId).toBe(1)
      yield { id: 2, type: 'stream.completed' }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart').mockResolvedValue(undefined)
    const active = store.sendMessage('Prepare an operation')
    await vi.waitFor(() => expect(store.pendingConfirmation).not.toBeNull())

    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(true)
    expect(store.confirmationSnapshots['confirmation-1']?.idempotencyKey).toBe('operation-1')
    disconnect.resolve()
    await expect(active).resolves.toBe(false)
    await expect(store.retry()).resolves.toBe(true)
    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(false)

    expect(add).toHaveBeenCalledTimes(1)
    expect(store.completedConfirmationIds).toContain('confirmation-1')
    expect(store.confirmationSnapshots['confirmation-1']?.idempotencyKey).toBe('operation-1')
  })

  it('rejects a pending operation without mutating the cart', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart')
    await store.sendMessage('Prepare an operation')

    expect(store.rejectOperation('confirmation-1')).toBe(true)
    expect(store.rejectOperation('confirmation-1')).toBe(false)
    expect(store.pendingConfirmation).toBeNull()
    expect(store.rejectedConfirmationIds).toContain('confirmation-1')
    expect(add).not.toHaveBeenCalled()
  })

  it('resets serializable conversation and cursor state', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'message.started', messageId: 'message-1', role: 'assistant' }
      yield { id: 2, type: 'message.delta', messageId: 'message-1', delta: 'Hello' }
    })
    const store = useTestAgentStore()
    await store.sendMessage('Reset me')

    store.resetConversation()

    expect(store.lastEventId).toBe(0)
    expect(store.messages).toEqual({})
    expect(store.stage).toBeNull()
    expect(store.error).toBeNull()
    expect(store.canSend).toBe(true)
  })
})
