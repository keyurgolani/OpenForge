import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import WorkspaceAgentPage from '@/pages/WorkspaceAgentPage'

const navigateMock = vi.fn()

const ACTIVE_MESSAGE =
  'I am an AI assistant integrated into your OpenForge workspace. I can help you review knowledge, run workflows, and coordinate delegated work across the system.'
const EXPECTED_PREVIEW =
  'I am an AI assistant integrated into your OpenForge workspace. I can help you revie…'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => ({ workspaceId: 'ws-1', conversationId: 'conv-active' }),
    useNavigate: () => navigateMock,
  }
})

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: ({ queryKey, enabled = true }: { queryKey: unknown[]; enabled?: boolean }) => {
      if (!enabled) return { data: undefined }

      const [scope, id, category] = queryKey

      if (scope === 'workspace' && id === 'ws-1') {
        return { data: { id: 'ws-1', name: 'Atlas' } }
      }
      if (scope === 'workspaces') {
        return { data: [{ id: 'ws-1', name: 'Atlas' }] }
      }
      if (scope === 'conversations' && id === 'ws-1' && category === 'delegated') {
        return { data: [] }
      }
      if (scope === 'conversations' && id === 'ws-1' && category === 'trash') {
        return { data: [] }
      }
      if (scope === 'conversations' && id === 'ws-1') {
        return {
          data: [
            {
              id: 'conv-active',
              title: 'Who are you and what can you',
              message_count: 2,
              last_message_at: '2026-03-15T11:59:00.000Z',
            },
            {
              id: 'conv-other',
              title: 'Follow-up thread',
              message_count: 5,
              last_message_at: '2026-03-15T11:40:00.000Z',
            },
          ],
        }
      }
      if (scope === 'conversation' && id === 'conv-active') {
        return {
          data: {
            id: 'conv-active',
            title: 'Who are you and what can you',
            message_count: 2,
            last_message_at: '2026-03-15T11:59:00.000Z',
            messages: [
              {
                id: 'msg-1',
                role: 'assistant',
                content: ACTIVE_MESSAGE,
                created_at: '2026-03-15T11:59:00.000Z',
              },
            ],
          },
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
    sendMessage: vi.fn(() => true),
    cancelStream: vi.fn(),
    isConnected: true,
    lastError: null,
    clearLastError: vi.fn(),
  }),
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

describe('WorkspaceAgentPage active thread row', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'))
    navigateMock.mockReset()

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
    vi.useRealTimers()
  })

  it('renders a preview card treatment for the active chat row', () => {
    render(
      <MemoryRouter>
        <WorkspaceAgentPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(EXPECTED_PREVIEW)).toBeInTheDocument()
    expect(screen.getByText('1 minute ago')).toBeInTheDocument()
  })

  it('keeps the active chat action icons readable', () => {
    render(
      <MemoryRouter>
        <WorkspaceAgentPage />
      </MemoryRouter>,
    )

    const activeRow = screen.getByText(EXPECTED_PREVIEW).parentElement?.parentElement
    expect(activeRow).not.toBeNull()

    const renameButton = within(activeRow as HTMLElement).getByRole('button', { name: 'Rename chat' })
    const downloadButton = within(activeRow as HTMLElement).getByRole('button', { name: 'Download chat' })
    const trashButton = within(activeRow as HTMLElement).getByRole('button', { name: 'Move chat to trash' })

    expect(renameButton.querySelector('svg')).toHaveClass('h-3.5', 'w-3.5')
    expect(downloadButton.querySelector('svg')).toHaveClass('h-3.5', 'w-3.5')
    expect(trashButton.querySelector('svg')).toHaveClass('h-3.5', 'w-3.5')
  })
})
