import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAgentStream } from '@/hooks/chat/useAgentStream'
import { useChatTimelineAdapter } from '@/hooks/timeline/useChatTimelineAdapter'
import { useStreamRenderer } from '@/hooks/chat/useStreamRenderer'
import { useScrollIntent } from '@/hooks/chat/useScrollIntent'
import { MessageThread } from './MessageThread'
import { UserMessageCard } from './UserMessageCard'
import { AgentResponseBlock } from './AgentResponseBlock'
import { Composer } from './Composer'
import type { ModelPickerOption } from './ComposerModelPicker'
import { ScrollToBottomFAB } from './ScrollToBottomFAB'
import { HITLNotificationBanner } from './HITLNotificationBanner'
import { formatDateTime } from '@/lib/formatters'
import type { TimelineItem, ToolCallTimelineItem, SubAgentTimelineItem } from '@/types/timeline'

/**
 * Parse raw timeline from the API (which may contain model_selection, thinking,
 * and tool_call entries) into structured data the UI components expect.
 * Returns a unified TimelineItem array with thinking entries inline.
 */

interface ModelInfo {
  providerName: string
  providerDisplayName: string
  model: string
  isOverride: boolean
  systemPrompt?: string
}

const AGENT_INVOKE_TOOLS = new Set(['platform.agent.invoke', 'agent.invoke'])

function parseMessageTimeline(rawTimeline: unknown[]): {
  items: TimelineItem[]
  thoughts: string[]
  thinkingDuration: number | null
  modelInfo: ModelInfo | null
} {
  const items: TimelineItem[] = []
  const thoughts: string[] = []
  let thinkingDuration: number | null = null
  let modelInfo: ModelInfo | null = null
  let thinkingIdx = 0

  for (const raw of rawTimeline) {
    const item = raw as Record<string, unknown>
    if (item.type === 'model_selection') {
      modelInfo = {
        providerName: (item.provider_name as string) ?? '',
        providerDisplayName: (item.provider_display_name as string) ?? (item.provider_name as string) ?? '',
        model: (item.model as string) ?? '',
        isOverride: (item.is_override as boolean) ?? false,
      }
    } else if (item.type === 'tool_call') {
      const isSubagent = AGENT_INVOKE_TOOLS.has(item.tool_name as string)
      const status = item.success === true ? 'complete' as const
        : item.success === false ? 'error' as const
        : item.hitl ? 'awaiting_approval' as const
        : (item.output !== undefined || item.error) ? 'complete' as const
        : 'complete' as const

      if (isSubagent) {
        const args = (item.arguments as Record<string, unknown>) ?? {}
        items.push({
          type: 'subagent',
          id: `msg-subagent-${items.length}`,
          call_id: (item.call_id as string) ?? '',
          tool_name: (item.tool_name as string) ?? '',
          arguments: args,
          agent_name: (args.agent_slug ?? args.agent_id ?? 'Agent') as string,
          status,
          success: (item.success as boolean | null) ?? null,
          output: item.output,
          error: (item.error as string | null) ?? null,
          duration_ms: (item.duration_ms as number | null) ?? null,
          children: (item.nested_timeline as TimelineItem[]) ?? [],
        } satisfies SubAgentTimelineItem)
      } else {
        items.push({
          type: 'tool_call',
          id: `msg-tool-${items.length}`,
          call_id: (item.call_id as string) ?? '',
          tool_name: (item.tool_name as string) ?? '',
          arguments: (item.arguments as Record<string, unknown>) ?? {},
          status,
          hitl: (item.hitl as ToolCallTimelineItem['hitl']) ?? null,
          success: (item.success as boolean | null) ?? null,
          output: item.output,
          error: (item.error as string | null) ?? null,
          duration_ms: (item.duration_ms as number | null) ?? null,
          nested_timeline: (item.nested_timeline as TimelineItem[] | null) ?? null,
        } satisfies ToolCallTimelineItem)
      }
    } else if (item.type === 'thinking') {
      const content = (item.content as string) ?? ''
      if (content) thoughts.push(content)
      const dur = (item.duration_ms ?? item.durationMs ?? null) as number | null
      if (dur) thinkingDuration = dur
      items.push({
        type: 'thinking',
        id: `msg-thinking-${thinkingIdx++}`,
        status: 'complete',
        duration_ms: dur,
        sentences: content ? content.split(/(?<=[.!?])\s+/).filter(Boolean) : [],
      })
    } else if (item.type === 'intermediate_response') {
      items.push({
        type: 'intermediate_response' as const,
        id: `msg-ir-${items.length}`,
        content: (item.content as string) ?? '',
      })
    }
  }

  return { items, thoughts, thinkingDuration, modelInfo }
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string | null
  timeline?: TimelineItem[] | null
  created_at: string
  attachments_processed?: {
    filename: string
    content_type: string
    id?: string
    extracted_text?: string | null
    pipeline?: string
    file_size?: number
  }[]
  is_interrupted?: boolean
}

