import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import fallbackProductPicture from '@/assets/images/200.png'
import { useCartStore } from '@/stores/cart'
import type { AppError, AppErrorCode } from '@/types/api'
import type { CartItem } from '@/types/domain'

import { createMockAgentTransport } from './api'
import {
  initialAgentProtocolState,
  parseAgentEvent,
  reduceAgentEvent,
  type AgentMessage,
  type AgentProtocolState,
  type AgentTrailItem,
} from './protocol'
import type { AgentStage, AgentTransport, OperationConfirmation } from './types'

export type AgentTransportFactory = () => AgentTransport

const appErrorCodes = new Set<AppErrorCode>([
  'NETWORK_ERROR',
  'UNAUTHORIZED',
  'TIMEOUT',
  'API_ERROR',
  'UNKNOWN',
])

const agentStages = new Set<AgentStage>([
  'UNDERSTAND',
  'CLARIFY',
  'PLAN',
  'EXECUTE_READ',
  'SYNTHESIZE',
  'WAIT_CONFIRMATION',
  'EXECUTE_WRITE',
  'COMPLETE',
  'FAILED',
  'CANCELLED',
])

const trailStatuses = new Set<AgentTrailItem['status']>([
  'pending',
  'running',
  'completed',
  'failed',
])

const freshProtocolState = (): AgentProtocolState => ({
  ...initialAgentProtocolState,
  messages: {},
  trail: [],
  recommendationGroups: [],
  completedConfirmationIds: [],
})

const immutableConfirmation = (
  value: OperationConfirmation,
): OperationConfirmation => Object.freeze({ ...value })

const parseImmutableConfirmation = (value: unknown): OperationConfirmation | null => {
  const parsed = parseAgentEvent({ id: 1, type: 'confirmation.requested', confirmation: value })
  return 'type' in parsed && parsed.type === 'confirmation.requested'
    ? immutableConfirmation(parsed.confirmation)
    : null
}

const confirmationFields: readonly (keyof OperationConfirmation)[] = [
  'id',
  'operation',
  'productId',
  'skuId',
  'productName',
  'attrsText',
  'quantity',
  'unitPrice',
  'totalPrice',
  'payloadHash',
  'idempotencyKey',
]

const confirmationsMatch = (
  left: OperationConfirmation,
  right: OperationConfirmation,
): boolean => confirmationFields.every((field) => left[field] === right[field])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const normalizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isNonEmptyString))]
}

const normalizeMessages = (value: unknown): Record<string, AgentMessage> => {
  if (!isRecord(value)) return {}
  const messages: Record<string, AgentMessage> = {}
  for (const [key, candidate] of Object.entries(value)) {
    if (
      key === '__proto__' ||
      key === 'prototype' ||
      key === 'constructor' ||
      !isRecord(candidate) ||
      candidate.id !== key ||
      candidate.role !== 'assistant' ||
      typeof candidate.content !== 'string' ||
      typeof candidate.completed !== 'boolean'
    ) {
      continue
    }
    messages[key] = {
      id: key,
      role: 'assistant',
      content: candidate.content,
      completed: candidate.completed,
    }
  }
  return messages
}

const normalizeTrail = (value: unknown): AgentTrailItem[] => {
  if (!Array.isArray(value)) return []
  const items = new Map<AgentStage, AgentTrailItem>()
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.stage !== 'string' ||
      !agentStages.has(candidate.stage as AgentStage) ||
      !isNonEmptyString(candidate.label) ||
      typeof candidate.status !== 'string' ||
      !trailStatuses.has(candidate.status as AgentTrailItem['status'])
    ) {
      continue
    }
    const stage = candidate.stage as AgentStage
    items.set(stage, {
      stage,
      label: candidate.label,
      status: candidate.status as AgentTrailItem['status'],
    })
  }
  return [...items.values()]
}

const normalizeRecommendationGroups = (
  value: unknown,
): AgentProtocolState['recommendationGroups'] => {
  const parsed = parseAgentEvent({ id: 1, type: 'recommendations.ready', groups: value })
  return 'type' in parsed && parsed.type === 'recommendations.ready' ? parsed.groups : []
}

