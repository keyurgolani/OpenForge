import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = new Map<string, Set<(message: any) => void>>()
const invalidateQueries = vi.fn()
const sendMock = vi.fn(() => true)
const mockGetGlobalConversationStreamState = vi.fn()
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
  getGlobalConversationStreamState: (...args: any[]) => mockGetGlobalConversationStreamState(...args),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: () => ({
    activeStreamConversationId: null,
    setActiveStreamConversationId: vi.fn(),
  }),
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

import { useStreamingChat } from '@/hooks/useStreamingChat'

describe('useStreamingChat', () => {
  beforeEach(() => {
    listeners.clear()
    invalidateQueries.mockReset()
    sendMock.mockClear()
    mockGetGlobalConversationStreamState.mockReset()
    isConnected = false
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recovers streaming state when the backend reports an active stream', async () => {
    vi.useRealTimers()

    mockGetGlobalConversationStreamState
      .mockResolvedValue({
        active: true,
        content: '',
        thinking: 'Searching for context',
        timeline: [{ type: 'thinking', content: 'Searching for context' }],
      })

    const { result } = renderHook(() => useStreamingChat('conv-1', null))

    // Allow async effects to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockGetGlobalConversationStreamState).toHaveBeenCalled()
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
    // Return a promise that never resolves so the stream-state recovery poll
    // does not interfere with the queued message test
    mockGetGlobalConversationStreamState.mockReturnValue(new Promise(() => {}))

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
