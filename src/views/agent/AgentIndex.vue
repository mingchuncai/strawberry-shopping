<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

import AgentComposer from '@/features/agent/components/AgentComposer.vue'
import AgentMessageList from '@/features/agent/components/AgentMessageList.vue'
import AgentSidebar from '@/features/agent/components/AgentSidebar.vue'
import BerryTrail from '@/features/agent/components/BerryTrail.vue'
import OperationConfirmationCard from '@/features/agent/components/OperationConfirmationCard.vue'
import OperationResultCard from '@/features/agent/components/OperationResultCard.vue'
import { useAgentStore } from '@/features/agent/store'
import type { OperationConfirmation, Recommendation } from '@/features/agent/types'

const agentStore = useAgentStore()
type ConfirmationState = 'ready' | 'pending' | 'stale' | 'invalid' | 'unavailable'
type ResultState = 'success' | 'failed' | 'unknown' | 'rejected'

const selectedConfirmation = ref<OperationConfirmation | null>(null)
const selectedProposal = ref<Recommendation | null>(null)
const confirmationPending = ref(false)
const operationResult = ref<{ status: ResultState; cartItemCount?: number } | null>(null)
const selectionNotice = ref('')
const resultCard = ref<{ focus: () => void } | null>(null)
let operationGeneration = 0

const messageEntries = computed(() => Object.values(agentStore.messages))
const hasActivity = computed(() => Boolean(
  messageEntries.value.length ||
  agentStore.trail.length ||
  agentStore.isStreaming ||
  agentStore.stage,
))

const stageLabel = computed(() => {
  if (!agentStore.stage) return 'Ready'
  return agentStore.stage.toLowerCase().replaceAll('_', ' ')
})

const status = computed(() => {
  if (confirmationPending.value) return { label: 'Updating cart', state: 'working' }
  if (agentStore.isStreaming) return { label: 'Working', state: 'working' }
  if (agentStore.error) return { label: 'Needs attention', state: 'attention' }
  if (agentStore.pendingConfirmation) {
    return { label: 'Waiting for confirmation', state: 'attention' }
  }
  if (agentStore.stage === 'COMPLETE') return { label: 'Request complete', state: 'ready' }
  return { label: 'Ready for request', state: 'ready' }
})

const evidenceSummary = computed(() => {
  const count = agentStore.recommendationGroups.length
  if (count > 0) return `${count} evidence ${count === 1 ? 'group is' : 'groups are'} ready to review.`
  if (agentStore.pendingConfirmation) return 'An action is waiting for your review.'
  return 'Product evidence will appear here when matches are ready.'
})

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

const confirmationState = computed<ConfirmationState>(() => {
  if (confirmationPending.value) return 'pending'
  const selected = selectedConfirmation.value
  if (!selected) return 'unavailable'
  if (agentStore.staleConfirmationIds.includes(selected.id)) return 'stale'
  const current = agentStore.pendingConfirmation
  if (!current) return 'stale'
  return confirmationFields.every((field) => current[field] === selected[field])
    ? 'ready'
    : 'invalid'
})

const focusResult = async (generation: number) => {
  await nextTick()
  if (generation !== operationGeneration) return
  resultCard.value?.focus()
}

const selectRecommendation = (recommendation: Recommendation) => {
  if (confirmationPending.value) return

  operationGeneration += 1
  const pending = agentStore.pendingConfirmation
  operationResult.value = null
  selectedProposal.value = recommendation
  selectedConfirmation.value = null
  if (
    !pending ||
    pending.productId !== recommendation.productId ||
    pending.skuId !== recommendation.skuId
  ) {
    selectionNotice.value = '此商品提案没有匹配的待确认操作，购物车不会改变。'
    return
  }

  selectionNotice.value = ''
  selectedConfirmation.value = pending
}

const isUnknownOutcome = () => {
  const message = agentStore.error?.message.toLowerCase() ?? ''
  return message.includes('unknown') || message.includes('outcome')
}

const confirmSelected = async (confirmationId: string) => {
  const selected = selectedConfirmation.value
  if (
    !selected ||
    selected.id !== confirmationId ||
    confirmationState.value !== 'ready'
  ) {
    return
  }

  const generation = operationGeneration
  confirmationPending.value = true
  try {
    const completed = await agentStore.confirmOperation(confirmationId)
    if (generation !== operationGeneration) return

    let completedSafely = completed &&
      agentStore.completedConfirmationIds.includes(confirmationId) &&
      agentStore.stage === 'COMPLETE' &&
      !agentStore.error
    let cartItemCount = 0
    if (completedSafely) {
      const { useCartStore } = await import('@/stores/cart')
      if (generation !== operationGeneration) return
      completedSafely = agentStore.completedConfirmationIds.includes(confirmationId) &&
        agentStore.stage === 'COMPLETE' &&
        !agentStore.error
      cartItemCount = useCartStore().allcount
    }
    operationResult.value = completedSafely
      ? {
          status: 'success',
          cartItemCount,
        }
      : {
          status: completed || isUnknownOutcome() ? 'unknown' : 'failed',
        }
  } catch {
    if (generation !== operationGeneration) return
    operationResult.value = { status: 'unknown' }
  }
  if (generation !== operationGeneration) return

  confirmationPending.value = false
  selectedConfirmation.value = null
  selectedProposal.value = null
  await focusResult(generation)
}

