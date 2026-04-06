import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/hooks/chat/useAgentStream', () => {
  class FakeEmitter { on() {} off() {} emit() {} clear() {} }
  return {
    AgentEmitter: FakeEmitter,
    useAgentStream: () => ({
      emitter: new FakeEmitter(),
      handleMessage: vi.fn(),
    }),
  }
})

vi.mock('@/hooks/timeline/useChatTimelineAdapter', () => ({
  useChatTimelineAdapter: () => ({
    phase: 'idle',
    timeline: [],
    thinkingDuration: null,
    modelInfo: null,
    currentThought: null,
    allThoughts: [],
    reset: vi.fn(),
    handleThoughtsDrained: vi.fn(),
  }),
}))

vi.mock('@/hooks/chat/useStreamRenderer', () => ({
  useStreamRenderer: () => ({
    displayText: '',
    isStreaming: false,
    reset: vi.fn(),
  }),
}))

vi.mock('@/hooks/chat/useScrollIntent', () => ({
  useScrollIntent: () => ({
    intent: 'stuck',
    scrollToBottom: vi.fn(),
    nudgeScroll: vi.fn(),
    containerRef: { current: null },
    contentRef: { current: null },
    preserveReadingPosition: vi.fn(),
  }),
}))

vi.mock('@/lib/agent-content', () => ({
  renderAgentMessageContent: (content: string) => content,
}))

import { AgentChatView } from '@/components/chat/AgentChatView'

describe('AgentChatView', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cb(); return 1 })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const defaultProps = {
    conversationId: 'conv-1',
    agent: { id: 'agent-1', name: 'Test Agent' },
    onSendMessage: () => {},
  }

  it('renders user messages', () => {
    render(
      <AgentChatView
        {...defaultProps}
        messages={[{ id: 'm1', role: 'user' as const, content: 'Hello agent', created_at: '2026-01-01T00:00:00Z' }]}
      />
    )
    expect(screen.getByText('Hello agent')).toBeInTheDocument()
  })

  it('renders assistant messages', () => {
    render(
      <AgentChatView
        {...defaultProps}
        messages={[{ id: 'm1', role: 'assistant' as const, content: 'Hello human', created_at: '2026-01-01T00:00:00Z' }]}
      />
    )
    // Assistant content is rendered via MarkdownIt (dangerouslySetInnerHTML), so use a function matcher
    expect(screen.getByText((text) => text.includes('Hello human'))).toBeInTheDocument()
  })

  it('renders the composer', () => {
    render(<AgentChatView {...defaultProps} messages={[]} />)
    expect(screen.getByPlaceholderText('Message...')).toBeInTheDocument()
  })
})
