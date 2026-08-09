import { parseAgentEvent } from '../protocol'
import type { AgentEvent, AgentTransport } from '../types'

import { quietDormitoryCoffeeScenario } from './scenarios'

export class MockStreamDisconnectedError extends Error {
  readonly afterEventId: number
  readonly recoverable = true

  constructor(afterEventId: number) {
    super(`Mock agent stream disconnected after event ${afterEventId}`)
    this.name = 'MockStreamDisconnectedError'
    this.afterEventId = afterEventId
  }
}

export const toMockSseFrame = (event: AgentEvent): string => {
  const data = JSON.stringify(event, null, 2)
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n')
  return `id: ${event.id}\nevent: ${event.type}\n${data}\n\n`
}

const parseSseFrame = (frame: string): unknown | null => {
  const fields = frame.split('\n')
  const id = fields.find((line) => line.startsWith('id: '))?.slice(4)
  const type = fields.find((line) => line.startsWith('event: '))?.slice(7)
  const data = fields
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .join('\n')
  if (!id || !type || !data) return null

  const payload = JSON.parse(data)
  return { ...payload, id: Number(id), type }
}

export function* parseMockSseChunks(chunks: Iterable<Uint8Array>): Generator<unknown> {
  const decoder = new TextDecoder()
  let buffered = ''
  for (const chunk of chunks) {
    buffered += decoder.decode(chunk, { stream: true })
    let delimiter = buffered.indexOf('\n\n')
    while (delimiter >= 0) {
      const parsed = parseSseFrame(buffered.slice(0, delimiter))
      if (parsed) yield parsed
      buffered = buffered.slice(delimiter + 2)
      delimiter = buffered.indexOf('\n\n')
    }
  }

  buffered += decoder.decode()
  if (buffered) {
    const parsed = parseSseFrame(buffered)
    if (parsed) yield parsed
  }
}

const waitForDelay = (delayMs: number, signal: AbortSignal): Promise<boolean> => {
  if (signal.aborted) return Promise.resolve(false)
  if (delayMs <= 0) return Promise.resolve(true)

  return new Promise((resolve) => {
    const timer = setTimeout(done, delayMs)
    const onAbort = () => {
      clearTimeout(timer)
      done(false)
    }
    function done(completed = true) {
      signal.removeEventListener('abort', onAbort)
      resolve(completed)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const parseFramedEvent = (event: AgentEvent): AgentEvent => {
  const chunks = [new TextEncoder().encode(toMockSseFrame(event))]
  const raw = [...parseMockSseChunks(chunks)][0]
  const parsed = parseAgentEvent(raw)
  if (!('type' in parsed)) throw new Error('Mock scenario contains an invalid agent event')
  return parsed
}

export const createMockAgentTransport = (options: {
  delayMs?: number
  failAfterEventId?: number
} = {}): AgentTransport => {
  const delayMs = options.delayMs ?? 0

  return {
    async *stream(_request, { afterEventId = 0, signal }) {
      for (const event of quietDormitoryCoffeeScenario) {
        if (event.id <= afterEventId) continue
        if (!(await waitForDelay(delayMs, signal))) return
        yield parseFramedEvent(event)
        if (event.id === options.failAfterEventId) throw new MockStreamDisconnectedError(event.id)
      }
    },
  }
}
