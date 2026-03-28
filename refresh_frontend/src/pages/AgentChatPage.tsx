import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { MessageSquare, PanelLeftClose, PanelLeft, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { chatRoute, globalChatRoute } from '@/lib/routes'
import { useWorkspaceId } from '@/hooks/useWorkspaceId'
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  permanentlyDeleteConversation,
  bulkRestoreConversations,
  bulkPermanentlyDeleteConversations,
  listGlobalConversations,
  createGlobalConversation,
  getGlobalConversation,
  updateGlobalConversation,
  deleteGlobalConversation,
  permanentlyDeleteGlobalConversation,
  bulkRestoreGlobalConversations,
  bulkPermanentlyDeleteGlobalConversations,
  addGlobalMessage,
  resolveApproval,
} from '@/lib/api'

import ConversationList from '@/components/chat/ConversationList'
import MessageThread from '@/components/chat/MessageThread'
import Composer from '@/components/chat/Composer'
import type { ConversationItem, ConversationCategory } from '@/components/chat/ConversationList'
import type { ChatMessage } from '@/components/chat/MessageThread'
import type { UserMessageData } from '@/components/chat/UserMessage'
import type { AgentResponseData } from '@/components/chat/AgentResponse'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Map raw API conversation to ConversationItem */
function toConversationItem(raw: any): ConversationItem {
  return {
    id: raw.id,
    title: raw.title || undefined,
    agentName: raw.agent_name || raw.agent_id || undefined,
    lastMessage: raw.last_message?.content || raw.snippet || undefined,
    updatedAt: raw.updated_at || raw.created_at || new Date().toISOString(),
    category: raw.is_archived
      ? 'trash'
      : raw.is_delegated
        ? 'delegated'
        : 'chats',
    isDelegated: !!raw.is_delegated,
  }
}

/** Map raw API message to ChatMessage */
function toChatMessage(raw: any): ChatMessage {
  if (raw.role === 'user') {
    const data: UserMessageData = {
      id: raw.id || generateId(),
      content: raw.content || '',
      timestamp: raw.created_at || new Date().toISOString(),
      attachments: raw.attachments?.map((a: any) => ({
        id: a.id || generateId(),
        name: a.filename || a.name || 'file',
        type: a.content_type || a.type || '',
        url: a.url,
        size: a.size,
      })),
    }
    return { role: 'user', data }
  }

  const data: AgentResponseData = {
    id: raw.id || generateId(),
    content: raw.content || '',
    timestamp: raw.created_at || new Date().toISOString(),
    agentName: raw.agent_name || undefined,
    modelName: raw.model_name || raw.model_id || undefined,
    timeline: raw.timeline?.map((step: any) => ({
      id: step.id || generateId(),
      type: step.type || 'thinking',
      label: step.label || step.type || 'Step',
      detail: step.detail || step.content,
      durationMs: step.duration_ms,
    })),
    toolCalls: raw.tool_calls?.map((tc: any) => ({
      id: tc.id || generateId(),
      toolName: tc.tool_name || tc.name || 'Unknown',
      category: tc.category,
      input: tc.input || tc.arguments,
      output: tc.output || tc.result,
      status: tc.status || 'success',
      durationMs: tc.duration_ms,
    })),
    hitlApprovals: raw.hitl_approvals?.map((h: any) => ({
      id: h.id,
      toolName: h.tool_name || h.tool_id || 'Unknown',
      actionSummary: h.action_summary || h.reason_text || '',
      riskLevel: h.risk_level || h.risk_category || 'medium',
      status: h.status || 'pending',
      input: h.tool_input || h.payload_preview,
    })),
  }
  return { role: 'assistant', data }
}

/* -------------------------------------------------------------------------- */
/* Sidebar panel width                                                        */
/* -------------------------------------------------------------------------- */

const SIDEBAR_WIDTH = 280

/* -------------------------------------------------------------------------- */
/* WebSocket message types                                                    */
/* -------------------------------------------------------------------------- */

interface WSMessage {
  type: 'chunk' | 'done' | 'timeline' | 'tool_call' | 'hitl' | 'error'
  content?: string
  timeline?: any
  tool_call?: any
  hitl?: any
  message_id?: string
  error?: string
}

