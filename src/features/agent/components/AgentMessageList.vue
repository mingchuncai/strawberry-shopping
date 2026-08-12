<script setup lang="ts">
import { ref, useId, watch } from 'vue'

import ProductComparison from './ProductComparison.vue'
import RecommendationCard from './RecommendationCard.vue'
import StreamingMessage from './StreamingMessage.vue'
import type { AgentMessage } from '../protocol'
import type { Recommendation, RecommendationGroup } from '../types'

export type PublicAgentMessage = AgentMessage | (
  Omit<AgentMessage, 'role'> & { role: 'user' | 'system-safe-summary' }
)

const props = defineProps<{
  messages: ReadonlyArray<PublicAgentMessage>
  recommendationGroups: ReadonlyArray<RecommendationGroup>
}>()

const emit = defineEmits<{
  select: [recommendation: Recommendation]
}>()

const roleLabels: Record<PublicAgentMessage['role'], string> = {
  user: 'You',
  assistant: 'Berry',
  'system-safe-summary': 'System summary',
}

const completionAnnouncement = ref('')
const headingPrefix = `agent-recommendation-${useId().replaceAll(':', '-')}`
const groupHeadingId = (index: number): string => `${headingPrefix}-${index + 1}`

watch(
  () => props.messages,
  (messages, previousMessages) => {
    const completedMessages = messages.filter((message) => {
      const previous = previousMessages.find((item) => item.id === message.id)
      return message.completed && previous?.completed === false
    })

    if (completedMessages.length > 0) {
      completionAnnouncement.value = completedMessages
        .map((message) => `${roleLabels[message.role]} finished: ${message.content}`)
        .join(' ')
    }
  },
)
</script>

<template>
  <div class="agent-message-list">
    <article
      v-for="message in messages"
      :key="message.id"
      class="agent-message-list__message"
      :class="`agent-message-list__message--${message.role}`"
      :data-message-id="message.id"
    >
      <p class="agent-message-list__role">{{ roleLabels[message.role] }}</p>
      <StreamingMessage :content="message.content" />
    </article>

    <p
      class="agent-message-list__announcement"
      data-testid="message-complete"
      aria-atomic="true"
      aria-live="polite"
    >{{ completionAnnouncement }}</p>

    <section
      v-for="(group, groupIndex) in recommendationGroups"
      :key="`${group.id}-${groupIndex}`"
      class="agent-message-list__recommendations"
      :aria-labelledby="groupHeadingId(groupIndex)"
    >
      <h2 :id="groupHeadingId(groupIndex)">{{ group.title }}</h2>

      <div class="agent-message-list__cards">
        <RecommendationCard
          v-for="recommendation in group.recommendations"
          :key="recommendation.skuId"
          :recommendation="recommendation"
          @select="emit('select', $event)"
        />
      </div>

      <div class="agent-message-list__comparison">
        <h3>Compare these products</h3>
        <ProductComparison :group="group" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.agent-message-list {
  display: grid;
  gap: var(--agent-space-4);
}

.agent-message-list__message {
  width: min(100%, 760px);
  margin: 0 auto;
  padding: var(--agent-space-4) 0 var(--agent-space-5);
  border-bottom: 1px solid var(--agent-line);
}

.agent-message-list__message--system-safe-summary {
  padding-inline: var(--agent-space-4);
  border-left: 3px solid var(--agent-leaf-green);
  background: var(--agent-cream);
}

.agent-message-list__role {
  margin: 0 0 var(--agent-space-2);
  color: var(--agent-ripe-red);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.08em;
  line-height: 1.4;
  text-transform: uppercase;
}

.agent-message-list__message--user .agent-message-list__role,
.agent-message-list__message--system-safe-summary .agent-message-list__role {
  color: var(--agent-stone);
}

.agent-message-list__announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.agent-message-list__recommendations {
  display: grid;
  gap: var(--agent-space-4);
  min-width: 0;
  padding-top: var(--agent-space-3);
}

.agent-message-list__recommendations > h2,
.agent-message-list__comparison > h3 {
  margin: 0;
  color: var(--agent-cocoa);
}

.agent-message-list__recommendations > h2 {
  font-size: 19px;
  line-height: 1.35;
}

.agent-message-list__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: var(--agent-space-4);
}

.agent-message-list__comparison {
  display: grid;
  gap: var(--agent-space-3);
  min-width: 0;
}

.agent-message-list__comparison > h3 {
  font-size: 16px;
}
</style>
