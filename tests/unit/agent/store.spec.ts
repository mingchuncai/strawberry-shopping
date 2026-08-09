import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp, toRaw } from 'vue'

vi.mock('element-plus', () => ({ ElMessage: vi.fn() }))
vi.mock('element-plus/es/components/message/style/css', () => ({}))

import { createMockAgentTransport } from '@/features/agent/api'
import { createAgentStore, useAgentStore } from '@/features/agent/store'
import { initialAgentProtocolState } from '@/features/agent/protocol'
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

  it('runs two independent default conversations through pending confirmation to cart completion', async () => {
    const store = useAgentStore()
    const cart = useCartStore()

    await expect(store.sendMessage('Find quiet coffee gear')).resolves.toBe(false)
    const first = store.pendingConfirmation
    expect(first).toMatchObject({
      id: expect.any(String),
      idempotencyKey: expect.any(String),
    })
    expect(store.protocolState).toMatchObject({
      stage: 'WAIT_CONFIRMATION',
      isStreamCompleted: true,
      isCompleted: false,
      error: null,
    })
    expect(store.canRetry).toBe(false)
    if (!first) throw new Error('expected first confirmation')

    await expect(store.confirmOperation(first.id)).resolves.toBe(true)
    expect(store.protocolState).toMatchObject({
      stage: 'COMPLETE',
      isCompleted: true,
      pendingConfirmation: null,
    })

    await expect(store.sendMessage('Find another quiet coffee kit')).resolves.toBe(false)
    const second = store.pendingConfirmation
    expect(second).toMatchObject({
      id: expect.any(String),
      idempotencyKey: expect.any(String),
    })
    if (!second) throw new Error('expected second confirmation')
    expect(second.id).not.toBe(first.id)
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)

    await expect(store.confirmOperation(second.id)).resolves.toBe(true)
    expect(cart.cartList).toEqual([
      expect.objectContaining({ skuId: second.skuId, count: 2 }),
    ])
  })

  it.each(['confirm', 'reject'] as const)(
    'completes the WAIT_CONFIRMATION trail when the user chooses to %s',
    async (decision) => {
      transport = transportFrom(async function* () {
        yield {
          id: 1,
          type: 'trail.updated',
          stage: 'WAIT_CONFIRMATION',
          label: 'Awaiting confirmation',
          status: 'running',
        }
        yield { id: 2, type: 'confirmation.requested', confirmation: confirmation() }
        yield { id: 3, type: 'stream.completed' }
      })
      const store = useTestAgentStore()
      const cart = useCartStore()
      const add = vi.spyOn(cart, 'addcart').mockResolvedValue(undefined)
      await store.sendMessage('Prepare an operation')

      if (decision === 'confirm') {
        await expect(store.confirmOperation('confirmation-1')).resolves.toBe(true)
        expect(add).toHaveBeenCalledTimes(1)
      } else {
        expect(store.rejectOperation('confirmation-1')).toBe(true)
        expect(add).not.toHaveBeenCalled()
      }

      expect(store.stage).toBe('COMPLETE')
      expect(store.trail.find((item) => item.stage === 'WAIT_CONFIRMATION')).toMatchObject({
        status: 'completed',
      })
    },
  )

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

  it('persists one operation scope across a real mock disconnect and resume', async () => {
    const useResumableAgentStore = createAgentStore(
      () => createMockAgentTransport({ failAfterEventId: 11 }),
      'agent-resumable-integration',
    )
    const store = useResumableAgentStore()

    await expect(store.sendMessage('Resume the default scenario')).resolves.toBe(false)
    const beforeRetry = store.pendingConfirmation
    expect(store.error).toMatchObject({ code: 'NETWORK_ERROR', recoverable: true })
    expect(store.lastRequest).toMatchObject({
      message: 'Resume the default scenario',
      operationScope: expect.any(String),
    })
    if (!beforeRetry) throw new Error('expected confirmation before retry')

    await expect(store.retry()).resolves.toBe(false)

    expect(store.pendingConfirmation).toEqual(beforeRetry)
    expect(store.confirmationSnapshots[beforeRetry.id]).toEqual(beforeRetry)
    expect(store.protocolState).toMatchObject({
      stage: 'WAIT_CONFIRMATION',
      isStreamCompleted: true,
      isCompleted: false,
      error: null,
    })
    expect(store.canRetry).toBe(false)
  })

  it('treats a configured disconnect after the terminal mock event as terminal', async () => {
    const useFinalEventAgentStore = createAgentStore(
      () => createMockAgentTransport({ failAfterEventId: 13 }),
      'agent-final-event-integration',
    )
    const store = useFinalEventAgentStore()

    await expect(store.sendMessage('Finish at the final event')).resolves.toBe(false)

    expect(store.protocolState).toMatchObject({
      stage: 'WAIT_CONFIRMATION',
      isStreamCompleted: true,
      isCompleted: false,
      error: null,
    })
    expect(store.pendingConfirmation).not.toBeNull()
    expect(store.canRetry).toBe(false)
    await expect(store.retry()).resolves.toBe(false)
  })

  it('turns iterator EOF before stream.completed into a recoverable disconnect', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'message.started', messageId: 'message-1', role: 'assistant' }
      yield { id: 2, type: 'message.delta', messageId: 'message-1', delta: 'Partial' }
    })
    const store = useTestAgentStore()

    await expect(store.sendMessage('Disconnect at EOF')).resolves.toBe(false)

    expect(store.lastEventId).toBe(2)
    expect(store.stage).toBe('FAILED')
    expect(store.error).toMatchObject({
      code: 'NETWORK_ERROR',
      recoverable: true,
      message: expect.stringMatching(/ended|disconnect/i),
    })
    expect(store.canRetry).toBe(true)
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

    expect(store.confirmationSnapshots['confirmation-1']).toMatchObject({
      quantity: 2,
      payloadHash: 'payload-1',
    })
    expect(store.pendingConfirmation).toBeNull()
    expect(store.stage).toBe('FAILED')
    expect(store.error).toMatchObject({ recoverable: false })
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

  it('normalizes every persisted protocol collection, cursor, status and error field', () => {
    localStorage.setItem('agent-test', JSON.stringify({
      protocolState: {
        lastEventId: -9,
        messages: {
          broken: { id: 42, role: 'user', content: null, completed: 'yes' },
        },
        trail: [{ stage: 'UNKNOWN', label: 7, status: 'done' }],
        recommendationGroups: [{}],
        pendingConfirmation: { malformed: true },
        completedConfirmationIds: ['done-1', 42, 'done-1'],
        cartItemCount: -2,
        stage: 'UNKNOWN',
        isCompleted: 'yes',
        error: { code: 'BAD_CODE', message: 9, recoverable: 'yes' },
      },
      lastRequest: 42,
      confirmationSnapshots: { malformed: { id: 'broken' } },
      staleConfirmationIds: ['stale-1', 7, 'stale-1'],
      rejectedConfirmationIds: 'not-an-array',
      attemptedIdempotencyKeys: ['attempt-1', null, 'attempt-1'],
    }))
    const hydratedPinia = createPinia()
    hydratedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(hydratedPinia)
    setActivePinia(hydratedPinia)

    const store = useTestAgentStore()

    expect(store.protocolState).toEqual({
      ...initialAgentProtocolState,
      completedConfirmationIds: ['done-1'],
    })
    expect(store.lastRequest).toBeNull()
    expect(store.confirmationSnapshots).toEqual({})
    expect(store.staleConfirmationIds).toEqual(['stale-1'])
    expect(store.rejectedConfirmationIds).toEqual([])
    expect(store.attemptedIdempotencyKeys).toEqual(['attempt-1'])
  })

  it('reconstructs an interrupted persisted stream as recoverable without a runtime controller', () => {
    localStorage.setItem('agent-test', JSON.stringify({
      protocolState: {
        ...initialAgentProtocolState,
        lastEventId: 2,
        messages: {
          'message-1': {
            id: 'message-1',
            role: 'assistant',
            content: 'Partial response',
            completed: false,
          },
        },
        stage: 'UNDERSTAND',
        isStreamCompleted: false,
      },
      lastRequest: {
        message: 'Persisted request',
        operationScope: 'persisted-conversation',
      },
      confirmationSnapshots: {},
      staleConfirmationIds: [],
      rejectedConfirmationIds: [],
      attemptedIdempotencyKeys: [],
    }))
    const hydratedPinia = createPinia()
    hydratedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(hydratedPinia)
    setActivePinia(hydratedPinia)

    const store = useTestAgentStore()

    expect(store.lastRequest).toEqual({
      message: 'Persisted request',
      operationScope: 'persisted-conversation',
    })
    expect(store.lastEventId).toBe(2)
    expect(store.stage).toBe('FAILED')
    expect(store.error).toMatchObject({ code: 'NETWORK_ERROR', recoverable: true })
    expect(store.canRetry).toBe(true)
  })

  it.each([
    {
      ledger: 'completed',
      completedConfirmationIds: ['confirmation-1'],
      rejectedConfirmationIds: [],
      staleConfirmationIds: [],
      attemptedIdempotencyKeys: ['operation-1'],
      expectedStage: 'COMPLETE',
      expectedCompleted: true,
      expectedRecoverable: undefined,
    },
    {
      ledger: 'rejected',
      completedConfirmationIds: [],
      rejectedConfirmationIds: ['confirmation-1'],
      staleConfirmationIds: [],
      attemptedIdempotencyKeys: [],
      expectedStage: 'COMPLETE',
      expectedCompleted: true,
      expectedRecoverable: undefined,
    },
    {
      ledger: 'stale',
      completedConfirmationIds: [],
      rejectedConfirmationIds: [],
      staleConfirmationIds: ['confirmation-1'],
      attemptedIdempotencyKeys: [],
      expectedStage: 'FAILED',
      expectedCompleted: false,
      expectedRecoverable: false,
    },
  ])('reconciles a hydrated pending confirmation with the $ledger ledger', ({
    completedConfirmationIds,
    rejectedConfirmationIds,
    staleConfirmationIds,
    attemptedIdempotencyKeys,
    expectedStage,
    expectedCompleted,
    expectedRecoverable,
  }) => {
    const snapshot = confirmation()
    localStorage.setItem('agent-test', JSON.stringify({
      protocolState: {
        ...initialAgentProtocolState,
        lastEventId: 13,
        pendingConfirmation: snapshot,
        completedConfirmationIds,
        stage: 'WAIT_CONFIRMATION',
        isStreamCompleted: true,
        isCompleted: false,
      },
      lastRequest: {
        message: 'Persisted operation',
        operationScope: 'persisted-operation',
      },
      confirmationSnapshots: { 'confirmation-1': snapshot },
      staleConfirmationIds,
      rejectedConfirmationIds,
      attemptedIdempotencyKeys,
    }))
    const hydratedPinia = createPinia()
    hydratedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(hydratedPinia)
    setActivePinia(hydratedPinia)

    const store = useTestAgentStore()

    expect(store.pendingConfirmation).toBeNull()
    expect(store.stage).toBe(expectedStage)
    expect(store.protocolState.isCompleted).toBe(expectedCompleted)
    if (expectedRecoverable === undefined) expect(store.error).toBeNull()
    else expect(store.error).toMatchObject({ recoverable: expectedRecoverable })
  })

  it('hydrates an interrupted cart write into an explicit non-retryable ambiguous state', async () => {
    const snapshot = confirmation()
    localStorage.setItem('agent-test', JSON.stringify({
      protocolState: {
        ...initialAgentProtocolState,
        lastEventId: 13,
        pendingConfirmation: snapshot,
        stage: 'WAIT_CONFIRMATION',
        isStreamCompleted: true,
        isCompleted: false,
      },
      lastRequest: {
        message: 'Persisted operation',
        operationScope: 'persisted-operation',
      },
      confirmationSnapshots: { 'confirmation-1': snapshot },
      staleConfirmationIds: [],
      rejectedConfirmationIds: [],
      attemptedIdempotencyKeys: ['operation-1'],
    }))
    const hydratedPinia = createPinia()
    hydratedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(hydratedPinia)
    setActivePinia(hydratedPinia)
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart')

    expect(store.pendingConfirmation).toBeNull()
    expect(store.stage).toBe('FAILED')
    expect(store.error).toMatchObject({
      recoverable: false,
      message: expect.stringMatching(/cart|outcome|unknown|ambiguous/i),
    })
    expect(store.canRetry).toBe(false)
    expect(store.canSend).toBe(false)
    await expect(store.sendMessage('Do not duplicate the ambiguous write')).resolves.toBe(false)
    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(false)
    expect(add).not.toHaveBeenCalled()

    expect(store.operationAttempts).toEqual([
      expect.objectContaining({
        confirmationId: 'confirmation-1',
        idempotencyKey: 'operation-1',
        status: 'ambiguous',
        snapshot,
      }),
    ])
    store.resetConversation()
    expect(store.operationAttempts).toEqual([
      expect.objectContaining({ status: 'acknowledged' }),
    ])
    expect(store.canSend).toBe(true)
  })

  it('lets a hydrated unknown write dominate a distinct pending confirmation globally', async () => {
    const attempted = confirmation({
      id: 'confirmation-a',
      idempotencyKey: 'operation-a',
      payloadHash: 'payload-a',
    })
    const pending = confirmation({
      id: 'confirmation-b',
      skuId: 'sku-b',
      idempotencyKey: 'operation-b',
      payloadHash: 'payload-b',
    })
    localStorage.setItem('agent-test', JSON.stringify({
      protocolState: {
        ...initialAgentProtocolState,
        lastEventId: 2,
        trail: [{
          stage: 'WAIT_CONFIRMATION',
          label: 'Awaiting confirmation',
          status: 'running',
        }],
        pendingConfirmation: pending,
        stage: 'FAILED',
        error: {
          code: 'NETWORK_ERROR',
          message: 'Connection dropped',
          recoverable: true,
        },
      },
      lastRequest: {
        message: 'Persisted operation B',
        operationScope: 'persisted-operation-b',
      },
      confirmationSnapshots: {
        'confirmation-a': attempted,
        'confirmation-b': pending,
      },
      staleConfirmationIds: [],
      rejectedConfirmationIds: [],
      attemptedIdempotencyKeys: ['operation-a'],
    }))
    const hydratedPinia = createPinia()
    hydratedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(hydratedPinia)
    setActivePinia(hydratedPinia)
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart')

    expect(store.pendingConfirmation).toBeNull()
    expect(store.stage).toBe('FAILED')
    expect(store.error).toMatchObject({ recoverable: false })
    expect(store.canSend).toBe(false)
    expect(store.canRetry).toBe(false)
    expect(store.trail.find((item) => item.stage === 'WAIT_CONFIRMATION')).toMatchObject({
      status: 'failed',
    })
    expect(store.operationAttempts).toEqual([
      expect.objectContaining({
        confirmationId: 'confirmation-a',
        idempotencyKey: 'operation-a',
        status: 'ambiguous',
        snapshot: attempted,
      }),
    ])
    await expect(store.confirmOperation('confirmation-b')).resolves.toBe(false)
    expect(add).not.toHaveBeenCalled()
  })

  it('drops a hydrated pending confirmation that differs from its frozen snapshot', async () => {
    const snapshot = confirmation()
    const mismatchedPending = confirmation({ quantity: 3, totalPrice: 597 })
    localStorage.setItem('agent-test', JSON.stringify({
      protocolState: {
        ...initialAgentProtocolState,
        pendingConfirmation: mismatchedPending,
        stage: 'WAIT_CONFIRMATION',
      },
      lastRequest: 'Persisted operation',
      confirmationSnapshots: { 'confirmation-1': snapshot },
      staleConfirmationIds: [],
      rejectedConfirmationIds: [],
      attemptedIdempotencyKeys: [],
    }))
    const hydratedPinia = createPinia()
    hydratedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(hydratedPinia)
    setActivePinia(hydratedPinia)
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart').mockResolvedValue(undefined)

    expect(Object.isFrozen(toRaw(store.confirmationSnapshots['confirmation-1']))).toBe(true)
    expect(store.pendingConfirmation).toBeNull()
    expect(store.staleConfirmationIds).toContain('confirmation-1')
    expect(store.stage).toBe('FAILED')
    expect(store.error).toMatchObject({ recoverable: false })
    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(false)
    expect(add).not.toHaveBeenCalled()
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

  it('rejects confirmation when the displayed operation no longer matches its snapshot', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
      yield { id: 2, type: 'stream.completed' }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const add = vi.spyOn(cart, 'addcart')
    await store.sendMessage('Prepare an operation')

    store.protocolState = {
      ...store.protocolState,
      pendingConfirmation: confirmation({ quantity: 3, totalPrice: 597 }),
    }

    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(false)
    expect(add).not.toHaveBeenCalled()
  })

  it('rejects an add-to-cart operation that would exceed the cart quantity limit', async () => {
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
      yield { id: 2, type: 'stream.completed' }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    cart.cartList.push({
      id: 'product-1',
      skuId: 'sku-1',
      name: 'Quiet Coffee Grinder',
      picture: '/coffee.png',
      price: 199,
      count: 98,
      selected: true,
      attrsText: 'Black',
    })
    const add = vi.spyOn(cart, 'addcart')
    await store.sendMessage('Prepare an operation')

    await expect(store.confirmOperation('confirmation-1')).resolves.toBe(false)

    expect(add).not.toHaveBeenCalled()
    expect(cart.cartList[0]?.count).toBe(98)
    expect(store.pendingConfirmation?.id).toBe('confirmation-1')
  })

  it('does not share an in-flight write after a same-ID confirmation becomes stale', async () => {
    const replace = deferred<void>()
    transport = transportFrom(async function* () {
      yield {
        id: 1,
        type: 'trail.updated',
        stage: 'WAIT_CONFIRMATION',
        label: 'Awaiting confirmation',
        status: 'running',
      }
      yield { id: 2, type: 'confirmation.requested', confirmation: confirmation() }
      await replace.promise
      yield {
        id: 3,
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
    expect(store.pendingConfirmation).toBeNull()
    expect(store.completedConfirmationIds).toContain('confirmation-1')
    expect(store.stage).toBe('FAILED')
    expect(store.error).toMatchObject({ recoverable: false })
    expect(store.trail.find((item) => item.stage === 'WAIT_CONFIRMATION')).toMatchObject({
      status: 'failed',
    })
  })

  it('blocks a distinct confirmation while any cart write is in flight', async () => {
    const showSecond = deferred<void>()
    transport = transportFrom(async function* () {
      yield { id: 1, type: 'confirmation.requested', confirmation: confirmation() }
      await showSecond.promise
      yield {
        id: 2,
        type: 'confirmation.requested',
        confirmation: confirmation({
          id: 'confirmation-2',
          skuId: 'sku-2',
          payloadHash: 'payload-2',
          idempotencyKey: 'operation-2',
        }),
      }
    })
    const store = useTestAgentStore()
    const cart = useCartStore()
    const firstAdded = deferred<void>()
    const add = vi.spyOn(cart, 'addcart')
      .mockImplementationOnce(() => firstAdded.promise)
      .mockResolvedValueOnce(undefined)
    const active = store.sendMessage('Prepare operations')
    await vi.waitFor(() => expect(store.pendingConfirmation?.id).toBe('confirmation-1'))
    const first = store.confirmOperation('confirmation-1')

    showSecond.resolve()
    await vi.waitFor(() => expect(store.pendingConfirmation?.id).toBe('confirmation-2'))
    await active
    await expect(store.confirmOperation('confirmation-2')).resolves.toBe(false)
    expect(add).toHaveBeenCalledTimes(1)

    firstAdded.resolve()
    await expect(first).resolves.toBe(true)
    await expect(store.confirmOperation('confirmation-2')).resolves.toBe(true)
    expect(add).toHaveBeenCalledTimes(2)
  })

  it('keeps an ambiguous failed cart write from being invoked a second time', async () => {
    transport = transportFrom(async function* () {
      yield {
        id: 1,
        type: 'trail.updated',
        stage: 'WAIT_CONFIRMATION',
        label: 'Awaiting confirmation',
        status: 'running',
      }
      yield { id: 2, type: 'confirmation.requested', confirmation: confirmation() }
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
    expect(store.pendingConfirmation).toBeNull()
    expect(store.stage).toBe('FAILED')
    expect(store.error).toMatchObject({
      recoverable: false,
      message: expect.stringMatching(/cart|outcome|unknown/i),
    })
    expect(store.trail.find((item) => item.stage === 'WAIT_CONFIRMATION')).toMatchObject({
      status: 'failed',
    })
    expect(store.canSend).toBe(false)
    await expect(store.sendMessage('Do not duplicate the ambiguous write')).resolves.toBe(false)
    store.resetConversation()
    expect(store.canSend).toBe(true)
    expect(store.operationAttempts).toEqual([
      expect.objectContaining({ status: 'acknowledged' }),
    ])
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

  it('persists an unresolved write across reset and hydration before blocking all new work', async () => {
    let streamCall = 0
    const stream = vi.fn(async function* () {
      streamCall += 1
      const proposed = streamCall === 1
        ? confirmation({ id: 'confirmation-a', idempotencyKey: 'operation-a' })
        : confirmation({
            id: 'confirmation-b',
            skuId: 'sku-b',
            payloadHash: 'payload-b',
            idempotencyKey: 'operation-b',
          })
      yield {
        id: 1,
        type: 'trail.updated',
        stage: 'WAIT_CONFIRMATION',
        label: 'Awaiting confirmation',
        status: 'running',
      } satisfies AgentEvent
      yield { id: 2, type: 'confirmation.requested', confirmation: proposed } satisfies AgentEvent
      yield { id: 3, type: 'stream.completed' } satisfies AgentEvent
    })
    transport = transportFrom(stream)
    const persistedPinia = createPinia()
    persistedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(persistedPinia)
    setActivePinia(persistedPinia)
    const seed = useTestAgentStore()
    const seedCart = useCartStore()
    const added = deferred<void>()
    const seedAdd = vi.spyOn(seedCart, 'addcart').mockImplementation(() => added.promise)
    await seed.sendMessage('Prepare operation A')
    const write = seed.confirmOperation('confirmation-a')

    seed.resetConversation()
    await vi.waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem('agent-test') ?? '{}') as {
        attemptedIdempotencyKeys?: string[]
        operationAttempts?: Array<{
          confirmationId?: string
          idempotencyKey?: string
          status?: string
          snapshot?: OperationConfirmation
        }>
      }
      expect(persisted.attemptedIdempotencyKeys).toContain('operation-a')
      expect(persisted.operationAttempts).toEqual([
        expect.objectContaining({
          confirmationId: 'confirmation-a',
          idempotencyKey: 'operation-a',
          status: 'in_flight',
          snapshot: expect.objectContaining({ id: 'confirmation-a' }),
        }),
      ])
    })

    const hydratedPinia = createPinia()
    hydratedPinia.use(piniaPluginPersistedstate)
    createApp({}).use(hydratedPinia)
    setActivePinia(hydratedPinia)
    const hydrated = useTestAgentStore()
    const hydratedCart = useCartStore()
    const hydratedAdd = vi.spyOn(hydratedCart, 'addcart').mockResolvedValue(undefined)

    const retryResult = await hydrated.retry()
    const sendResult = await hydrated.sendMessage('Prepare operation B')
    const confirmResult = await hydrated.confirmOperation('confirmation-b')
    added.resolve()
    await write

    expect(hydrated.operationAttempts).toEqual([
      expect.objectContaining({
        confirmationId: 'confirmation-a',
        idempotencyKey: 'operation-a',
        status: 'ambiguous',
        snapshot: expect.objectContaining({ id: 'confirmation-a' }),
      }),
    ])
    expect(hydrated.pendingConfirmation).toBeNull()
    expect(hydrated.error).toMatchObject({ recoverable: false })
    expect(hydrated.canSend).toBe(false)
    expect(hydrated.canRetry).toBe(false)
    expect(retryResult).toBe(false)
    expect(sendResult).toBe(false)
    expect(confirmResult).toBe(false)
    expect(stream).toHaveBeenCalledTimes(1)
    expect(seedAdd).toHaveBeenCalledTimes(1)
    expect(hydratedAdd).not.toHaveBeenCalled()
  })

  it('keeps a confirmed workflow complete when its still-open transport later disconnects', async () => {
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
    expect(store.cancel()).toBe(false)
    expect(store.stage).toBe('COMPLETE')
    disconnect.resolve()
    await expect(active).resolves.toBe(true)
    expect(store.protocolState.isCompleted).toBe(true)
    expect(store.stage).toBe('COMPLETE')
    expect(store.error).toBeNull()
    expect(store.canRetry).toBe(false)
    await expect(store.retry()).resolves.toBe(false)
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
