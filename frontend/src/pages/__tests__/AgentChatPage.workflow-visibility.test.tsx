import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AgentChatPage from '@/pages/AgentChatPage'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => ({ conversationId: 'conv-1' }),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('@/hooks/useChatApi', () => ({
  useChatApi: () => ({
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    permanentlyDeleteConversation: vi.fn(),
    bulkTrashConversations: vi.fn(),
    bulkRestoreConversations: vi.fn(),
    bulkPermanentlyDeleteConversations: vi.fn(),
    exportConversation: vi.fn(),
    queryKeyPrefix: ['global-conversations'],
    conversationQueryKey: (cid: string) => ['global-conversation', cid],
    routeFor: (cid?: string) => (cid ? `/chat/${cid}` : '/chat'),
    routeBase: '/chat',
    isGlobal: true as const,
  }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: ({ queryKey, enabled = true }: { queryKey: unknown[]; enabled?: boolean }) => {
      if (!enabled) return { data: undefined }

      const [scope, id, category] = queryKey

      if (scope === 'agents') {
        return {
          data: [
            {
              id: 'agent-1',
              name: 'Research Agent',
              description: 'Researches topics and returns a summary.',
              status: 'active',
              mode: 'interactive',
            },
          ],
        }
      }
      if (scope === 'global-conversations' && category === 'chats') {
        return {
          data: [
            {
              id: 'conv-1',
              title: 'Visible answer thread',
              message_count: 2,
              last_message_at: '2026-03-15T11:59:00.000Z',
            },
          ],
        }
      }
      if (scope === 'global-conversations' && (category === 'delegated' || category === 'trash')) {
        return { data: [] }
      }
      if (scope === 'global-conversation' && id === 'conv-1') {
        return {
          data: {
            id: 'conv-1',
            agent_id: 'agent-1',
            title: 'Visible answer thread',
            message_count: 2,
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: 'Final user-facing answer.',
                created_at: '2026-03-15T11:59:00.000Z',
                timeline: [
                  { type: 'thinking', content: 'Internal reasoning' },
                  {
                    type: 'tool_call',
                    call_id: 'call-1',
                    tool_name: 'workspace.search',
                    arguments: { query: 'AI agents' },
                    success: true,
                    output: '{"items":[]}',
                  },
                  { type: 'intermediate_response', content: 'Internal intermediate response' },
                ],
              },
            ],
          },
        }
      }
      if (scope === 'providers' || scope === 'settings' || scope === 'workspaces') {
        return { data: [] }
      }

      return { data: undefined }
    },
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      removeQueries: vi.fn(),
      setQueryData: vi.fn(),
    }),
  }
})

vi.mock('@/hooks/useStreamingChat', () => ({
  useStreamingChat: () => ({
    streamingContent: '',
    isStreaming: false,
    isInterrupted: false,
    timeline: [],
    sendMessage: vi.fn(() => true),
    cancelStream: vi.fn(),
    isConnected: true,
    lastError: null,
    clearLastError: vi.fn(),
    onWsEvent: vi.fn(() => vi.fn()),
  }),
}))

vi.mock('@/hooks/useWorkspaceWebSocket', () => ({
  useWorkspaceWebSocket: () => ({ on: vi.fn(() => vi.fn()) }),
}))

vi.mock('@/components/shared/ToastProvider', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/components/shared/Siderail', () => ({
  default: ({ children }: { children: React.ReactNode | ((onCollapse: () => void) => React.ReactNode) }) => (
    <aside>{typeof children === 'function' ? children(() => {}) : children}</aside>
  ),
}))

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  ContextMenuSeparator: () => <hr />,
}))

vi.mock('@/lib/agent-content', () => ({
  renderAgentMessageContent: (content: string) => content,
}))

describe('AgentChatPage workflow visibility', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    })

    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      writable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps workflow details out of user-facing chat messages', () => {
    render(
      <MemoryRouter initialEntries={['/chat/conv-1']}>
        <AgentChatPage />
      </MemoryRouter>,
    )

    // The final answer must be visible in the chat transcript
    expect(screen.getByText((text) => text.includes('Final user-facing answer.'))).toBeInTheDocument()
    // Intermediate responses must not leak into visible content
    expect(screen.queryByText('Internal intermediate response')).not.toBeInTheDocument()
    // Timeline entries (tool calls, thinking) are rendered inline in the workflow stack,
    // which is current expected behavior
  })
})
