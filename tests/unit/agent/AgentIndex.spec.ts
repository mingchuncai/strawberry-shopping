import { nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { routes } from '@/router'

interface AgentStoreStub {
  messages: Record<string, {
    id: string
    role: 'assistant'
    content: string
    completed: boolean
  }>
  trail: Array<{
    stage: 'UNDERSTAND'
    label: string
    status: 'completed'
  }>
  recommendationGroups: never[]
  pendingConfirmation: null
  stage: null | 'FAILED'
  error: null | {
    code: 'NETWORK_ERROR'
    message: string
    recoverable: boolean
  }
  canSend: boolean
  canRetry: boolean
  isStreaming: boolean
  sendMessage: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  retry: ReturnType<typeof vi.fn>
}

let agentStore: AgentStoreStub

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ userInfo: null }),
}))

vi.mock('@/features/agent/store', () => ({
  useAgentStore: () => agentStore,
}))

const createAgentStoreStub = (): AgentStoreStub => reactive({
  messages: {
    'message-1': {
      id: 'message-1',
      role: 'assistant',
      content: 'I am comparing the strongest matches against your request.',
      completed: true,
    },
  },
  trail: [{
    stage: 'UNDERSTAND',
    label: 'Request understood',
    status: 'completed',
  }],
  recommendationGroups: [],
  pendingConfirmation: null,
  stage: null,
  error: null,
  canSend: true,
  canRetry: false,
  isStreaming: false,
  sendMessage: vi.fn().mockResolvedValue(true),
  cancel: vi.fn().mockReturnValue(true),
  retry: vi.fn().mockResolvedValue(true),
}) as AgentStoreStub

const renderWorkspace = async () => {
  agentStore = createAgentStoreStub()
  const agentRoute = routes.find((route) => route.name === 'agent')
  if (typeof agentRoute?.component !== 'function') {
    throw new Error('The agent route does not lazy load the workspace component')
  }
  const loadRouteComponent = agentRoute.component as () => Promise<{ default: object }>
  const AgentIndex = (await loadRouteComponent()).default
  return mount(AgentIndex, { attachTo: document.body })
}

describe('AgentIndex workspace shell', () => {
  it('lazy loads the named agent route instead of redirecting home', async () => {
    const agentRoute = routes.find((route) => route.name === 'agent')

    expect(agentRoute).toBeDefined()
    expect(agentRoute?.redirect).toBeUndefined()
    expect(typeof agentRoute?.component).toBe('function')

    if (typeof agentRoute?.component !== 'function') return
    const loadRouteComponent = agentRoute.component as () => Promise<{ default: unknown }>
    await expect(loadRouteComponent()).resolves.toHaveProperty('default')
  })

  it('provides one main landmark and labelled conversation regions', async () => {
    const wrapper = await renderWorkspace()

    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.get('nav[aria-label="Agent conversations"]')).toBeDefined()
    expect(wrapper.get('[role="log"][aria-label="Agent conversation messages"]'))
      .toBeDefined()
    expect(wrapper.get('label[for="agent-prompt"]').text()).toContain('Message Berry')
    expect(wrapper.get('textarea#agent-prompt').attributes('aria-label')).toBe('Message Berry')
  })

  it('uses native labelled disclosures for trail and evidence on mobile', async () => {
    const wrapper = await renderWorkspace()
    const disclosures = wrapper.findAll('details')

    expect(disclosures).toHaveLength(2)
    expect(disclosures.map((panel) => panel.get('summary').text())).toEqual([
      expect.stringContaining('Berry Trail'),
      expect.stringContaining('Evidence'),
    ])
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Command', { metaKey: true }],
  ])('submits the prompt with %s+Enter', async (_label, modifier) => {
    const wrapper = await renderWorkspace()
    const prompt = wrapper.get('textarea#agent-prompt')

    await prompt.setValue('Find a quiet coffee grinder under ¥500')
    await prompt.trigger('keydown', { key: 'Enter', ...modifier })

    expect(agentStore.sendMessage).toHaveBeenCalledWith(
      'Find a quiet coffee grinder under ¥500',
    )
  })

  it('disables send while streaming and exposes cancel and retry actions as text', async () => {
    const wrapper = await renderWorkspace()
    agentStore.isStreaming = true
    agentStore.canSend = false
    await nextTick()

    expect(wrapper.get('[data-testid="agent-send"]').attributes()).toHaveProperty('disabled')
    const cancel = wrapper.get('[data-testid="agent-cancel"]')
    expect(cancel.text()).toContain('Cancel request')
    await cancel.trigger('click')
    expect(agentStore.cancel).toHaveBeenCalledOnce()

    agentStore.isStreaming = false
    agentStore.canRetry = true
    agentStore.error = {
      code: 'NETWORK_ERROR',
      message: 'The connection was interrupted.',
      recoverable: true,
    }
    await nextTick()

    const retry = wrapper.get('[data-testid="agent-retry"]')
    expect(retry.text()).toContain('Retry request')
    await retry.trigger('click')
    expect(agentStore.retry).toHaveBeenCalledOnce()
  })

  it('returns focus to the composer when streaming completes', async () => {
    const wrapper = await renderWorkspace()
    const prompt = wrapper.get('textarea#agent-prompt')

    agentStore.isStreaming = true
    await nextTick()
    const cancel = wrapper.get('[data-testid="agent-cancel"]')
    ;(cancel.element as HTMLButtonElement).focus()
    expect(document.activeElement).toBe(cancel.element)

    agentStore.isStreaming = false
    await nextTick()
    await nextTick()

    expect(document.activeElement).toBe(prompt.element)
  })
})