const normalizeError = (value: unknown): AppError | null => {
  if (
    !isRecord(value) ||
    typeof value.code !== 'string' ||
    !appErrorCodes.has(value.code as AppErrorCode) ||
    !isNonEmptyString(value.message) ||
    typeof value.recoverable !== 'boolean' ||
    (value.status !== undefined &&
      (typeof value.status !== 'number' || !Number.isFinite(value.status)))
  ) {
    return null
  }
  return {
    code: value.code as AppErrorCode,
    message: value.message,
    recoverable: value.recoverable,
    ...(typeof value.status === 'number' ? { status: value.status } : {}),
  }
}

const appendUnique = (values: string[], value: string): string[] =>
  values.includes(value) ? values : [...values, value]

const transportError = (error: unknown): AppError => {
  const candidate = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown; recoverable?: unknown }
    : null
  const recoverable = candidate?.recoverable === true
  const code = typeof candidate?.code === 'string' && appErrorCodes.has(candidate.code as AppErrorCode)
    ? candidate.code as AppErrorCode
    : recoverable ? 'NETWORK_ERROR' : 'UNKNOWN'

  return {
    code,
    message: typeof candidate?.message === 'string' ? candidate.message : 'Agent stream failed',
    recoverable,
  }
}

const cartItemFrom = (value: OperationConfirmation): CartItem => ({
  id: value.productId,
  skuId: value.skuId,
  name: value.productName,
  picture: fallbackProductPicture,
  price: value.unitPrice,
  count: value.quantity,
  selected: true,
  attrsText: value.attrsText,
})

interface PersistedAgentConfirmationState {
  protocolState: unknown
  lastRequest: unknown
  confirmationSnapshots: unknown
  staleConfirmationIds: unknown
  rejectedConfirmationIds: unknown
  attemptedIdempotencyKeys: unknown
}

interface InFlightConfirmationWrite {
  promise: Promise<boolean>
  generation: number
  payloadHash: string
  idempotencyKey: string
}

const restoreConfirmationState = (store: PersistedAgentConfirmationState) => {
  const snapshots: Record<string, OperationConfirmation> = {}
  const snapshotValues = isRecord(store.confirmationSnapshots)
    ? Object.values(store.confirmationSnapshots)
    : []
  for (const value of snapshotValues) {
    const snapshot = parseImmutableConfirmation(value)
    if (snapshot) snapshots[snapshot.id] = snapshot
  }
  store.confirmationSnapshots = snapshots

  const raw = isRecord(store.protocolState) ? store.protocolState : {}
  const parsedPending = parseImmutableConfirmation(raw.pendingConfirmation)
  const snapshot = parsedPending ? snapshots[parsedPending.id] : null
  const pending = parsedPending && snapshot && confirmationsMatch(parsedPending, snapshot)
    ? snapshot
    : null
  const rawStage = typeof raw.stage === 'string' && agentStages.has(raw.stage as AgentStage)
    ? raw.stage as AgentStage
    : null
  store.protocolState = {
    lastEventId: typeof raw.lastEventId === 'number' &&
      Number.isSafeInteger(raw.lastEventId) && raw.lastEventId >= 0
      ? raw.lastEventId
      : 0,
    messages: normalizeMessages(raw.messages),
    trail: normalizeTrail(raw.trail),
    recommendationGroups: normalizeRecommendationGroups(raw.recommendationGroups),
    pendingConfirmation: pending,
    completedConfirmationIds: normalizeIds(raw.completedConfirmationIds),
    cartItemCount: typeof raw.cartItemCount === 'number' &&
      Number.isSafeInteger(raw.cartItemCount) && raw.cartItemCount >= 0
      ? raw.cartItemCount
      : null,
    stage: rawStage === 'WAIT_CONFIRMATION' && !pending ? null : rawStage,
    isCompleted: typeof raw.isCompleted === 'boolean' ? raw.isCompleted : false,
    error: normalizeError(raw.error),
  } satisfies AgentProtocolState

  const staleIds = normalizeIds(store.staleConfirmationIds)
  store.staleConfirmationIds = parsedPending && !pending
    ? appendUnique(staleIds, parsedPending.id)
    : staleIds
  store.rejectedConfirmationIds = normalizeIds(store.rejectedConfirmationIds)
  store.attemptedIdempotencyKeys = normalizeIds(store.attemptedIdempotencyKeys)
  store.lastRequest = isNonEmptyString(store.lastRequest) ? store.lastRequest.trim() || null : null
}

