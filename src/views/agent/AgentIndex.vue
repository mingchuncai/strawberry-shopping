<script setup lang="ts">
import { computed } from 'vue'

import AgentComposer from '@/features/agent/components/AgentComposer.vue'
import AgentSidebar from '@/features/agent/components/AgentSidebar.vue'
import { useAgentStore } from '@/features/agent/store'

const agentStore = useAgentStore()

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
  if (agentStore.isStreaming) return { label: 'Working', state: 'working' }
  if (agentStore.error) return { label: 'Needs attention', state: 'attention' }
  if (agentStore.stage === 'COMPLETE') return { label: 'Request complete', state: 'ready' }
  return { label: 'Ready for request', state: 'ready' }
})

const trailSummary = computed(() => {
  const latest = agentStore.trail.at(-1)
  return latest
    ? `${agentStore.trail.length} checkpoints available. Latest: ${latest.label}.`
    : 'Checkpoint summaries will appear here while Berry works.'
})

const evidenceSummary = computed(() => {
  const count = agentStore.recommendationGroups.length
  if (count > 0) return `${count} evidence ${count === 1 ? 'group is' : 'groups are'} ready to review.`
  if (agentStore.pendingConfirmation) return 'An action is waiting for your review.'
  return 'Product evidence will appear here when matches are ready.'
})

const submitMessage = (message: string) => {
  void agentStore.sendMessage(message)
}

const retryRequest = () => {
  void agentStore.retry()
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
        @new-conversation="agentStore.resetConversation()"
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
          aria-live="polite"
          aria-relevant="additions text"
        >
          <article
            v-for="message in messageEntries"
            :key="message.id"
            class="agent-workspace__message"
          >
            <p class="agent-workspace__message-role">Berry</p>
            <p class="agent-workspace__message-copy">{{ message.content }}</p>
          </article>

          <div v-if="messageEntries.length === 0" class="agent-workspace__empty">
            <strong>Start with the shopping job.</strong>
            <p>
              Include what matters most: budget, use case, size, delivery timing, or trade-offs.
            </p>
          </div>
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
          <p>{{ trailSummary }}</p>
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
          <div class="agent-workspace__disclosure-content">{{ trailSummary }}</div>
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
</style>
