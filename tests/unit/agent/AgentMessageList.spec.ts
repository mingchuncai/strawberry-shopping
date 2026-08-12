import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AgentMessageList from '@/features/agent/components/AgentMessageList.vue'
import messageListSource from '@/features/agent/components/AgentMessageList.vue?raw'
import streamingMessageSource from '@/features/agent/components/StreamingMessage.vue?raw'

const messages = [
  {
    id: 'user-1',
    role: 'user' as const,
    content: 'I need a quiet grinder.',
    completed: true,
  },
  {
    id: 'assistant-1',
    role: 'assistant' as const,
    content: 'Comparing quiet',
    completed: false,
  },
  {
    id: 'summary-1',
    role: 'system-safe-summary' as const,
    content: 'Budget and noise requirements recorded.',
    completed: true,
  },
]

describe('AgentMessageList', () => {
  it('appends streamed deltas into one stable text node without character wrappers', async () => {
    const wrapper = mount(AgentMessageList, {
      props: { messages, recommendationGroups: [] },
    })
    const copy = wrapper.get('[data-message-id="assistant-1"] [data-testid="streaming-copy"]')
    const textNode = copy.element.firstChild

    expect(copy.text()).toBe('Comparing quiet')
    expect(copy.element.childNodes).toHaveLength(1)
    expect(copy.findAll('span')).toHaveLength(0)

    await wrapper.setProps({
      messages: messages.map((message) => message.id === 'assistant-1'
        ? { ...message, content: 'Comparing quiet options now' }
        : message),
    })
    await nextTick()

    const updatedCopy = wrapper.get(
      '[data-message-id="assistant-1"] [data-testid="streaming-copy"]',
    )
    expect(updatedCopy.text()).toBe('Comparing quiet options now')
    expect(updatedCopy.element.firstChild).toBe(textNode)
    expect(updatedCopy.element.childNodes).toHaveLength(1)
  })

  it('keeps the changing delta silent and announces only completed-message summaries politely', () => {
    const wrapper = mount(AgentMessageList, {
      props: { messages, recommendationGroups: [] },
    })

    const streaming = wrapper.get('[data-message-id="assistant-1"]')
    expect(streaming.attributes('aria-live')).toBeUndefined()
    expect(streaming.find('[aria-live]').exists()).toBe(false)

    const announcements = wrapper.findAll('[data-testid="message-complete"][aria-live="polite"]')
    expect(announcements).toHaveLength(2)
    expect(announcements.map((item) => item.text())).toEqual([
      expect.stringContaining('You finished'),
      expect.stringContaining('System summary finished'),
    ])
  })

  it('renders public role labels without private reasoning or per-character animation', () => {
    const wrapper = mount(AgentMessageList, {
      props: { messages, recommendationGroups: [] },
    })

    expect(wrapper.text()).toContain('You')
    expect(wrapper.text()).toContain('Berry')
    expect(wrapper.text()).toContain('System summary')
    expect(wrapper.text()).not.toMatch(/chain.of.thought|private reasoning|internal reasoning/i)
    expect(messageListSource).not.toMatch(/split\(['"]{2}['"]\)|Array\.from/)
    expect(streamingMessageSource).not.toMatch(/animation\s*:|@keyframes/)
  })
})
