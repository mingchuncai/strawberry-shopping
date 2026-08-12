import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AgentMessageList from '@/features/agent/components/AgentMessageList.vue'
import messageListSource from '@/features/agent/components/AgentMessageList.vue?raw'
import streamingMessageSource from '@/features/agent/components/StreamingMessage.vue?raw'
import type { AgentMessage } from '@/features/agent/protocol'

const assistantMessage: AgentMessage = {
  id: 'assistant-1',
  role: 'assistant',
  content: 'Comparing quiet',
  completed: false,
}

const messages = [
  {
    id: 'user-1',
    role: 'user' as const,
    content: 'I need a quiet grinder.',
    completed: true,
  },
  assistantMessage,
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

  it('keeps the changing delta silent and pre-mounts one empty polite completion announcer', () => {
    const wrapper = mount(AgentMessageList, {
      props: { messages, recommendationGroups: [] },
    })

    const streaming = wrapper.get('[data-message-id="assistant-1"]')
    expect(streaming.attributes('aria-live')).toBeUndefined()
    expect(streaming.find('[aria-live]').exists()).toBe(false)

    const announcements = wrapper.findAll('[data-testid="message-complete"][aria-live="polite"]')
    expect(announcements).toHaveLength(1)
    expect(announcements[0]?.text()).toBe('')
  })

  it('updates the persistent announcer only when an incomplete message completes', async () => {
    const wrapper = mount(AgentMessageList, {
      props: { messages: [assistantMessage], recommendationGroups: [] },
    })
    const announcer = wrapper.get('[data-testid="message-complete"][aria-live="polite"]')

    expect(announcer.text()).toBe('')

    await wrapper.setProps({
      messages: [{
        ...assistantMessage,
        content: 'Comparing quiet options now.',
        completed: true,
      }],
    })
    await nextTick()

    const updatedAnnouncer = wrapper.get(
      '[data-testid="message-complete"][aria-live="polite"]',
    )
    expect(updatedAnnouncer.element).toBe(announcer.element)
    expect(updatedAnnouncer.text()).toBe('Berry finished: Comparing quiet options now.')
    expect(wrapper.get('[data-testid="streaming-copy"]').attributes('aria-live')).toBeUndefined()
  })

  it('creates DOM-safe unique heading IDs without trusting duplicate raw group IDs', () => {
    const wrapper = mount(AgentMessageList, {
      props: {
        messages: [],
        recommendationGroups: [
          { id: 'duplicate id', title: 'First group', recommendations: [] },
          { id: 'duplicate id', title: 'Second group', recommendations: [] },
        ],
      },
    })
    const sections = wrapper.findAll('section.agent-message-list__recommendations')
    const headings = sections.map((section) => section.get(':scope > h2'))

    const headingIds = headings.map((heading) => heading.attributes('id') ?? '')
    expect(headingIds.every((id) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(id))).toBe(true)
    expect(headingIds.every((id) => !id.includes('duplicate'))).toBe(true)
    expect(new Set(headingIds).size).toBe(2)
    expect(sections.map((section) => section.attributes('aria-labelledby'))).toEqual(
      headingIds,
    )
  })

  it('renders public role labels without private reasoning or per-character animation', () => {
    const wrapper = mount(AgentMessageList, {
      props: { messages, recommendationGroups: [] },
    })

    expect(wrapper.text()).toContain('You')
    expect(wrapper.text()).toContain('Berry')
    expect(wrapper.text()).toContain('System summary')
    expect(wrapper.text()).not.toMatch(/chain.of.thought|private reasoning|internal reasoning/i)
    expect(messageListSource).toMatch(
      /import type \{ AgentMessage \} from ['"]\.\.\/protocol['"]/,
    )
    expect(messageListSource).toContain("Omit<AgentMessage, 'role'>")
    expect(messageListSource).not.toMatch(/split\(['"]{2}['"]\)|Array\.from/)
    expect(streamingMessageSource).not.toMatch(/animation\s*:|@keyframes/)
  })
})
