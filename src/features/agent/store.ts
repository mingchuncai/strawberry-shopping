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
import type {
  AgentRequest,
  AgentStage,
  AgentTransport,
  OperationConfirmation,
} from './types'

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

let operationScopeSequence = 0

const createOperationScope = (): string => {
  operationScopeSequence += 1
  const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${randomPart}-${operationScopeSequence.toString(36)}`
}

const normalizeAgentRequest = (value: unknown): AgentRequest | null => {
  if (isNonEmptyString(value)) {
    const message = value.trim()
    return message ? { message, operationScope: createOperationScope() } : null
  }
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.message) ||
    !isNonEmptyString(value.operationScope)
  ) {
    return null
  }
  const message = value.message.trim()
  const operationScope = value.operationScope.trim()
  return message && operationScope ? { message, operationScope } : null
}

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

const ambiguousCartWriteError = (): AppError => ({
  code: 'API_ERROR',
  message: 'The cart update outcome is unknown. Review the cart before starting another operation.',
  recoverable: false,
})

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

const settleWaitConfirmationTrail = (
  trail: AgentTrailItem[],
  status: 'completed' | 'failed',
): AgentTrailItem[] => trail.map((item) =>
  item.stage === 'WAIT_CONFIRMATION' ? { ...item, status } : item,
)

export type AgentOperationAttemptStatus =
  | 'in_flight'
  | 'completed'
  | 'ambiguous'
  | 'acknowledged'

export interface AgentOperationAttempt {
  readonly confirmationId: string
  readonly idempotencyKey: string
  readonly snapshot: OperationConfirmation
  readonly status: AgentOperationAttemptStatus
}

const operationAttemptStatuses = new Set<AgentOperationAttemptStatus>([
  'in_flight',
  'completed',
  'ambiguous',
  'acknowledged',
])

const operationAttemptPriority: Record<AgentOperationAttemptStatus, number> = {
  acknowledged: 1,
  completed: 2,
  in_flight: 3,
  ambiguous: 4,
}

const immutableOperationAttempt = (
  snapshot: OperationConfirmation,
  status: AgentOperationAttemptStatus,
): AgentOperationAttempt => Object.freeze({
  confirmationId: snapshot.id,
  idempotencyKey: snapshot.idempotencyKey,
  snapshot: immutableConfirmation(snapshot),
  status,
})

const normalizeOperationAttempts = (value: unknown): AgentOperationAttempt[] => {
  if (!Array.isArray(value)) return []
  const attempts = new Map<string, AgentOperationAttempt>()
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isNonEmptyString(candidate.confirmationId) ||
      !isNonEmptyString(candidate.idempotencyKey) ||
      typeof candidate.status !== 'string' ||
      !operationAttemptStatuses.has(candidate.status as AgentOperationAttemptStatus)
    ) {
      continue
    }
    const snapshot = parseImmutableConfirmation(candidate.snapshot)
    if (
      !snapshot ||
      snapshot.id !== candidate.confirmationId ||
      snapshot.idempotencyKey !== candidate.idempotencyKey
    ) {
      continue
    }
    const rawStatus = candidate.status as AgentOperationAttemptStatus
    const status = rawStatus === 'in_flight' ? 'ambiguous' : rawStatus
    const attempt = immutableOperationAttempt(snapshot, status)
    const existing = attempts.get(attempt.idempotencyKey)
    if (
      !existing ||
      operationAttemptPriority[attempt.status] > operationAttemptPriority[existing.status]
    ) {
      attempts.set(attempt.idempotencyKey, attempt)
    }
  }
  return [...attempts.values()]
}

interface PersistedAgentConfirmationState {
  protocolState: unknown
  lastRequest: unknown
  confirmationSnapshots: unknown
  staleConfirmationIds: unknown
  rejectedConfirmationIds: unknown
  attemptedIdempotencyKeys: unknown
  operationAttempts: unknown
}

interface InFlightConfirmationWrite {
  promise: Promise<boolean>
  generation: number
  payloadHash: string
  idempotencyKey: string
}

const restoreConfirmationState = (store: PersistedAgentConfirmationState) => {
  const raw = isRecord(store.protocolState) ? store.protocolState : {}
  const lastRequest = normalizeAgentRequest(store.lastRequest)
  let completedIds = normalizeIds(raw.completedConfirmationIds)
  let staleIds = normalizeIds(store.staleConfirmationIds)
  const rejectedIds = normalizeIds(store.rejectedConfirmationIds)
  const legacyAttemptedKeys = normalizeIds(store.attemptedIdempotencyKeys)

  const snapshots: Record<string, OperationConfirmation> = {}
  const snapshotValues = isRecord(store.confirmationSnapshots)
    ? Object.values(store.confirmationSnapshots)
    : []
  for (const value of snapshotValues) {
    const snapshot = parseImmutableConfirmation(value)
    if (snapshot) snapshots[snapshot.id] = snapshot
  }

  const operationAttempts = normalizeOperationAttempts(store.operationAttempts)
  for (const idempotencyKey of legacyAttemptedKeys) {
    if (operationAttempts.some((attempt) => attempt.idempotencyKey === idempotencyKey)) continue
    const snapshot = Object.values(snapshots).find(
      (candidate) => candidate.idempotencyKey === idempotencyKey,
    )
    if (!snapshot) continue
    operationAttempts.push(immutableOperationAttempt(
      snapshot,
      completedIds.includes(snapshot.id) ? 'completed' : 'ambiguous',
    ))
  }
  const attemptedKeys = normalizeIds([
    ...legacyAttemptedKeys,
    ...operationAttempts.map((attempt) => attempt.idempotencyKey),
  ])

  store.confirmationSnapshots = snapshots
  store.lastRequest = lastRequest
  store.rejectedConfirmationIds = rejectedIds
  store.attemptedIdempotencyKeys = attemptedKeys
  store.operationAttempts = operationAttempts

  const parsedPending = parseImmutableConfirmation(raw.pendingConfirmation)
  const snapshot = parsedPending ? snapshots[parsedPending.id] : null
  let pending = parsedPending && snapshot && confirmationsMatch(parsedPending, snapshot)
    ? snapshot
    : null
  let stage = typeof raw.stage === 'string' && agentStages.has(raw.stage as AgentStage)
    ? raw.stage as AgentStage
    : null
  let isStreamCompleted = typeof raw.isStreamCompleted === 'boolean'
    ? raw.isStreamCompleted
    : raw.isCompleted === true
  let isCompleted = typeof raw.isCompleted === 'boolean' ? raw.isCompleted : false
  let error = normalizeError(raw.error)

  const invalidPending = Boolean(parsedPending && !pending)
  if (invalidPending && parsedPending) {
    staleIds = appendUnique(staleIds, parsedPending.id)
  }

  const ambiguousAttempt = operationAttempts.find((attempt) => attempt.status === 'ambiguous')
  const pendingForAttempt = pending
  const matchingAttempt = pendingForAttempt
    ? operationAttempts.find((attempt) =>
        attempt.confirmationId === pendingForAttempt.id ||
        attempt.idempotencyKey === pendingForAttempt.idempotencyKey,
      )
    : null

  if (ambiguousAttempt) {
    staleIds = appendUnique(staleIds, ambiguousAttempt.confirmationId)
    if (pending) staleIds = appendUnique(staleIds, pending.id)
    pending = null
    stage = 'FAILED'
    isCompleted = false
    error = ambiguousCartWriteError()
  } else if (pending && matchingAttempt) {
    if (
      matchingAttempt.status === 'completed' &&
      confirmationsMatch(matchingAttempt.snapshot, pending)
    ) {
      completedIds = appendUnique(completedIds, pending.id)
      pending = null
      stage = 'COMPLETE'
      isCompleted = true
      error = null
    } else {
      staleIds = appendUnique(staleIds, pending.id)
      pending = null
      stage = 'FAILED'
      isCompleted = false
      error = {
        code: 'API_ERROR',
        message: 'The persisted confirmation was already attempted and cannot be replayed safely.',
        recoverable: false,
      }
    }
  } else if (pending && completedIds.includes(pending.id)) {
    pending = null
    stage = 'COMPLETE'
    isCompleted = true
    error = null
  } else if (pending && rejectedIds.includes(pending.id)) {
    pending = null
    stage = 'COMPLETE'
    isCompleted = true
    error = null
  } else if (pending && staleIds.includes(pending.id)) {
    pending = null
    stage = 'FAILED'
    isCompleted = false
    error = {
      code: 'API_ERROR',
      message: 'The persisted confirmation is stale and cannot be executed safely.',
      recoverable: false,
    }
  } else if (invalidPending) {
    pending = null
    stage = 'FAILED'
    isCompleted = false
    error = {
      code: 'API_ERROR',
      message: 'The persisted confirmation no longer matches its immutable snapshot.',
      recoverable: false,
    }
  } else if (pending && (isStreamCompleted || isCompleted)) {
    isStreamCompleted = true
    isCompleted = false
    stage = 'WAIT_CONFIRMATION'
    error = null
  } else if (!pending && (isStreamCompleted || isCompleted)) {
    stage = 'COMPLETE'
    isCompleted = true
    error = null
  } else if (lastRequest && stage !== 'CANCELLED') {
    stage = 'FAILED'
    error ??= {
      code: 'NETWORK_ERROR',
      message: 'The agent stream was interrupted before completion.',
      recoverable: true,
    }
  } else if (stage === 'WAIT_CONFIRMATION' && !pending) {
    stage = null
  }

  const normalizedTrail = normalizeTrail(raw.trail)
  const trail = !pending && stage === 'COMPLETE'
    ? settleWaitConfirmationTrail(normalizedTrail, 'completed')
    : !pending && stage === 'FAILED' && error?.recoverable === false
      ? settleWaitConfirmationTrail(normalizedTrail, 'failed')
      : normalizedTrail

  store.protocolState = {
    lastEventId: typeof raw.lastEventId === 'number' &&
      Number.isSafeInteger(raw.lastEventId) && raw.lastEventId >= 0
      ? raw.lastEventId
      : 0,
    messages: normalizeMessages(raw.messages),
    trail,
    recommendationGroups: normalizeRecommendationGroups(raw.recommendationGroups),
    pendingConfirmation: pending,
    completedConfirmationIds: completedIds,
    cartItemCount: typeof raw.cartItemCount === 'number' &&
      Number.isSafeInteger(raw.cartItemCount) && raw.cartItemCount >= 0
      ? raw.cartItemCount
      : null,
    stage,
    isStreamCompleted,
    isCompleted,
    error,
  } satisfies AgentProtocolState

  store.staleConfirmationIds = staleIds
}

export const createAgentStore = (
  transportFactory: AgentTransportFactory,
  storeId = 'agent',
) => defineStore(
  storeId,
  () => {
    const protocolState = ref<AgentProtocolState>(freshProtocolState())
    const lastRequest = ref<AgentRequest | null>(null)
    const confirmationSnapshots = ref<Record<string, OperationConfirmation>>({})
    const staleConfirmationIds = ref<string[]>([])
    const rejectedConfirmationIds = ref<string[]>([])
    const attemptedIdempotencyKeys = ref<string[]>([])
    const operationAttempts = ref<AgentOperationAttempt[]>([])
    const streaming = ref(false)
    const pendingWriteCount = ref(0)

    let activeController: AbortController | null = null
    let conversationGeneration = 0
    const confirmationWrites = new Map<string, InFlightConfirmationWrite>()

    const syncAttemptedIdempotencyKeys = () => {
      attemptedIdempotencyKeys.value = normalizeIds([
        ...attemptedIdempotencyKeys.value,
        ...operationAttempts.value.map((attempt) => attempt.idempotencyKey),
      ])
    }

    const findOperationAttempt = (
      snapshot: OperationConfirmation,
    ): AgentOperationAttempt | undefined => operationAttempts.value.find((attempt) =>
      attempt.idempotencyKey === snapshot.idempotencyKey ||
      attempt.confirmationId === snapshot.id,
    )

    const recordOperationAttempt = (
      snapshot: OperationConfirmation,
      status: AgentOperationAttemptStatus,
    ) => {
      const attempt = immutableOperationAttempt(snapshot, status)
      const existingIndex = operationAttempts.value.findIndex((candidate) =>
        candidate.idempotencyKey === snapshot.idempotencyKey,
      )
      operationAttempts.value = existingIndex === -1
        ? [...operationAttempts.value, attempt]
        : operationAttempts.value.map((candidate, index) =>
            index === existingIndex ? attempt : candidate,
          )
      syncAttemptedIdempotencyKeys()
    }

    const updateOperationAttemptStatus = (
      idempotencyKey: string,
      status: AgentOperationAttemptStatus,
    ) => {
      const existing = operationAttempts.value.find(
        (attempt) => attempt.idempotencyKey === idempotencyKey,
      )
      if (!existing) return
      recordOperationAttempt(existing.snapshot, status)
    }

    const messages = computed(() => protocolState.value.messages)
    const trail = computed(() => protocolState.value.trail)
    const recommendationGroups = computed(() => protocolState.value.recommendationGroups)
    const pendingConfirmation = computed(() => protocolState.value.pendingConfirmation)
    const completedConfirmationIds = computed(() => protocolState.value.completedConfirmationIds)
    const lastEventId = computed(() => protocolState.value.lastEventId)
    const stage = computed(() => protocolState.value.stage)
    const error = computed(() => protocolState.value.error)
    const isStreaming = computed(() => streaming.value)
    const hasAmbiguousWrite = computed(() => operationAttempts.value.some(
      (attempt) => attempt.status === 'ambiguous',
    ))
    const hasUnresolvedWrite = computed(() => operationAttempts.value.some(
      (attempt) => attempt.status === 'ambiguous' || attempt.status === 'in_flight',
    ))
    const canSend = computed(() =>
      !streaming.value && pendingWriteCount.value === 0 && !hasUnresolvedWrite.value,
    )
    const canRetry = computed(() => Boolean(
      !streaming.value &&
      !hasUnresolvedWrite.value &&
      lastRequest.value &&
      !protocolState.value.isStreamCompleted &&
      !protocolState.value.isCompleted &&
      protocolState.value.error?.recoverable,
    ))

    const failOperation = (operationError: AppError, confirmationIds: string[]) => {
      for (const confirmationId of confirmationIds) {
        staleConfirmationIds.value = appendUnique(staleConfirmationIds.value, confirmationId)
      }
      const pending = protocolState.value.pendingConfirmation
      if (pending) {
        staleConfirmationIds.value = appendUnique(staleConfirmationIds.value, pending.id)
      }
      protocolState.value = {
        ...protocolState.value,
        trail: settleWaitConfirmationTrail(protocolState.value.trail, 'failed'),
        stage: 'FAILED',
        pendingConfirmation: null,
        isCompleted: false,
        error: operationError,
      }
      activeController?.abort()
    }

    const failAmbiguousWrite = (confirmationIds: string[] = []) => {
      failOperation(
        ambiguousCartWriteError(),
        [
          ...operationAttempts.value
            .filter((attempt) => attempt.status === 'ambiguous')
            .map((attempt) => attempt.confirmationId),
          ...confirmationIds,
        ],
      )
    }

    type RememberConfirmationResult =
      | { kind: 'accepted' }
      | { kind: 'completed'; attempt: AgentOperationAttempt }
      | { kind: 'unsafe'; attempt?: AgentOperationAttempt; error: AppError }

    const rememberConfirmation = (
      value: OperationConfirmation,
    ): RememberConfirmationResult => {
      const existing = confirmationSnapshots.value[value.id]
      if (existing) {
        if (!confirmationsMatch(existing, value)) {
          staleConfirmationIds.value = appendUnique(staleConfirmationIds.value, value.id)
          return {
            kind: 'unsafe',
            error: {
              code: 'API_ERROR',
              message: 'The confirmation changed and cannot be executed safely.',
              recoverable: false,
            },
          }
        }
      } else {
        confirmationSnapshots.value = {
          ...confirmationSnapshots.value,
          [value.id]: immutableConfirmation(value),
        }
      }

      const snapshot = confirmationSnapshots.value[value.id]
      if (!snapshot) return { kind: 'accepted' }
      let attempt = findOperationAttempt(snapshot)
      if (
        !attempt &&
        attemptedIdempotencyKeys.value.includes(snapshot.idempotencyKey)
      ) {
        recordOperationAttempt(snapshot, 'ambiguous')
        attempt = findOperationAttempt(snapshot)
      }
      if (!attempt) return { kind: 'accepted' }
      if (
        attempt.status === 'completed' &&
        confirmationsMatch(attempt.snapshot, snapshot)
      ) {
        return { kind: 'completed', attempt }
      }
      return {
        kind: 'unsafe',
        attempt,
        error: attempt.status === 'ambiguous' || attempt.status === 'in_flight'
          ? ambiguousCartWriteError()
          : {
              code: 'API_ERROR',
              message: 'This cart operation was already attempted and cannot be replayed safely.',
              recoverable: false,
            },
      }
    }

    const runStream = async (
      request: AgentRequest,
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
        for await (const event of transportFactory().stream(request, options)) {
          if (controller.signal.aborted) return protocolState.value.isCompleted

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
            const remembered = rememberConfirmation(event.confirmation)
            if (remembered.kind === 'completed') {
              protocolState.value = {
                ...protocolState.value,
                trail: settleWaitConfirmationTrail(protocolState.value.trail, 'completed'),
                stage: 'COMPLETE',
                pendingConfirmation: null,
                isCompleted: true,
                completedConfirmationIds: appendUnique(
                  protocolState.value.completedConfirmationIds,
                  remembered.attempt.confirmationId,
                ),
                error: null,
              }
              controller.abort()
              return true
            }
            if (remembered.kind === 'unsafe') {
              failOperation(remembered.error, [event.confirmation.id])
              return false
            }
          }

          if (reduction.effects.some((effect) => effect.type === 'stream.resume')) {
            protocolState.value = { ...protocolState.value, stage: 'FAILED' }
            return false
          }
          if (eventAccepted && event.type === 'stream.failed') return false
          if (eventAccepted && event.type === 'stream.completed') {
            return reduction.state.isCompleted
          }
        }

        if (controller.signal.aborted) return protocolState.value.isCompleted
        if (protocolState.value.isStreamCompleted || protocolState.value.isCompleted) {
          return protocolState.value.isCompleted
        }
        protocolState.value = {
          ...protocolState.value,
          stage: 'FAILED',
          error: {
            code: 'NETWORK_ERROR',
            message: 'Agent stream ended before stream.completed.',
            recoverable: true,
          },
        }
        return false
      } catch (cause) {
        if (controller.signal.aborted) return protocolState.value.isCompleted
        if (protocolState.value.isStreamCompleted || protocolState.value.isCompleted) {
          return protocolState.value.isCompleted
        }
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
      if (
        !message ||
        streaming.value ||
        pendingWriteCount.value > 0 ||
        hasAmbiguousWrite.value
      ) {
        return false
      }

      clearConversationState()
      const request = { message, operationScope: createOperationScope() }
      lastRequest.value = request
      return runStream(request)
    }

    const cancel = (): boolean => {
      if (
        !activeController ||
        protocolState.value.isStreamCompleted ||
        protocolState.value.isCompleted
      ) {
        return false
      }
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
      if (hasAmbiguousWrite.value) {
        failAmbiguousWrite([id])
        return Promise.resolve(false)
      }

      const current = protocolState.value.pendingConfirmation
      const snapshot = confirmationSnapshots.value[id]
      if (
        !current ||
        current.id !== id ||
        !snapshot ||
        staleConfirmationIds.value.includes(id) ||
        rejectedConfirmationIds.value.includes(id) ||
        protocolState.value.completedConfirmationIds.includes(id) ||
        !confirmationsMatch(current, snapshot)
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
      const existingAttempt = findOperationAttempt(snapshot)
      if (existingAttempt) {
        return Promise.resolve(false)
      }
      if (attemptedIdempotencyKeys.value.includes(snapshot.idempotencyKey)) {
        recordOperationAttempt(snapshot, 'ambiguous')
        failAmbiguousWrite([id])
        return Promise.resolve(false)
      }

      const cartStore = useCartStore()
      const existingCount = cartStore.cartList.reduce(
        (count, item) => item.skuId === snapshot.skuId ? count + item.count : count,
        0,
      )
      if (existingCount + snapshot.quantity > 99) return Promise.resolve(false)

      recordOperationAttempt(snapshot, 'in_flight')
      pendingWriteCount.value += 1
      const writeGeneration = conversationGeneration
      const write = (async () => {
        try {
          await cartStore.addcart(cartItemFrom(snapshot))
        } catch (cause) {
          updateOperationAttemptStatus(snapshot.idempotencyKey, 'ambiguous')
          confirmationSnapshots.value = {
            ...confirmationSnapshots.value,
            [id]: snapshot,
          }
          failAmbiguousWrite([id])
          throw cause
        }
        updateOperationAttemptStatus(snapshot.idempotencyKey, 'completed')
        if (
          conversationGeneration === writeGeneration &&
          protocolState.value.pendingConfirmation &&
          confirmationsMatch(protocolState.value.pendingConfirmation, snapshot) &&
          !staleConfirmationIds.value.includes(id)
        ) {
          protocolState.value = {
            ...protocolState.value,
            trail: settleWaitConfirmationTrail(protocolState.value.trail, 'completed'),
            stage: 'COMPLETE',
            pendingConfirmation: null,
            isCompleted: true,
            completedConfirmationIds: appendUnique(
              protocolState.value.completedConfirmationIds,
              id,
            ),
            cartItemCount: cartStore.allcount,
            error: null,
          }
          activeController?.abort()
        } else if (conversationGeneration === writeGeneration) {
          const current = protocolState.value.pendingConfirmation
          const completedIds = appendUnique(
            protocolState.value.completedConfirmationIds,
            id,
          )
          if (current && current.id !== id) {
            protocolState.value = {
              ...protocolState.value,
              completedConfirmationIds: completedIds,
              cartItemCount: cartStore.allcount,
            }
          } else {
            staleConfirmationIds.value = appendUnique(staleConfirmationIds.value, id)
            protocolState.value = {
              ...protocolState.value,
              trail: settleWaitConfirmationTrail(protocolState.value.trail, 'failed'),
              stage: 'FAILED',
              pendingConfirmation: null,
              isCompleted: false,
              completedConfirmationIds: completedIds,
              cartItemCount: cartStore.allcount,
              error: {
                code: 'API_ERROR',
                message: 'The confirmation changed while its cart update was in flight. Review the cart before continuing.',
                recoverable: false,
              },
            }
            activeController?.abort()
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
        trail: settleWaitConfirmationTrail(protocolState.value.trail, 'completed'),
        stage: 'COMPLETE',
        pendingConfirmation: null,
        isCompleted: true,
        error: null,
      }
      activeController?.abort()
      return true
    }

    const resetConversation = () => {
      activeController?.abort()
      activeController = null
      streaming.value = false
      if (
        pendingWriteCount.value === 0 &&
        !operationAttempts.value.some((attempt) => attempt.status === 'in_flight')
      ) {
        operationAttempts.value = operationAttempts.value.map((attempt) =>
          attempt.status === 'ambiguous'
            ? immutableOperationAttempt(attempt.snapshot, 'acknowledged')
            : attempt,
        )
        syncAttemptedIdempotencyKeys()
      }
      clearConversationState()
    }

    return {
      protocolState,
      lastRequest,
      confirmationSnapshots,
      staleConfirmationIds,
      rejectedConfirmationIds,
      attemptedIdempotencyKeys,
      operationAttempts,
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
        'operationAttempts',
      ],
      afterHydrate: ({ store }) => {
        restoreConfirmationState(store as unknown as PersistedAgentConfirmationState)
      },
    },
  },
)

export const useAgentStore = createAgentStore(() => createMockAgentTransport())
