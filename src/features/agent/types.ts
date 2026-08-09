export type AgentStage =
  | 'UNDERSTAND'
  | 'CLARIFY'
  | 'PLAN'
  | 'EXECUTE_READ'
  | 'SYNTHESIZE'
  | 'WAIT_CONFIRMATION'
  | 'EXECUTE_WRITE'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED'

export interface AgentRequest {
  message: string
}

export interface Recommendation {
  productId: string
  skuId: string
  name: string
  price: number
  inventory: number
  attrsText: string
  evidence: string[]
  constraints: string[]
  uncertainty: string
}

export interface RecommendationGroup {
  id: string
  title: string
  recommendations: Recommendation[]
}

export interface OperationConfirmation {
  id: string
  operation: 'add_to_cart'
  productId: string
  skuId: string
  productName: string
  attrsText: string
  quantity: number
  unitPrice: number
  totalPrice: number
  payloadHash: string
  idempotencyKey: string
}

export type AgentEvent =
  | { id: number; type: 'message.started'; messageId: string; role: 'assistant' }
  | { id: number; type: 'message.delta'; messageId: string; delta: string }
  | { id: number; type: 'message.completed'; messageId: string }
  | {
      id: number
      type: 'trail.updated'
      stage: AgentStage
      label: string
      status: 'pending' | 'running' | 'completed' | 'failed'
    }
  | { id: number; type: 'recommendations.ready'; groups: RecommendationGroup[] }
  | { id: number; type: 'confirmation.requested'; confirmation: OperationConfirmation }
  | { id: number; type: 'operation.completed'; confirmationId: string; cartItemCount: number }
  | { id: number; type: 'stream.failed'; code: string; recoverable: boolean; message: string }
  | { id: number; type: 'stream.completed' }

export interface AgentTransport {
  stream(
    request: AgentRequest,
    options: { afterEventId?: number; signal: AbortSignal },
  ): AsyncIterable<AgentEvent>
}