interface AgentChatViewProps {
  conversationId: string
  agent: { id: string; name: string; slug?: string; mode?: string }
  messages: Message[]
  isLoadingMessages?: boolean
  onSendMessage: (content: string, options?: { optimize?: boolean }) => void
  onCancelStream?: () => void
  onApproveHITL?: (hitlId: string) => void
  onDenyHITL?: (hitlId: string, note?: string) => void
  onRetry?: () => void
  onConversationUpdated?: (conversation: { id: string; title?: string }) => void
  onStreamComplete?: (messageId: string) => void
  onAttach?: (files: File[]) => void
  onRemoveAttachment?: (id: string) => void
  attachments?: { id: string; filename: string; content_type: string; size: number; status?: 'uploading' | 'extracted' | 'error'; extracted_text?: string | null; pipeline?: string | null; onRetry?: () => void }[]
  composerDisabled?: boolean
  userInitial?: string
  /** When true, the parent has sent a message and is awaiting the first streaming event. Shows immediate "Responding..." indicator. */
  parentIsStreaming?: boolean
  /** Called once on mount with the handleMessage function so the parent can forward WS messages. */
  onReady?: (handleMessage: (msg: { type: string; data?: unknown; conversation_id?: string }) => void) => void
  /** Model picker props */
  modelOptions?: ModelPickerOption[]
  selectedModelKey?: string
  onModelSelect?: (key: string) => void
  defaultModelLabel?: string
}

/** Renders a completed assistant message with properly parsed timeline data. */
function ParsedAgentResponse({ msg, onHITLAction, agentName, timestamp }: {
  msg: Message
  onHITLAction?: (hitlId: string, action: 'approve' | 'deny', note?: string) => void
  agentName?: string
  timestamp?: string
}) {
  const { items, thoughts, thinkingDuration: msgThinkingDuration, modelInfo: msgModelInfo } = useMemo(
    () => parseMessageTimeline((msg.timeline ?? []) as unknown[]),
    [msg.timeline]
  )

  // Fallback: if no thinking entries in timeline but msg.thinking exists,
  // add a thinking entry at the start of the timeline
  const resolvedItems = useMemo(() => {
    const hasThinking = items.some(i => i.type === 'thinking')
    if (!hasThinking && msg.thinking) {
      const thinkingSentences = msg.thinking.split(/(?<=[.!?])\s+/).filter(Boolean)
      return [
        {
          type: 'thinking' as const,
          id: 'msg-thinking-fallback',
          status: 'complete' as const,
          duration_ms: msgThinkingDuration,
          sentences: thinkingSentences,
        },
        ...items,
      ]
    }
    return items
  }, [items, msg.thinking, msgThinkingDuration])

  const resolvedThoughts = thoughts.length > 0 ? thoughts : (msg.thinking ? [msg.thinking] : [])

  return (
    <AgentResponseBlock
      phase="complete"
      currentThought={null}
      allThoughts={resolvedThoughts}
      thinkingDuration={msgThinkingDuration}
      timeline={resolvedItems}
      displayText={msg.content}
      isStreaming={false}
      onHITLAction={onHITLAction}
      agentName={agentName}
      modelInfo={msgModelInfo}
      timestamp={timestamp}
    />
  )
}

