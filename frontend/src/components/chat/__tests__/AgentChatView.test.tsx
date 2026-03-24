import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
    expect(screen.getByText('Hello human')).toBeInTheDocument()
  })

  it('renders the composer', () => {
    render(<AgentChatView {...defaultProps} messages={[]} />)
    expect(screen.getByPlaceholderText('Message...')).toBeInTheDocument()
  })
})
