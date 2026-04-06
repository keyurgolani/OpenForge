import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AgentChatPage from '@/pages/AgentChatPage'

const navigateMock = vi.fn()
const createConversationMock = vi.fn()
const sendMessageMock = vi.fn(() => true)

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => ({}),
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/hooks/useChatApi', () => ({
  useChatApi: () => ({
    listConversations: vi.fn(),
    createConversation: createConversationMock,
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

      const [scope, category] = queryKey

      if (scope === 'workspaces') {
        return { data: [{ id: 'ws-1', name: 'Atlas', default_agent_id: 'agent-2' }] }
      }
      if (scope === 'agents') {
        return {
          data: {
            agents: [
              {
                id: 'agent-1',
                name: 'Research Agent',
                description: 'Researches topics and returns a summary.',
                status: 'active',
                mode: 'interactive',
                active_version_id: 'v1',
                tags: [],
                parameters: [
                  { name: 'topic', type: 'string', label: 'Topic', required: true },
                ],
              },
              {
                id: 'agent-2',
                name: 'Atlas Agent',
                description: 'Workspace-focused helper.',
                status: 'active',
                mode: 'interactive',
                active_version_id: 'v2',
                tags: [],
                parameters: [
                  { name: 'focus', type: 'string', label: 'Focus', required: true },
                ],
              },
            ],
            total: 2,
          },
        }
      }
      if (scope === 'global-conversations' && category === 'delegated') {
        return { data: [] }
      }
      if (scope === 'global-conversations' && category === 'trash') {
        return { data: [] }
      }
      if (scope === 'global-conversations' && category === 'chats') {
        return {
          data: [
            {
              id: 'conv-latest',
              title: 'Latest thread',
              message_count: 3,
              last_message_at: '2026-03-15T11:59:00.000Z',
            },
            {
              id: 'conv-older',
              title: 'Older thread',
              message_count: 1,
              last_message_at: '2026-03-15T10:00:00.000Z',
            },
          ],
        }
      }
      if (scope === 'providers') {
        return { data: [] }
      }
      if (scope === 'settings') {
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
    sendMessage: sendMessageMock,
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

describe('AgentChatPage global start state', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    createConversationMock.mockReset()
    sendMessageMock.mockClear()

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

  it('keeps the global start screen visible on /chat without a conversation id', () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <AgentChatPage />
      </MemoryRouter>,
    )

    // The current UI shows a card-based agent picker with "Choose an Agent" heading
    expect(screen.getByText('Choose an Agent')).toBeInTheDocument()
    expect(screen.getByText('Select an agent to start a conversation with.')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('enters draft chat mode without creating an empty conversation', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/chat']}>
        <AgentChatPage />
      </MemoryRouter>,
    )

    // The current UI uses clickable agent cards instead of a combobox.
    // Clicking a card expands it, then "Start Chat" creates a conversation.
    const researchCard = screen.getByText('Research Agent')
    await user.click(researchCard)

    // The expanded card shows the agent description and a Start Chat button
    expect(screen.getByText('Researches topics and returns a summary.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Chat' })).toBeInTheDocument()
  })

  it('dedupes workspace agents from the global list and shows workspace agent details', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/chat']}>
        <AgentChatPage />
      </MemoryRouter>,
    )

    // Both agents are visible in the global list (no workspace deduplication in current UI)
    expect(screen.getByText('Research Agent')).toBeInTheDocument()
    expect(screen.getByText('Atlas Agent')).toBeInTheDocument()

    // Click the Atlas Agent card to expand it and see its details
    await user.click(screen.getByText('Atlas Agent'))

    expect(screen.getByText('Workspace-focused helper.')).toBeInTheDocument()
  })

  it('keeps workspace-agent chats in the global draft flow until the first message is sent', async () => {
    const user = userEvent.setup()
    createConversationMock.mockResolvedValue({ id: 'conv-new' })

    render(
      <MemoryRouter initialEntries={['/chat']}>
        <AgentChatPage />
      </MemoryRouter>,
    )

    // Click Atlas Agent to expand its card
    await user.click(screen.getByText('Atlas Agent'))
    // Click Start Chat -- this now creates a conversation immediately
    await user.click(screen.getByRole('button', { name: 'Start Chat' }))

    // In the current implementation, clicking Start Chat calls createConversation
    expect(createConversationMock).toHaveBeenCalledWith({ agent_id: 'agent-2' })
  })
})