/* -------------------------------------------------------------------------- */
/* Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function AgentChatPage() {
  const { workspaceId: rawWorkspaceId, conversationId } = useParams<{
    workspaceId?: string
    conversationId?: string
  }>()
  const resolvedWorkspaceId = useWorkspaceId()
  const navigate = useNavigate()

  // Use resolved UUID when we have a workspace route param, undefined for global chat
  const workspaceId = rawWorkspaceId ? resolvedWorkspaceId : undefined
  const isWorkspaceScoped = !!workspaceId

  /* State ------------------------------------------------------------------ */
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const streamingMessageIdRef = useRef<string | null>(null)

  /* Navigation helpers ----------------------------------------------------- */
  const navigateToConversation = useCallback(
    (cid?: string) => {
      if (isWorkspaceScoped) {
        navigate(chatRoute(workspaceId!, cid))
      } else {
        navigate(globalChatRoute(cid))
      }
    },
    [isWorkspaceScoped, workspaceId, navigate],
  )

  /* Fetch conversations ---------------------------------------------------- */
  const fetchConversations = useCallback(async () => {
    setConversationsLoading(true)
    try {
      const [chats, delegated, trashed] = await Promise.all([
        isWorkspaceScoped
          ? listConversations(workspaceId!, { category: 'chats' })
          : listGlobalConversations({ category: 'chats' }),
        isWorkspaceScoped
          ? listConversations(workspaceId!, { category: 'delegated' })
          : listGlobalConversations({ category: 'delegated' }),
        isWorkspaceScoped
          ? listConversations(workspaceId!, { include_archived: true })
          : listGlobalConversations({ category: 'trash' }),
      ])

      const chatItems = (chats.conversations ?? chats ?? []).map(toConversationItem)
      const delegatedItems = (delegated.conversations ?? delegated ?? []).map(
        (c: any) => toConversationItem({ ...c, is_delegated: true }),
      )
      const trashedItems = (trashed.conversations ?? trashed ?? [])
        .filter((c: any) => c.is_archived)
        .map((c: any) => toConversationItem({ ...c, is_archived: true }))

      setConversations([...chatItems, ...delegatedItems, ...trashedItems])
    } catch (err) {
      console.error('Failed to fetch conversations', err)
    } finally {
      setConversationsLoading(false)
    }
  }, [isWorkspaceScoped, workspaceId])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  /* Fetch messages for active conversation --------------------------------- */
  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      return
    }
    setMessagesLoading(true)
    try {
      const data = isWorkspaceScoped
        ? await getConversation(workspaceId!, conversationId, { include_messages: true })
        : await getGlobalConversation(conversationId, true)

      const rawMessages = data.messages ?? []
      setMessages(rawMessages.map(toChatMessage))
    } catch (err) {
      console.error('Failed to fetch messages', err)
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }, [conversationId, isWorkspaceScoped, workspaceId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  /* WebSocket connection --------------------------------------------------- */
  const connectWebSocket = useCallback(
    (cid: string) => {
      // Close existing
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const wsPath = isWorkspaceScoped
        ? `/ws/workspace/${workspaceId}/agent`
        : `/ws/chat/${cid}/agent`

      const ws = new WebSocket(`${protocol}//${host}${wsPath}`)
      wsRef.current = ws

      ws.onopen = () => {
        // Send conversation context
        ws.send(JSON.stringify({ type: 'init', conversation_id: cid }))
      }

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data)
          handleWSMessage(msg)
        } catch {
          // Non-JSON message, ignore
        }
      }

      ws.onerror = () => {
        console.error('WebSocket error')
      }

      ws.onclose = () => {
        setStreaming(false)
        streamingMessageIdRef.current = null
      }
    },
    [isWorkspaceScoped, workspaceId],
  )

  function handleWSMessage(msg: WSMessage) {
    switch (msg.type) {
      case 'chunk': {
        const id = streamingMessageIdRef.current
        if (!id) {
          // Start a new streaming message
          const newId = msg.message_id || generateId()
          streamingMessageIdRef.current = newId
          setStreaming(true)
          const agentMsg: AgentResponseData = {
            id: newId,
            content: msg.content || '',
            timestamp: new Date().toISOString(),
            streaming: true,
          }
          setMessages((prev) => [...prev, { role: 'assistant', data: agentMsg }])
        } else {
          // Append chunk to existing message
          setMessages((prev) =>
            prev.map((m) =>
              m.role === 'assistant' && m.data.id === id
                ? {
                    ...m,
                    data: {
                      ...m.data,
                      content: (m.data as AgentResponseData).content + (msg.content || ''),
                    },
                  }
                : m,
            ),
          )
        }
        break
      }

      case 'done': {
        const id = streamingMessageIdRef.current
        if (id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === 'assistant' && m.data.id === id
                ? {
                    ...m,
                    data: {
                      ...(m.data as AgentResponseData),
                      streaming: false,
                      content: msg.content || (m.data as AgentResponseData).content,
                    },
                  }
                : m,
            ),
          )
        }
        setStreaming(false)
        streamingMessageIdRef.current = null
        // Refresh conversation list (may have new title)
        fetchConversations()
        break
      }

      case 'timeline': {
        const id = streamingMessageIdRef.current
        if (id && msg.timeline) {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === 'assistant' && m.data.id === id
                ? {
                    ...m,
                    data: {
                      ...(m.data as AgentResponseData),
                      timeline: [
                        ...((m.data as AgentResponseData).timeline || []),
                        {
                          id: generateId(),
                          type: msg.timeline.type || 'thinking',
                          label: msg.timeline.label || 'Step',
                          detail: msg.timeline.detail,
                          durationMs: msg.timeline.duration_ms,
                        },
                      ],
                    },
                  }
                : m,
            ),
          )
        }
        break
      }

      case 'tool_call': {
        const id = streamingMessageIdRef.current
        if (id && msg.tool_call) {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === 'assistant' && m.data.id === id
                ? {
                    ...m,
                    data: {
                      ...(m.data as AgentResponseData),
                      toolCalls: [
                        ...((m.data as AgentResponseData).toolCalls || []),
                        {
                          id: msg.tool_call.id || generateId(),
                          toolName: msg.tool_call.tool_name || 'Unknown',
                          category: msg.tool_call.category,
                          input: msg.tool_call.input,
                          output: msg.tool_call.output,
                          status: msg.tool_call.status || 'running',
                          durationMs: msg.tool_call.duration_ms,
                        },
                      ],
                    },
                  }
                : m,
            ),
          )
        }
        break
      }

      case 'hitl': {
        const id = streamingMessageIdRef.current
        if (id && msg.hitl) {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === 'assistant' && m.data.id === id
                ? {
                    ...m,
                    data: {
                      ...(m.data as AgentResponseData),
                      hitlApprovals: [
                        ...((m.data as AgentResponseData).hitlApprovals || []),
                        {
                          id: msg.hitl.id,
                          toolName: msg.hitl.tool_name || 'Unknown',
                          actionSummary: msg.hitl.action_summary || '',
                          riskLevel: msg.hitl.risk_level || 'medium',
                          status: 'pending',
                          input: msg.hitl.tool_input,
                        },
                      ],
                    },
                  }
                : m,
            ),
          )
        }
        break
      }

      case 'error': {
        console.error('Agent error:', msg.error)
        setStreaming(false)
        streamingMessageIdRef.current = null
        break
      }
    }
  }

  // Connect WS when conversationId changes
  useEffect(() => {
    if (conversationId) {
      connectWebSocket(conversationId)
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [conversationId, connectWebSocket])

  /* Actions ---------------------------------------------------------------- */
  async function handleNewConversation() {
    try {
      const data = isWorkspaceScoped
        ? await createConversation(workspaceId!)
        : await createGlobalConversation({})
      await fetchConversations()
      navigateToConversation(data.id)
    } catch (err) {
      console.error('Failed to create conversation', err)
    }
    setMobileSidebarOpen(false)
  }

  function handleSelectConversation(id: string) {
    navigateToConversation(id)
    setMobileSidebarOpen(false)
  }

  async function handleDeleteConversation(id: string) {
    try {
      const conv = conversations.find((c) => c.id === id)
      if (conv?.category === 'trash') {
        isWorkspaceScoped
          ? await permanentlyDeleteConversation(workspaceId!, id)
          : await permanentlyDeleteGlobalConversation(id)
      } else {
        isWorkspaceScoped
          ? await deleteConversation(workspaceId!, id)
          : await deleteGlobalConversation(id)
      }
      await fetchConversations()
      if (id === conversationId) {
        navigateToConversation()
      }
    } catch (err) {
      console.error('Failed to delete conversation', err)
    }
  }

  async function handleRenameConversation(id: string, newTitle: string) {
    try {
      isWorkspaceScoped
        ? await updateConversation(workspaceId!, id, { title: newTitle, title_locked: true })
        : await updateGlobalConversation(id, { title: newTitle, title_locked: true })
      await fetchConversations()
    } catch (err) {
      console.error('Failed to rename conversation', err)
    }
  }

  async function handleRestoreConversation(id: string) {
    try {
      isWorkspaceScoped
        ? await updateConversation(workspaceId!, id, { is_archived: false })
        : await updateGlobalConversation(id, { is_archived: false })
      await fetchConversations()
    } catch (err) {
      console.error('Failed to restore conversation', err)
    }
  }

  async function handleBulkRestore() {
    try {
      isWorkspaceScoped
        ? await bulkRestoreConversations(workspaceId!)
        : await bulkRestoreGlobalConversations()
      await fetchConversations()
    } catch (err) {
      console.error('Failed to bulk restore', err)
    }
  }

  async function handleBulkPermanentDelete() {
    try {
      isWorkspaceScoped
        ? await bulkPermanentlyDeleteConversations(workspaceId!)
        : await bulkPermanentlyDeleteGlobalConversations()
      await fetchConversations()
      if (conversationId) {
        const stillExists = conversations.some(
          (c) => c.id === conversationId && c.category !== 'trash',
        )
        if (!stillExists) navigateToConversation()
      }
    } catch (err) {
      console.error('Failed to bulk delete', err)
    }
  }

  async function handleSendMessage(content: string, _attachments?: File[]) {
    if (!content.trim()) return

    // If no conversation, create one first
    let cid = conversationId
    if (!cid) {
      try {
        const data = isWorkspaceScoped
          ? await createConversation(workspaceId!)
          : await createGlobalConversation({})
        cid = data.id
        navigateToConversation(cid)
        await fetchConversations()
      } catch (err) {
        console.error('Failed to create conversation', err)
        return
      }
    }

    // Add user message to local state immediately
    const userMsg: UserMessageData = {
      id: generateId(),
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, { role: 'user', data: userMsg }])

    // Send via WS or API
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'message',
          content,
          conversation_id: cid,
        }),
      )
    } else {
      // Fallback: use REST API for global chat
      try {
        if (!isWorkspaceScoped) {
          await addGlobalMessage(cid!, { content, role: 'user' })
          // Refresh messages to get the agent response
          await fetchMessages()
        }
      } catch (err) {
        console.error('Failed to send message', err)
      }
    }
  }

  async function handleHITLResolve(hitlId: string, approved: boolean) {
    try {
      await resolveApproval(hitlId, approved)
      // Update local state
      setMessages((prev) =>
        prev.map((m) => {
          if (m.role !== 'assistant') return m
          const agentData = m.data as AgentResponseData
          if (!agentData.hitlApprovals) return m
          return {
            ...m,
            data: {
              ...agentData,
              hitlApprovals: agentData.hitlApprovals.map((h) =>
                h.id === hitlId
                  ? { ...h, status: approved ? 'approved' : 'denied' as const }
                  : h,
              ),
            },
          }
        }),
      )
    } catch (err) {
      console.error('Failed to resolve approval', err)
    }
  }

  /* Responsive detection --------------------------------------------------- */
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  /* Sidebar panel content -------------------------------------------------- */
  const sidebarContent = (
    <ConversationList
      conversations={conversations}
      activeConversationId={conversationId}
      loading={conversationsLoading}
      onSelect={handleSelectConversation}
      onNew={handleNewConversation}
      onDelete={handleDeleteConversation}
      onRename={handleRenameConversation}
      onRestore={handleRestoreConversation}
      onBulkRestore={handleBulkRestore}
      onBulkPermanentDelete={handleBulkPermanentDelete}
    />
  )

  return (
    <div className="flex h-full overflow-hidden bg-bg">
      {/* Desktop sidebar */}
      {!isMobile && (
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: SIDEBAR_WIDTH, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="shrink-0 overflow-hidden border-r border-border/40 bg-bg-elevated"
            >
              <div style={{ width: SIDEBAR_WIDTH }} className="h-full">
                {sidebarContent}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Mobile sidebar as sheet */}
      {isMobile && (
        <Dialog.Root open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content
              className={cn(
                'fixed inset-y-0 left-0 z-50 w-[280px]',
                'bg-bg-elevated shadow-xl',
                'animate-slide-in-right',
              )}
            >
              <Dialog.Title className="sr-only">Conversations</Dialog.Title>
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
                  <span className="font-display text-sm font-semibold text-fg">
                    Conversations
                  </span>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-md p-1 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="flex-1 overflow-hidden">
                  {sidebarContent}
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/30 px-3">
          {/* Sidebar toggle */}
          <button
            type="button"
            onClick={() => isMobile ? setMobileSidebarOpen(true) : setSidebarOpen(!sidebarOpen)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md',
              'text-fg-subtle hover:text-fg hover:bg-bg-sunken',
              'transition-colors focus-ring',
            )}
            aria-label={sidebarOpen ? 'Collapse conversations' : 'Expand conversations'}
          >
            {sidebarOpen && !isMobile ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>

          {/* Conversation title */}
          <div className="flex-1 min-w-0">
            {conversationId ? (
              <span className="truncate font-display text-sm font-medium text-fg">
                {conversations.find((c) => c.id === conversationId)?.title || 'Conversation'}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-display text-sm font-medium text-fg-muted">
                <MessageSquare className="h-3.5 w-3.5" />
                {isWorkspaceScoped ? 'Workspace Chat' : 'Chat'}
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        <MessageThread
          messages={messages}
          loading={messagesLoading}
          onHITLResolve={handleHITLResolve}
        />

        {/* Composer */}
        <div className="shrink-0 border-t border-border/30 bg-bg px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <Composer
              onSend={handleSendMessage}
              disabled={streaming}
              placeholder={
                conversationId
                  ? 'Type a message...'
                  : 'Start a new conversation...'
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
