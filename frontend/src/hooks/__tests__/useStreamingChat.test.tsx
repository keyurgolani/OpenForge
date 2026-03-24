import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStreamingChat } from '@/hooks/useStreamingChat'

const listeners = new Map<string, Set<(message: any) => void>>()
const invalidateQueries = vi.fn()
const sendMock = vi.fn(() => true)
const getGlobalConversationStreamState = vi.fn()
let isConnected = false

function emit(event: string, message: any) {
  const handlers = listeners.get(event)
  if (!handlers) return
  for (const handler of handlers) handler(message)
}

vi.mock('@/hooks/useChatWebSocket', () => ({
  useChatWebSocket: () => ({
    on: (event: string, callback: (message: any) => void) => {
      const handlers = listeners.get(event) ?? new Set()
      handlers.add(callback)
      listeners.set(event, handlers)
      return () => {
        handlers.delete(callback)
        if (handlers.size === 0) listeners.delete(event)
      }
    },
    send: sendMock,
    isConnected,
  }),
}))

vi.mock('@/lib/api', () => ({
  getConversationStreamState: vi.fn(),
  getGlobalConversationStreamState,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries,
    }),
  }
})

describe('useStreamingChat', () => {
  beforeEach(() => {
    listeners.clear()
    invalidateQueries.mockReset()
    sendMock.mockClear()
    getGlobalConversationStreamState.mockReset()
    isConnected = false
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps retrying stream-state recovery long enough for delayed executions to become active', async () => {
    getGlobalConversationStreamState
      .mockResolvedValueOnce({ active: false })
      .mockResolvedValueOnce({ active: false })
      .mockResolvedValueOnce({ active: false })
      .mockResolvedValueOnce({ active: false })
      .mockResolvedValue({
        active: true,
        content: '',
        thinking: 'Searching for context',
        timeline: [{ type: 'thinking', content: 'Searching for context' }],
      })

    const { result } = renderHook(() => useStreamingChat('conv-1', null))

    expect(result.current.isStreaming).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000)
    })

    expect(getGlobalConversationStreamState).toHaveBeenCalledTimes(5)
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.timeline).toEqual([
      { type: 'thinking', content: 'Searching for context' },
    ])
  })

  it('ignores agent_error events that do not belong to the active conversation', async () => {
    const { result } = renderHook(() => useStreamingChat('conv-1', null))

    act(() => {
      emit('agent_stream_snapshot', {
        conversation_id: 'conv-1',
        data: {
          content: '',
          thinking: 'Working',
          timeline: [{ type: 'thinking', content: 'Working' }],
        },
      })
    })

    expect(result.current.isStreaming).toBe(true)
    expect(result.current.lastError).toBeNull()

    act(() => {
      emit('agent_error', {
        detail: 'Other execution failed',
      })
    })

    expect(result.current.isStreaming).toBe(true)
    expect(result.current.lastError).toBeNull()
  })

  it('preserves queued streaming state when a new conversation is opened before the websocket connects', async () => {
    getGlobalConversationStreamState.mockResolvedValue({ active: false })

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string | null }) => useStreamingChat(conversationId, null),
      { initialProps: { conversationId: null } },
    )

    act(() => {
      expect(result.current.sendMessage('Hello there', undefined, 'conv-fast')).toBe(true)
    })

    expect(result.current.isStreaming).toBe(true)

    await act(async () => {
      rerender({ conversationId: 'conv-fast' })
    })

    expect(result.current.isStreaming).toBe(true)

    isConnected = true

    await act(async () => {
      rerender({ conversationId: 'conv-fast' })
    })

    expect(sendMock).toHaveBeenCalledWith({
      type: 'chat_message',
      conversation_id: 'conv-fast',
      content: 'Hello there',
    })
  })
})
