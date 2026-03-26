import { useEffect, useRef, useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAgentStream } from '@/hooks/chat/useAgentStream'
import { useAgentPhase } from '@/hooks/chat/useAgentPhase'
import { useStreamRenderer } from '@/hooks/chat/useStreamRenderer'
import { useThoughtQueue } from '@/hooks/chat/useThoughtQueue'
import { useScrollIntent } from '@/hooks/chat/useScrollIntent'
import { MessageThread } from './MessageThread'
import { UserMessageCard } from './UserMessageCard'
import { AgentResponseBlock } from './AgentResponseBlock'
import { Composer } from './Composer'
import type { ModelPickerOption } from './ComposerModelPicker'
import { ScrollToBottomFAB } from './ScrollToBottomFAB'
import { HITLNotificationBanner } from './HITLNotificationBanner'
import type { TimelineItem, ToolCallTimelineItem } from '@/hooks/chat/useAgentPhase'

/**
 * Parse raw timeline from the API (which may contain model_selection, thinking,
 * and tool_call entries) into structured data the UI components expect.
 * Returns a unified TimelineItem array with thinking entries inline.
 */
function parseMessageTimeline(rawTimeline: unknown[]): {
  items: TimelineItem[]
  thoughts: string[]
  thinkingDuration: number | null
} {
  const items: TimelineItem[] = []
  const thoughts: string[] = []
  let thinkingDuration: number | null = null
  let thinkingIdx = 0

  for (const raw of rawTimeline) {
    const item = raw as Record<string, unknown>
    if (item.type === 'tool_call') {
      items.push({
        type: 'tool_call',
        call_id: (item.call_id as string) ?? '',
        tool_name: (item.tool_name as string) ?? '',
        arguments: (item.arguments as Record<string, unknown>) ?? {},
        status: item.success === true ? 'complete'
          : item.success === false ? 'error'
          : item.hitl ? 'awaiting_approval'
          : (item.output !== undefined || item.error) ? 'complete'
          : 'complete',
        hitl: (item.hitl as ToolCallTimelineItem['hitl']) ?? null,
        success: (item.success as boolean | null) ?? null,
        output: item.output,
        error: (item.error as string | null) ?? null,
        duration_ms: (item.duration_ms as number | null) ?? null,
        nested_timeline: (item.nested_timeline as TimelineItem[] | null) ?? null,
      })
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
    }
    // model_selection items are informational — not rendered in the timeline
  }

  return { items, thoughts, thinkingDuration }
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string | null
  timeline?: TimelineItem[] | null
  created_at: string
  attachments_processed?: { filename: string; content_type: string }[]
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
  attachments?: { id: string; filename: string; content_type: string; size: number }[]
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
function ParsedAgentResponse({ msg, onApproveHITL, onDenyHITL }: {
  msg: Message
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
}) {
  const { items, thoughts, thinkingDuration: msgThinkingDuration } = useMemo(
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
      onApproveHITL={onApproveHITL}
      onDenyHITL={onDenyHITL}
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

  // Layer 2: Coordination
  const { phase, timeline, thinkingDuration, reset: resetPhase, handleThoughtsDrained } = useAgentPhase(emitter)
  const { displayText, isStreaming, reset: resetRenderer } = useStreamRenderer(emitter)
  const { currentThought, allThoughts } = useThoughtQueue(emitter, handleThoughtsDrained)
  const { intent, scrollToBottom, containerRef, contentRef } = useScrollIntent()

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
  }, [messages.length, phase, resetPhase, resetRenderer])

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

  // Active HITL item for notification banner
  const activeHitl = timeline.find((item) => item.type === 'tool_call' && item.status === 'awaiting_approval')
  const isAgentActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error'
  // Show response block if the parent says it's streaming OR the agent phase is active
  const showActiveResponse = isAgentActive || (parentIsStreaming && phase === 'idle')

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
      <MessageThread containerRef={containerRef} contentRef={contentRef}>
        {visibleMessages.map((msg) => (
          msg.role === 'user' ? (
            <UserMessageCard
              key={msg.id}
              content={msg.content}
              userInitial={userInitial}
              attachments={msg.attachments_processed}
            />
          ) : (
            <ParsedAgentResponse
              key={msg.id}
              msg={msg}
              onApproveHITL={onApproveHITL ?? (() => {})}
              onDenyHITL={onDenyHITL ?? (() => {})}
            />
          )
        ))}

        {/* Active agent response (streaming) */}
        {showActiveResponse && (
          <AgentResponseBlock
            phase={phase === 'idle' && parentIsStreaming ? 'thinking' : phase}
            currentThought={currentThought}
            allThoughts={allThoughts}
            thinkingDuration={thinkingDuration}
            timeline={timeline}
            displayText={displayText}
            isStreaming={isStreaming || (parentIsStreaming && phase === 'idle')}
            onApproveHITL={onApproveHITL ?? (() => {})}
            onDenyHITL={onDenyHITL ?? (() => {})}
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

      {activeHitl && activeHitl.type === 'tool_call' && intent === 'free' && (
        <HITLNotificationBanner
          toolName={activeHitl.tool_name}
          onView={() => scrollToBottom()}
        />
      )}

      <Composer
        onSend={onSendMessage}
        onCancel={onCancelStream}
        onAttach={onAttach}
        onRemoveAttachment={onRemoveAttachment}
        phase={phase}
        isStreaming={isStreaming}
        attachments={attachments}
        disabled={composerDisabled}
        modelOptions={modelOptions}
        selectedModelKey={selectedModelKey}
        onModelSelect={onModelSelect}
        defaultModelLabel={defaultModelLabel}
      />
    </div>
  )
}