const rejectSelected = async (confirmationId: string) => {
  const selected = selectedConfirmation.value
  if (
    !selected ||
    selected.id !== confirmationId ||
    confirmationState.value !== 'ready'
  ) {
    return
  }

  operationResult.value = agentStore.rejectOperation(confirmationId)
    ? { status: 'rejected' }
    : { status: 'failed' }
  selectedConfirmation.value = null
  selectedProposal.value = null
  await focusResult(operationGeneration)
}

const clearLocalOperation = () => {
  operationGeneration += 1
  selectedConfirmation.value = null
  selectedProposal.value = null
  confirmationPending.value = false
  operationResult.value = null
  selectionNotice.value = ''
}

const submitMessage = (message: string) => {
  clearLocalOperation()
  void agentStore.sendMessage(message)
}

const retryRequest = () => {
  void agentStore.retry()
}

const resetConversation = () => {
  clearLocalOperation()
  agentStore.resetConversation()
}
</script>

<template>
  <main class="agent-workspace" aria-labelledby="agent-workspace-title">
    <header class="agent-workspace__topbar">
      <div class="agent-workspace__identity">
        <span class="agent-workspace__mark" aria-hidden="true" />
        <div>
          <p class="agent-workspace__eyebrow">Berry shopping copilot</p>
          <h1 id="agent-workspace-title">Evidence-backed shopping workspace</h1>
        </div>
      </div>
      <div
        class="agent-workspace__status"
        :data-state="status.state"
        role="status"
        aria-live="polite"
      >
        {{ status.label }}
      </div>
    </header>

    <div class="agent-workspace__grid">
      <AgentSidebar
        :has-activity="hasActivity"
        :stage-label="stageLabel"
        @new-conversation="resetConversation"
      />

      <section class="agent-workspace__conversation" aria-labelledby="agent-conversation-title">
        <header class="agent-workspace__conversation-head">
          <div>
            <p class="agent-workspace__panel-label">Conversation</p>
            <h2 id="agent-conversation-title">Current request</h2>
            <p>Ask, compare the evidence, then confirm any shopping action.</p>
          </div>
          <span class="agent-workspace__stage">{{ stageLabel }}</span>
        </header>

        <div
          class="agent-workspace__log"
          role="log"
          aria-label="Agent conversation messages"
          aria-live="off"
        >
          <AgentMessageList
            :messages="messageEntries"
            :recommendation-groups="agentStore.recommendationGroups"
            @select="selectRecommendation"
          />

          <div
            v-if="messageEntries.length === 0 && agentStore.recommendationGroups.length === 0"
            class="agent-workspace__empty"
          >
            <strong>Start with the shopping job.</strong>
            <p>
              Include what matters most: budget, use case, size, delivery timing, or trade-offs.
            </p>
          </div>

          <p v-if="selectionNotice" class="agent-workspace__selection-note">
            {{ selectionNotice }}
          </p>

          <OperationConfirmationCard
            v-if="selectedProposal && !operationResult"
            :confirmation="selectedConfirmation"
            :state="confirmationState"
            @confirm="confirmSelected"
            @reject="rejectSelected"
          />

          <OperationResultCard
            v-if="operationResult"
            ref="resultCard"
            :status="operationResult.status"
            :cart-item-count="operationResult.cartItemCount"
          />
        </div>

        <p v-if="agentStore.error" class="agent-workspace__error" role="alert">
          {{ agentStore.error.message }}
        </p>

        <AgentComposer
          :streaming="agentStore.isStreaming"
          :can-send="agentStore.canSend"
          :can-retry="agentStore.canRetry"
          @submit="submitMessage"
          @cancel="agentStore.cancel()"
          @retry="retryRequest"
        />
      </section>

      <aside
        class="agent-workspace__inspector agent-workspace__inspector--desktop"
        aria-label="Trail and evidence"
      >
        <section class="agent-workspace__panel" aria-labelledby="agent-trail-title">
          <p class="agent-workspace__panel-label">Process</p>
          <h2 id="agent-trail-title">Berry Trail</h2>
          <strong class="agent-workspace__metric">{{ agentStore.trail.length }}</strong>
          <BerryTrail :trail="agentStore.trail" />
        </section>
        <section class="agent-workspace__panel" aria-labelledby="agent-evidence-title">
          <p class="agent-workspace__panel-label">Sources</p>
          <h2 id="agent-evidence-title">Evidence</h2>
          <strong class="agent-workspace__metric">
            {{ agentStore.recommendationGroups.length }}
          </strong>
          <p>{{ evidenceSummary }}</p>
        </section>
      </aside>

      <aside
        class="agent-workspace__inspector agent-workspace__inspector--mobile"
        aria-label="Trail and evidence disclosures"
      >
        <details class="agent-workspace__disclosure">
          <summary>
            Berry Trail
            <span>{{ agentStore.trail.length }} checkpoints</span>
          </summary>
          <div class="agent-workspace__disclosure-content">
            <BerryTrail :trail="agentStore.trail" />
          </div>
        </details>
        <details class="agent-workspace__disclosure">
          <summary>
            Evidence
            <span>{{ agentStore.recommendationGroups.length }} groups</span>
          </summary>
          <div class="agent-workspace__disclosure-content">{{ evidenceSummary }}</div>
        </details>
      </aside>
    </div>
  </main>
</template>

<style scoped lang="scss">
@use '@/features/agent/styles/workspace';

.agent-workspace__selection-note {
  width: min(100%, 760px);
  margin: var(--agent-space-4) auto 0;
  padding: var(--agent-space-3) var(--agent-space-4);
  border-left: 3px solid var(--agent-stone);
  background: var(--agent-cream);
  color: var(--agent-stone);
  font-size: 14px;
  line-height: 1.55;
}
</style>
