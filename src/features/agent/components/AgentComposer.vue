<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  streaming: boolean
  canSend: boolean
  canRetry: boolean
}>()

const emit = defineEmits<{
  submit: [message: string]
  cancel: []
  retry: []
}>()

const draft = ref('')
const prompt = ref<HTMLTextAreaElement | null>(null)

const submit = () => {
  const message = draft.value.trim()
  if (!message || props.streaming || !props.canSend) return
  emit('submit', message)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return
  event.preventDefault()
  submit()
}

watch(
  () => props.streaming,
  async (streaming, wasStreaming) => {
    if (wasStreaming && !streaming) {
      await nextTick()
      prompt.value?.focus()
    }
  },
)
</script>

<template>
  <form class="agent-composer" @submit.prevent="submit">
    <div class="agent-composer__label-row">
      <label for="agent-prompt">Message Berry</label>
      <span>Ctrl / ⌘ + Enter to send</span>
    </div>

    <textarea
      id="agent-prompt"
      ref="prompt"
      v-model="draft"
      aria-label="Message Berry"
      rows="3"
      placeholder="Describe what you need, your budget, and any constraints."
      @keydown="handleKeydown"
    />

    <div class="agent-composer__actions">
      <p aria-live="polite">
        {{ streaming ? 'Berry is working. You can cancel this request.' : 'Actions are always shown before they change your cart.' }}
      </p>
      <div class="agent-composer__buttons">
        <button
          v-if="streaming"
          data-testid="agent-cancel"
          class="agent-composer__secondary"
          type="button"
          @click="emit('cancel')"
        >
          Cancel request
        </button>
        <button
          v-if="!streaming && canRetry"
          data-testid="agent-retry"
          class="agent-composer__secondary"
          type="button"
          @click="emit('retry')"
        >
          Retry request
        </button>
        <button
          data-testid="agent-send"
          class="agent-composer__primary"
          type="submit"
          :disabled="streaming || !canSend || !draft.trim()"
        >
          Send request
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped lang="scss">
.agent-composer {
  padding: var(--agent-space-4) var(--agent-space-5) var(--agent-space-5);
  border-top: 1px solid var(--agent-line);
  background: var(--agent-surface);
}

.agent-composer__label-row,
.agent-composer__actions,
.agent-composer__buttons {
  display: flex;
  align-items: center;
}

.agent-composer__label-row,
.agent-composer__actions {
  justify-content: space-between;
  gap: var(--agent-space-3);
}

.agent-composer__label-row {
  margin-bottom: var(--agent-space-2);
}

.agent-composer label {
  color: var(--agent-cocoa);
  font-size: 13px;
  font-weight: 720;
}

.agent-composer__label-row span,
.agent-composer__actions p {
  color: var(--agent-stone);
  font-size: 12px;
  line-height: 1.5;
}

.agent-composer textarea {
  display: block;
  width: 100%;
  min-height: 88px;
  max-height: 220px;
  resize: vertical;
  padding: var(--agent-space-3);
  border: 1px solid var(--agent-line-strong);
  border-radius: var(--agent-radius-md);
  background: #FFFFFF;
  color: var(--agent-cocoa);
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  transition: border-color var(--agent-motion), box-shadow var(--agent-motion);
}

.agent-composer textarea::placeholder {
  color: var(--agent-stone);
  opacity: 0.88;
}

.agent-composer textarea:focus {
  border-color: var(--agent-ripe-red);
  box-shadow: 0 0 0 3px rgba(233, 67, 94, 0.13);
}

.agent-composer :where(button, textarea):focus-visible {
  outline: 3px solid var(--agent-berry-red);
  outline-offset: 2px;
}

.agent-composer__actions {
  align-items: flex-end;
  margin-top: var(--agent-space-3);
}

.agent-composer__actions p {
  max-width: 46ch;
  margin: 0;
}

.agent-composer__buttons {
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--agent-space-2);
}

.agent-composer button {
  min-height: 44px;
  padding: var(--agent-space-2) var(--agent-space-4);
  border: 1px solid transparent;
  border-radius: var(--agent-radius-sm);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 720;
  transition: background-color var(--agent-motion), border-color var(--agent-motion);
}

.agent-composer__primary {
  border-color: var(--agent-ripe-red);
  background: var(--agent-ripe-red);
  color: #FFFFFF;
}

.agent-composer__primary:hover:not(:disabled) {
  border-color: var(--agent-cocoa);
  background: var(--agent-cocoa);
}

.agent-composer__primary:disabled {
  border-color: var(--agent-line);
  background: var(--agent-blush);
  color: var(--agent-stone);
  cursor: not-allowed;
}

.agent-composer__secondary {
  border-color: var(--agent-line-strong);
  background: var(--agent-surface);
  color: var(--agent-cocoa);
}

.agent-composer__secondary:hover {
  border-color: var(--agent-ripe-red);
  background: var(--agent-blush);
}

@media (max-width: 520px) {
  .agent-composer {
    padding: var(--agent-space-3);
  }

  .agent-composer__label-row span,
  .agent-composer__actions p {
    display: none;
  }

  .agent-composer__actions,
  .agent-composer__buttons {
    width: 100%;
  }

  .agent-composer__buttons button {
    flex: 1 1 132px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-composer button,
  .agent-composer textarea {
    transition-duration: 0.01ms;
  }
}
</style>
