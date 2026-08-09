<script setup lang="ts">
defineProps<{
  hasActivity: boolean
  stageLabel: string
}>()

const emit = defineEmits<{
  newConversation: []
}>()
</script>

<template>
  <nav class="agent-sidebar" aria-label="Agent conversations">
    <div class="agent-sidebar__head">
      <p>Conversations</p>
      <button type="button" @click="emit('newConversation')">New request</button>
    </div>

    <ol class="agent-sidebar__list">
      <li>
        <div class="agent-sidebar__item" :class="{ 'agent-sidebar__item--active': hasActivity }">
          <span class="agent-sidebar__item-title">
            {{ hasActivity ? 'Current request' : 'No active request' }}
          </span>
          <span class="agent-sidebar__item-meta">{{ stageLabel }}</span>
        </div>
      </li>
    </ol>

    <p class="agent-sidebar__note">
      Requests stay separate so actions remain easy to review.
    </p>
  </nav>
</template>

<style scoped lang="scss">
.agent-sidebar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: var(--agent-space-4) var(--agent-space-3);
  border-right: 1px solid var(--agent-line);
  background: var(--agent-cream);
}

.agent-sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--agent-space-2);
  margin-bottom: var(--agent-space-3);
}

.agent-sidebar__head p {
  margin: 0;
  color: var(--agent-stone);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-sidebar button {
  min-height: 44px;
  padding: var(--agent-space-2) var(--agent-space-3);
  border: 1px solid var(--agent-line-strong);
  border-radius: var(--agent-radius-sm);
  background: var(--agent-surface);
  color: var(--agent-cocoa);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  transition: border-color var(--agent-motion), background-color var(--agent-motion);
}

.agent-sidebar button:hover {
  border-color: var(--agent-ripe-red);
  background: var(--agent-blush);
}

.agent-sidebar button:focus-visible {
  outline: 3px solid var(--agent-berry-red);
  outline-offset: 2px;
}

.agent-sidebar__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.agent-sidebar__item {
  display: flex;
  min-height: 56px;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: var(--agent-space-2) var(--agent-space-3);
  border-left: 3px solid transparent;
  color: var(--agent-stone);
}

.agent-sidebar__item--active {
  border-left-color: var(--agent-berry-red);
  background: var(--agent-blush);
  color: var(--agent-cocoa);
}

.agent-sidebar__item-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-sidebar__item-meta,
.agent-sidebar__note {
  color: var(--agent-stone);
  font-size: 12px;
  line-height: 1.5;
}

.agent-sidebar__note {
  margin: auto 0 0;
  padding: var(--agent-space-4) var(--agent-space-3) 0;
  border-top: 1px solid var(--agent-line);
}

@media (max-width: 840px) {
  .agent-sidebar {
    padding: var(--agent-space-3);
    border-right: 0;
    border-bottom: 1px solid var(--agent-line);
  }

  .agent-sidebar__head {
    margin-bottom: var(--agent-space-2);
  }

  .agent-sidebar__item {
    min-height: 44px;
  }

  .agent-sidebar__note {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-sidebar button {
    transition-duration: 0.01ms;
  }
}
</style>
