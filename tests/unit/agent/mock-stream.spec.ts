import { describe, expect, it, vi } from 'vitest'

import { createMockAgentTransport } from '@/features/agent/api'
import { parseMockSseChunks, toMockSseFrame } from '@/features/agent/mock/stream'
import { parseAgentEvent } from '@/features/agent/protocol'

const request = {
  message: '预算500元，宿舍用，不要胶囊机，想要安静一些的咖啡器具。',
}

const collect = async <T>(stream: AsyncIterable<T>): Promise<T[]> => {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}

describe('mock agent SSE transport', () => {
  it('emits a deterministic quiet dormitory coffee-equipment scenario', async () => {
    const first = await collect(createMockAgentTransport().stream(request, { signal: new AbortController().signal }))
    const second = await collect(createMockAgentTransport().stream(request, { signal: new AbortController().signal }))

    expect(first).toEqual(second)
    expect(first.map((event) => event.id)).toEqual([...Array(first.length)].map((_, index) => index + 1))
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'trail.updated', stage: 'UNDERSTAND' }),
      expect.objectContaining({ type: 'trail.updated', stage: 'EXECUTE_READ' }),
      expect.objectContaining({ type: 'trail.updated', stage: 'SYNTHESIZE' }),
      expect.objectContaining({ type: 'trail.updated', stage: 'WAIT_CONFIRMATION' }),
      expect.objectContaining({ type: 'stream.completed' }),
    ]))
    expect(first.find((event) => event.type === 'message.delta')).toMatchObject({
      delta: expect.stringContaining('500元'),
    })

    const recommendations = first.find((event) => event.type === 'recommendations.ready')
    expect(recommendations).toBeDefined()
    if (recommendations?.type !== 'recommendations.ready') throw new Error('expected recommendations')
    expect(recommendations.groups.flatMap((group) => group.recommendations)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidence: expect.arrayContaining([expect.any(String)]),
          constraints: expect.arrayContaining([expect.any(String)]),
          uncertainty: expect.any(String),
        }),
      ]),
    )
  })

  it('decodes an SSE frame split inside a UTF-8 Chinese character and parses its typed event', () => {
    const rawEvent = { id: 1, type: 'message.delta' as const, messageId: 'mock-coffee-message-1', delta: '安静咖啡' }
    const bytes = new TextEncoder().encode(toMockSseFrame(rawEvent))
    const split = bytes.indexOf(new TextEncoder().encode('静')[1])
    const parsed = [...parseMockSseChunks([bytes.slice(0, split), bytes.slice(split)])]

    expect(parsed).toEqual([rawEvent])
    expect(parsed.map(parseAgentEvent)).toEqual([rawEvent])
  })

  it('drops an unterminated SSE frame at EOF', () => {
    const rawEvent = { id: 1, type: 'message.delta' as const, messageId: 'mock-coffee-message-1', delta: '安静咖啡' }
    const truncated = new TextEncoder().encode(toMockSseFrame(rawEvent).slice(0, -2))

    expect([...parseMockSseChunks([truncated])]).toEqual([])
  })

  it('stops its pending timer and completes cleanly when aborted', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const iterator = createMockAgentTransport({ delayMs: 100 }).stream(request, { signal: controller.signal })[Symbol.asyncIterator]()
    const next = iterator.next()

    expect(vi.getTimerCount()).toBe(1)
    controller.abort()

    await expect(next).resolves.toEqual({ done: true, value: undefined })
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it.each([0, 100])('does not yield after abort wins the delay-%s race', async (delayMs) => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const iterator = createMockAgentTransport({ delayMs }).stream(request, { signal: controller.signal })[Symbol.asyncIterator]()
    const next = iterator.next()

    if (delayMs > 0) vi.advanceTimersByTime(delayMs)
    controller.abort()

    await expect(next).resolves.toEqual({ done: true, value: undefined })
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('disconnects after the configured event and resumes strictly after it without replay', async () => {
    const transport = createMockAgentTransport({ failAfterEventId: 5 })
    const controller = new AbortController()
    const received: number[] = []

    await expect((async () => {
      for await (const event of transport.stream(request, { signal: controller.signal })) received.push(event.id)
    })()).rejects.toMatchObject({ name: 'MockStreamDisconnectedError', afterEventId: 5, recoverable: true })
    expect(received).toEqual([1, 2, 3, 4, 5])

    const resumed = await collect(transport.stream(request, { afterEventId: 5, signal: new AbortController().signal }))
    expect(resumed.map((event) => event.id)).toEqual([...Array(resumed.length)].map((_, index) => index + 6))
  })
})