export function AgentChatView({
  conversationId, agent, messages, isLoadingMessages,
  onSendMessage, onCancelStream, onApproveHITL, onDenyHITL, onRetry,
  onConversationUpdated, onStreamComplete,
  onAttach, onRemoveAttachment, attachments, composerDisabled,
  userInitial = 'U',
  parentIsStreaming,
  onReady,
  modelOptions, selectedModelKey, onModelSelect, defaultModelLabel,
}: AgentChatViewProps) {
  // Layer 1: Ingestion
  const { emitter, handleMessage } = useAgentStream()

  // Expose handleMessage to the parent so it can forward WS messages
  useEffect(() => {
    if (onReady) onReady(handleMessage)
  }, [onReady, handleMessage])

  // Layer 2: Coordination — unified timeline adapter replaces useAgentPhase + useThoughtQueue
  const { phase, timeline, thinkingDuration, modelInfo, currentThought, allThoughts, reset: resetPhase, handleThoughtsDrained } = useChatTimelineAdapter(emitter)
  const { displayText, isStreaming, reset: resetRenderer } = useStreamRenderer(emitter)
  const { intent, scrollToBottom, nudgeScroll, containerRef, contentRef } = useScrollIntent()
  const composerObsRef = useRef<ResizeObserver | null>(null)
  const composerElRef = useRef<HTMLDivElement | null>(null)
  const [composerHeight, setComposerHeight] = useState(80) // sensible default

  // Callback ref that attaches a ResizeObserver to the actual composer panel element
  const composerRef = useCallback((node: HTMLDivElement | null) => {
    // Clean up previous observer
    if (composerObsRef.current) {
      composerObsRef.current.disconnect()
      composerObsRef.current = null
    }
    if (!node) return
    // The Composer renders a .chat-composer-shell (position: absolute) as its root.
    // We need to observe the actual panel inside it for the real height.
    const panel = node.querySelector('.chat-composer-shell') ?? node
    composerElRef.current = panel as HTMLDivElement
    const obs = new ResizeObserver(() => {
      const h = (panel as HTMLElement).offsetHeight
      if (h > 0) setComposerHeight(h)
    })
    obs.observe(panel)
    composerObsRef.current = obs
  }, [])

  // Keep scrolled to bottom as streaming tokens arrive and timeline grows
  useEffect(() => {
    if (isStreaming || phase === 'running') nudgeScroll()
  }, [displayText, timeline.length, currentThought, isStreaming, phase, nudgeScroll])

  // Force scroll to bottom when new messages appear (user sends follow-up)
  useEffect(() => {
    scrollToBottom('instant')
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Safety: if the messages array now contains the assistant response that was being streamed,
  // but the phase didn't transition to 'complete' (e.g. agent_done event was missed), force reset.
  const prevMessageCountRef = useRef(messages.length)
  useEffect(() => {
    const prevCount = prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (messages.length > prevCount && phase !== 'idle' && phase !== 'complete' && phase !== 'error') {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg?.role === 'assistant') {
        resetPhase()
        resetRenderer()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- messages tracked via messages.length
  }, [messages.length, phase, resetPhase, resetRenderer])

  // Stale-stream fallback: if phase is 'running' but no timeline updates arrive
  // for 8 seconds (e.g. after page refresh when agent already completed),
  // force-reset so the UI doesn't stay stuck in "Responding..." indefinitely.
  const lastTimelineUpdateRef = useRef(Date.now())
  useEffect(() => { lastTimelineUpdateRef.current = Date.now() }, [timeline.length])
  useEffect(() => {
    if (phase !== 'running') return
    const timer = setInterval(() => {
      if (Date.now() - lastTimelineUpdateRef.current > 8000) {
        resetPhase()
        resetRenderer()
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [phase, resetPhase, resetRenderer])

  // Forward conversation_updated events to parent
  useEffect(() => {
    if (!onConversationUpdated) return
    const handler = (data: { id: string; title?: string }) => onConversationUpdated(data)
    emitter.on('conversation_updated', handler as any)
    return () => { emitter.off('conversation_updated', handler as any) }
  }, [emitter, onConversationUpdated])

  // Forward done events to parent
  useEffect(() => {
    if (!onStreamComplete) return
    const handler = (data: { message_id: string }) => onStreamComplete(data.message_id)
    emitter.on('done', handler as any)
    return () => { emitter.off('done', handler as any) }
  }, [emitter, onStreamComplete])

  // Active HITL item for notification banner and Composer enablement
  const activeHitl = timeline.find((item) => item.type === 'hitl' && item.status === 'awaiting_approval')
  const hasActiveHITL = !!activeHitl
  const isAgentActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error'
  // Show response block if the parent says it's streaming OR the agent phase is active
  const showActiveResponse = isAgentActive || (parentIsStreaming && phase === 'idle')

  // Unified HITL action handler that delegates to the legacy onApproveHITL / onDenyHITL callbacks
  const handleHITLAction = useCallback((hitlId: string, action: 'approve' | 'deny', note?: string) => {
    if (action === 'approve') {
      onApproveHITL?.(hitlId)
    } else {
      onDenyHITL?.(hitlId, note)
    }
  }, [onApproveHITL, onDenyHITL])

  // Filter out trivially empty assistant messages (e.g., just ".", whitespace, or punctuation)
  const visibleMessages = useMemo(() => messages.filter((msg) => {
    if (msg.role === 'user') return true
    const stripped = (msg.content ?? '').replace(/[\s\p{P}]/gu, '')
    if (stripped.length > 0) return true
    // Keep if there are meaningful timeline entries (tool calls or thinking, not just model_selection)
    if (msg.timeline && msg.timeline.length > 0) {
      const hasMeaningful = msg.timeline.some((item: any) =>
        item.type === 'tool_call' || item.type === 'thinking'
      )
      if (hasMeaningful) return true
    }
    return false
  }), [messages])

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <MessageThread containerRef={containerRef} contentRef={contentRef} bottomPadding={Math.max(96, Math.ceil(composerHeight * 1.2))}>
        {visibleMessages.map((msg) => (
          msg.role === 'user' ? (
            <UserMessageCard
              key={msg.id}
              content={msg.content}
              userInitial={userInitial}
              attachments={msg.attachments_processed}
              timestamp={formatDateTime(msg.created_at)}
            />
          ) : (
            <ParsedAgentResponse
              key={msg.id}
              msg={msg}
              onHITLAction={handleHITLAction}
              agentName={agent.name}
              timestamp={formatDateTime(msg.created_at)}
            />
          )
        ))}

        {/* Active agent response (streaming) */}
        {showActiveResponse && (
          <AgentResponseBlock
            phase={phase === 'idle' && parentIsStreaming ? 'running' : phase}
            currentThought={currentThought}
            allThoughts={allThoughts}
            thinkingDuration={thinkingDuration}
            timeline={timeline}
            displayText={displayText}
            isStreaming={isStreaming || (parentIsStreaming && phase === 'idle')}
            onHITLAction={handleHITLAction}
            agentName={agent.name}
            modelInfo={modelInfo}
          />
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="flex gap-2 items-start animate-fade-in">
            <div className="w-7 h-7" />
            <div className="flex-1 bg-destructive/6 border border-destructive/20 rounded-md px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-sm text-foreground">Something went wrong.</span>
              {onRetry && (
                <button onClick={onRetry} className="btn-ghost text-xs ml-auto">Try again</button>
              )}
            </div>
          </div>
        )}
      </MessageThread>

      <ScrollToBottomFAB
        visible={intent === 'free' && showActiveResponse}
        onClick={() => scrollToBottom()}
      />

      {activeHitl && activeHitl.type === 'hitl' && intent === 'free' && (
        <HITLNotificationBanner
          toolName={activeHitl.tool_name}
          onView={() => scrollToBottom()}
        />
      )}

      <div ref={composerRef}>
      <Composer
        onSend={onSendMessage}
        onCancel={onCancelStream}
        onAttach={onAttach}
        onRemoveAttachment={onRemoveAttachment}
        phase={phase}
        isStreaming={isStreaming}
        hasActiveHITL={hasActiveHITL}
        attachments={attachments}
        disabled={composerDisabled}
        modelOptions={modelOptions}
        selectedModelKey={selectedModelKey}
        onModelSelect={onModelSelect}
        defaultModelLabel={defaultModelLabel}
      />
      </div>
    </div>
  )
}
