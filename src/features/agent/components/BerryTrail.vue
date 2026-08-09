<script setup lang="ts">
import type { AgentStage } from '../types'

type TrailStatus = 'pending' | 'running' | 'completed' | 'failed'

interface BerryTrailItem {
  stage: AgentStage
  label: string
  status: TrailStatus
}

defineProps<{
  trail: ReadonlyArray<BerryTrailItem>
}>()

const statusLabels: Record<TrailStatus, string> = {
  pending: 'Pending',
  running: 'In progress',
  completed: 'Completed',
  failed: 'Needs attention',
}
</script>

<template>
  <ol class="berry-trail" aria-label="Agent progress">
    <li
      v-for="item in trail"
      :key="item.stage"
      class="berry-trail__item"
      :class="`berry-trail__item--${item.status}`"
      :aria-current="item.status === 'running' ? 'step' : undefined"
    >
      <span class="berry-trail__seed" aria-hidden="true" />
      <span class="berry-trail__copy">
        <span class="berry-trail__label">{{ item.label }}</span>
        <span class="berry-trail__status">{{ statusLabels[item.status] }}</span>
      </span>
    </li>
  </ol>
</template>

<style scoped lang="scss">
.berry-trail {
  display: grid;
  gap: var(--agent-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.berry-trail__item {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: var(--agent-space-3);
  color: var(--agent-cocoa);
}

.berry-trail__seed {
  width: 16px;
  height: 20px;
  border: 1px solid var(--agent-line-strong);
  border-radius: 56% 44% 58% 42% / 42% 55% 45% 58%;
  background: var(--agent-surface);
  transform: rotate(18deg) scale(0.9);
  opacity: 0.72;
  transition: transform var(--agent-motion), opacity var(--agent-motion);
}

.berry-trail__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.berry-trail__label {
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.berry-trail__status {
  color: var(--agent-stone);
  font-size: 12px;
  line-height: 1.4;
}

.berry-trail__item--running .berry-trail__seed {
  border-color: var(--agent-ripe-red);
  background: var(--agent-berry-red);
  transform: rotate(18deg) scale(1);
  opacity: 1;
}

.berry-trail__item--completed .berry-trail__seed {
  border-color: var(--agent-leaf-green);
  background: var(--agent-leaf-green);
  transform: rotate(18deg) scale(1);
  opacity: 1;
}

.berry-trail__item--failed .berry-trail__seed {
  border-color: var(--agent-error);
  background: var(--agent-error);
  transform: rotate(18deg) scale(1);
  opacity: 1;
}

.berry-trail__item--failed .berry-trail__status {
  color: var(--agent-error);
}

@media (prefers-reduced-motion: reduce) {
  .berry-trail__seed {
    transition-duration: 0.01ms;
  }
}
</style>