export const createAgentStore = (
  transportFactory: AgentTransportFactory,
  storeId = 'agent',
) => defineStore(
  storeId,
  () => {
    const protocolState = ref<AgentProtocolState>(freshProtocolState())
    const lastRequest = ref<string | null>(null)
    const confirmationSnapshots = ref<Record<string, OperationConfirmation>>({})
    const staleConfirmationIds = ref<string[]>([])
    const rejectedConfirmationIds = ref<string[]>([])
    const attemptedIdempotencyKeys = ref<string[]>([])
    const streaming = ref(false)
    const pendingWriteCount = ref(0)

    let activeController: AbortController | null = null
    let conversationGeneration = 0
    const confirmationWrites = new Map<string, InFlightConfirmationWrite>()

    const messages = computed(() => protocolState.value.messages)
    const trail = computed(() => protocolState.value.trail)
    const recommendationGroups = computed(() => protocolState.value.recommendationGroups)
    const pendingConfirmation = computed(() => protocolState.value.pendingConfirmation)
    const completedConfirmationIds = computed(() => protocolState.value.completedConfirmationIds)
    const lastEventId = computed(() => protocolState.value.lastEventId)
    const stage = computed(() => protocolState.value.stage)
    const error = computed(() => protocolState.value.error)
    const isStreaming = computed(() => streaming.value)
    const canSend = computed(() => !streaming.value && pendingWriteCount.value === 0)
    const canRetry = computed(() => Boolean(
      !streaming.value &&
      lastRequest.value &&
      protocolState.value.error?.recoverable,
    ))

    const rememberConfirmation = (value: OperationConfirmation) => {
      const existing = confirmationSnapshots.value[value.id]
      if (existing) {
        if (existing.payloadHash !== value.payloadHash) {
          staleConfirmationIds.value = appendUnique(staleConfirmationIds.value, value.id)
        }
        return
      }
      confirmationSnapshots.value = {
        ...confirmationSnapshots.value,
        [value.id]: immutableConfirmation(value),
      }
    }

    const runStream = async (
      message: string,
      afterEventId?: number,
    ): Promise<boolean> => {
      if (streaming.value) return false

      const controller = new AbortController()
      activeController = controller
      streaming.value = true
      protocolState.value = { ...protocolState.value, error: null }

      try {
        const options = afterEventId === undefined
          ? { signal: controller.signal }
          : { afterEventId, signal: controller.signal }
        for await (const event of transportFactory().stream({ message }, options)) {
          if (controller.signal.aborted) return false

          const previousEventId = protocolState.value.lastEventId
          const reduction = reduceAgentEvent(protocolState.value, event)
          protocolState.value = reduction.state
          const eventAccepted = event.id > previousEventId && reduction.state.lastEventId === event.id

          for (const effect of reduction.effects) {
            if (effect.type === 'confirmation.invalidated') {
              staleConfirmationIds.value = appendUnique(
                staleConfirmationIds.value,
                effect.confirmationId,
              )
            }
          }

          if (eventAccepted && event.type === 'confirmation.requested') {
            rememberConfirmation(event.confirmation)
          }

          if (reduction.effects.some((effect) => effect.type === 'stream.resume')) {
            protocolState.value = { ...protocolState.value, stage: 'FAILED' }
            return false
          }
          if (eventAccepted && event.type === 'stream.failed') return false
        }
      } catch (cause) {
        if (controller.signal.aborted) return false
        protocolState.value = {
          ...protocolState.value,
          stage: 'FAILED',
          error: transportError(cause),
        }
        return false
      } finally {
        if (activeController === controller) {
          activeController = null
          streaming.value = false
        }
      }

      return protocolState.value.isCompleted && protocolState.value.error === null
    }

    const clearConversationState = () => {
      conversationGeneration += 1
      protocolState.value = freshProtocolState()
      lastRequest.value = null
      confirmationSnapshots.value = {}
      staleConfirmationIds.value = []
      rejectedConfirmationIds.value = []
    }

    const sendMessage = async (text: string): Promise<boolean> => {
      const message = text.trim()
      if (!message || streaming.value || pendingWriteCount.value > 0) return false

      clearConversationState()
      lastRequest.value = message
      return runStream(message)
    }

    const cancel = (): boolean => {
      if (!activeController) return false
      protocolState.value = {
        ...protocolState.value,
        stage: 'CANCELLED',
        isCompleted: false,
        error: null,
      }
      activeController.abort()
      return true
    }

    const retry = async (): Promise<boolean> => {
      if (!canRetry.value || !lastRequest.value) return false
      return runStream(lastRequest.value, protocolState.value.lastEventId)
    }

    const confirmOperation = (id: string): Promise<boolean> => {
      const current = protocolState.value.pendingConfirmation
      const snapshot = confirmationSnapshots.value[id]
      if (
        !current ||
        current.id !== id ||
        !snapshot ||
        staleConfirmationIds.value.includes(id) ||
        rejectedConfirmationIds.value.includes(id) ||
        protocolState.value.completedConfirmationIds.includes(id) ||
        current.payloadHash !== snapshot.payloadHash
      ) {
        return Promise.resolve(false)
      }

      const existingWrite = confirmationWrites.get(id)
      if (existingWrite) {
        return existingWrite.generation === conversationGeneration &&
          existingWrite.payloadHash === snapshot.payloadHash &&
          existingWrite.idempotencyKey === snapshot.idempotencyKey
          ? existingWrite.promise
          : Promise.resolve(false)
      }
      if (confirmationWrites.size > 0) return Promise.resolve(false)
      if (attemptedIdempotencyKeys.value.includes(snapshot.idempotencyKey)) {
        return Promise.resolve(false)
      }

      attemptedIdempotencyKeys.value = appendUnique(
        attemptedIdempotencyKeys.value,
        snapshot.idempotencyKey,
      )
      pendingWriteCount.value += 1
      const writeGeneration = conversationGeneration
      const write = (async () => {
        const cartStore = useCartStore()
        await cartStore.addcart(cartItemFrom(snapshot))
        if (
          conversationGeneration === writeGeneration &&
          protocolState.value.pendingConfirmation?.id === id &&
          protocolState.value.pendingConfirmation.payloadHash === snapshot.payloadHash &&
          !staleConfirmationIds.value.includes(id)
        ) {
          protocolState.value = {
            ...protocolState.value,
            stage: 'COMPLETE',
            pendingConfirmation: null,
            completedConfirmationIds: appendUnique(
              protocolState.value.completedConfirmationIds,
              id,
            ),
            cartItemCount: cartStore.allcount,
          }
        }
        return true
      })()

      confirmationWrites.set(id, {
        promise: write,
        generation: writeGeneration,
        payloadHash: snapshot.payloadHash,
        idempotencyKey: snapshot.idempotencyKey,
      })
      const releaseWrite = () => {
        if (confirmationWrites.get(id)?.promise === write) confirmationWrites.delete(id)
        pendingWriteCount.value = Math.max(0, pendingWriteCount.value - 1)
      }
      void write.then(releaseWrite, releaseWrite)
      return write
    }

    const rejectOperation = (id: string): boolean => {
      const current = protocolState.value.pendingConfirmation
      if (!current || current.id !== id || confirmationWrites.has(id)) return false

      rejectedConfirmationIds.value = appendUnique(rejectedConfirmationIds.value, id)
      protocolState.value = {
        ...protocolState.value,
        stage: 'COMPLETE',
        pendingConfirmation: null,
      }
      return true
    }

    const resetConversation = () => {
      activeController?.abort()
      activeController = null
      streaming.value = false
      clearConversationState()
    }

    return {
      protocolState,
      lastRequest,
      confirmationSnapshots,
      staleConfirmationIds,
      rejectedConfirmationIds,
      attemptedIdempotencyKeys,
      messages,
      trail,
      recommendationGroups,
      pendingConfirmation,
      completedConfirmationIds,
      lastEventId,
      stage,
      error,
      canSend,
      canRetry,
      isStreaming,
      sendMessage,
      cancel,
      retry,
      confirmOperation,
      rejectOperation,
      resetConversation,
    }
  },
  {
    persist: {
      pick: [
        'protocolState',
        'lastRequest',
        'confirmationSnapshots',
        'staleConfirmationIds',
        'rejectedConfirmationIds',
        'attemptedIdempotencyKeys',
      ],
      afterHydrate: ({ store }) => {
        restoreConfirmationState(store as unknown as PersistedAgentConfirmationState)
      },
    },
  },
)

export const useAgentStore = createAgentStore(() => createMockAgentTransport())
