import type { AppError, AppErrorCode } from '@/types/api'

import type {
  AgentEvent,
  AgentStage,
  OperationConfirmation,
  Recommendation,
  RecommendationGroup,
} from './types'

export interface AgentMessage {
  id: string
  role: 'assistant'
  content: string
  completed: boolean
}

export interface AgentTrailItem {
  stage: AgentStage
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export interface AgentProtocolState {
  lastEventId: number
  messages: Record<string, AgentMessage>
  trail: AgentTrailItem[]
  recommendationGroups: RecommendationGroup[]
  pendingConfirmation: OperationConfirmation | null
  completedConfirmationIds: string[]
  cartItemCount: number | null
  stage: AgentStage | null
  isCompleted: boolean
  error: AppError | null
}

export type AgentProtocolEffect =
  | { type: 'stream.resume'; afterEventId: number }
  | { type: 'confirmation.invalidated'; confirmationId: string }

export interface AgentProtocolReduction {
  state: AgentProtocolState
  effects: AgentProtocolEffect[]
}

export const initialAgentProtocolState: AgentProtocolState = {
  lastEventId: 0,
  messages: {},
  trail: [],
  recommendationGroups: [],
  pendingConfirmation: null,
  completedConfirmationIds: [],
  cartItemCount: null,
  stage: null,
  isCompleted: false,
  error: null,
}

const stages = new Set<AgentStage>([
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

const appErrorCodes = new Set<AppErrorCode>([
  'NETWORK_ERROR',
  'UNAUTHORIZED',
  'TIMEOUT',
  'API_ERROR',
  'UNKNOWN',
])

const invalidEvent = (): AppError => ({
  code: 'API_ERROR',
  message: 'Invalid agent event payload',
  recoverable: false,
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isPositiveInteger = (value: unknown): value is number =>
  isNonNegativeInteger(value) && value > 0

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString)

const isStage = (value: unknown): value is AgentStage =>
  typeof value === 'string' && stages.has(value as AgentStage)

const isTrailStatus = (value: unknown): value is AgentTrailItem['status'] =>
  typeof value === 'string' && trailStatuses.has(value as AgentTrailItem['status'])

const toRecommendation = (value: unknown): Recommendation | null => {
  if (!isRecord(value)) return null

  const { productId, skuId, name, price, inventory, attrsText, evidence, constraints, uncertainty } = value
  if (
    !isNonEmptyString(productId) ||
    !isNonEmptyString(skuId) ||
    !isNonEmptyString(name) ||
    !isNonNegativeNumber(price) ||
    !isNonNegativeInteger(inventory) ||
    !isNonEmptyString(attrsText) ||
    !isStringArray(evidence) ||
    !isStringArray(constraints) ||
    !isNonEmptyString(uncertainty)
  ) {
    return null
  }

  return { productId, skuId, name, price, inventory, attrsText, evidence, constraints, uncertainty }
}

const toRecommendationGroups = (value: unknown): RecommendationGroup[] | null => {
  if (!Array.isArray(value)) return null

  const groups: RecommendationGroup[] = []
  for (const group of value) {
    if (!isRecord(group) || !isNonEmptyString(group.id) || !isNonEmptyString(group.title) || !Array.isArray(group.recommendations)) {
      return null
    }

    const recommendations: Recommendation[] = []
    for (const candidate of group.recommendations) {
      const parsed = toRecommendation(candidate)
      if (!parsed) return null
      recommendations.push(parsed)
    }
    groups.push({ id: group.id, title: group.title, recommendations })
  }
  return groups
}

const toConfirmation = (value: unknown): OperationConfirmation | null => {
  if (!isRecord(value)) return null

  const {
    id,
    operation,
    productId,
    skuId,
    productName,
    attrsText,
    quantity,
    unitPrice,
    totalPrice,
    payloadHash,
    idempotencyKey,
  } = value
  if (
    !isNonEmptyString(id) ||
    operation !== 'add_to_cart' ||
    !isNonEmptyString(productId) ||
    !isNonEmptyString(skuId) ||
    !isNonEmptyString(productName) ||
    !isNonEmptyString(attrsText) ||
    !isPositiveInteger(quantity) ||
    !isNonNegativeNumber(unitPrice) ||
    !isNonNegativeNumber(totalPrice) ||
    !isNonEmptyString(payloadHash) ||
    !isNonEmptyString(idempotencyKey)
  ) {
    return null
  }

  return {
    id,
    operation,
    productId,
    skuId,
    productName,
    attrsText,
    quantity,
    unitPrice,
    totalPrice,
    payloadHash,
    idempotencyKey,
  }
}

export const parseAgentEvent = (raw: unknown): AgentEvent | AppError => {
  if (!isRecord(raw) || !isPositiveInteger(raw.id) || !isNonEmptyString(raw.type)) return invalidEvent()

  const { id, type } = raw
  if (type === 'message.started' && isNonEmptyString(raw.messageId) && raw.role === 'assistant') {
    return { id, type, messageId: raw.messageId, role: raw.role }
  }
  if (type === 'message.delta' && isNonEmptyString(raw.messageId) && typeof raw.delta === 'string') {
    return { id, type, messageId: raw.messageId, delta: raw.delta }
  }
  if (type === 'message.completed' && isNonEmptyString(raw.messageId)) {
    return { id, type, messageId: raw.messageId }
  }
  if (
    type === 'trail.updated' &&
    isStage(raw.stage) &&
    isNonEmptyString(raw.label) &&
    isTrailStatus(raw.status)
  ) {
    return { id, type, stage: raw.stage, label: raw.label, status: raw.status }
  }
  if (type === 'recommendations.ready') {
    const groups = toRecommendationGroups(raw.groups)
    if (groups) return { id, type, groups }
  }
  if (type === 'confirmation.requested') {
    const confirmation = toConfirmation(raw.confirmation)
    if (confirmation) return { id, type, confirmation }
  }
  if (
    type === 'operation.completed' &&
    isNonEmptyString(raw.confirmationId) &&
    isNonNegativeInteger(raw.cartItemCount)
  ) {
    return { id, type, confirmationId: raw.confirmationId, cartItemCount: raw.cartItemCount }
  }
  if (
    type === 'stream.failed' &&
    isNonEmptyString(raw.code) &&
    typeof raw.recoverable === 'boolean' &&
    isNonEmptyString(raw.message)
  ) {
    return { id, type, code: raw.code, recoverable: raw.recoverable, message: raw.message }
  }
  if (type === 'stream.completed') return { id, type }

  return invalidEvent()
}

const gapError = (afterEventId: number): AppError => ({
  code: 'API_ERROR',
  message: `Agent event gap detected after event ${afterEventId}`,
  recoverable: true,
})

const toAppErrorCode = (code: string): AppErrorCode =>
  appErrorCodes.has(code as AppErrorCode) ? (code as AppErrorCode) : 'API_ERROR'

const cloneConfirmation = (confirmation: OperationConfirmation): OperationConfirmation =>
  Object.freeze({
    id: confirmation.id,
    operation: confirmation.operation,
    productId: confirmation.productId,
    skuId: confirmation.skuId,
    productName: confirmation.productName,
    attrsText: confirmation.attrsText,
    quantity: confirmation.quantity,
    unitPrice: confirmation.unitPrice,
    totalPrice: confirmation.totalPrice,
    payloadHash: confirmation.payloadHash,
    idempotencyKey: confirmation.idempotencyKey,
  })

const confirmationFields: (keyof OperationConfirmation)[] = [
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

const confirmationChanged = (
  previous: OperationConfirmation,
  next: OperationConfirmation,
): boolean => confirmationFields.some((field) => previous[field] !== next[field])

export const reduceAgentEvent = (
  state: AgentProtocolState,
  event: AgentEvent,
): AgentProtocolReduction => {
  if (event.id <= state.lastEventId) return { state, effects: [] }
  if (event.id !== state.lastEventId + 1) {
    return {
      state: { ...state, error: gapError(state.lastEventId) },
      effects: [{ type: 'stream.resume', afterEventId: state.lastEventId }],
    }
  }

  const nextState: AgentProtocolState = { ...state, lastEventId: event.id, error: null }

  switch (event.type) {
    case 'message.started':
      return {
        state: {
          ...nextState,
          messages: {
            ...state.messages,
            [event.messageId]: { id: event.messageId, role: event.role, content: '', completed: false },
          },
        },
        effects: [],
      }
    case 'message.delta': {
      const message = state.messages[event.messageId] ?? {
        id: event.messageId,
        role: 'assistant' as const,
        content: '',
        completed: false,
      }
      return {
        state: {
          ...nextState,
          messages: { ...state.messages, [event.messageId]: { ...message, content: message.content + event.delta } },
        },
        effects: [],
      }
    }
    case 'message.completed': {
      const message = state.messages[event.messageId] ?? {
        id: event.messageId,
        role: 'assistant' as const,
        content: '',
        completed: false,
      }
      return {
        state: {
          ...nextState,
          messages: { ...state.messages, [event.messageId]: { ...message, completed: true } },
        },
        effects: [],
      }
    }
    case 'trail.updated': {
      const item = { stage: event.stage, label: event.label, status: event.status }
      const trail = state.trail.some((entry) => entry.stage === event.stage)
        ? state.trail.map((entry) => (entry.stage === event.stage ? item : entry))
        : [...state.trail, item]
      return { state: { ...nextState, stage: event.stage, trail }, effects: [] }
    }
    case 'recommendations.ready':
      return { state: { ...nextState, recommendationGroups: event.groups }, effects: [] }
    case 'confirmation.requested': {
      const previous = state.pendingConfirmation
      const isReplacement = previous && confirmationChanged(previous, event.confirmation)
      return {
        state: {
          ...nextState,
          stage: 'WAIT_CONFIRMATION',
          pendingConfirmation: cloneConfirmation(event.confirmation),
        },
        effects: isReplacement ? [{ type: 'confirmation.invalidated', confirmationId: previous.id }] : [],
      }
    }
    case 'operation.completed':
      return {
        state: {
          ...nextState,
          cartItemCount: event.cartItemCount,
          pendingConfirmation:
            state.pendingConfirmation?.id === event.confirmationId ? null : state.pendingConfirmation,
          completedConfirmationIds: state.completedConfirmationIds.includes(event.confirmationId)
            ? state.completedConfirmationIds
            : [...state.completedConfirmationIds, event.confirmationId],
        },
        effects: [],
      }
    case 'stream.failed':
      return {
        state: {
          ...nextState,
          stage: 'FAILED',
          error: { code: toAppErrorCode(event.code), message: event.message, recoverable: event.recoverable },
        },
        effects: [],
      }
    case 'stream.completed':
      return { state: { ...nextState, stage: 'COMPLETE', isCompleted: true }, effects: [] }
  }
}
