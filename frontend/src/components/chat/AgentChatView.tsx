import { useEffect } from 'react'
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
import { ScrollToBottomFAB } from './ScrollToBottomFAB'
import { HITLNotificationBanner } from './HITLNotificationBanner'
import type { TimelineItem } from '@/hooks/chat/useAgentPhase'

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
  onSendMessage: (content: string) => void
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
  /** Called once on mount with the handleMessage function so the parent can forward WS messages. */
  onReady?: (handleMessage: (msg: { type: string; data?: unknown; conversation_id?: string }) => void) => void
}

export function AgentChatView({
  conversationId, agent, messages, isLoadingMessages,
  onSendMessage, onCancelStream, onApproveHITL, onDenyHITL, onRetry,
  onConversationUpdated, onStreamComplete,
  onAttach, onRemoveAttachment, attachments, composerDisabled,
  userInitial = 'U',
  onReady,
}: AgentChatViewProps) {
  // Layer 1: Ingestion
  const { emitter, handleMessage } = useAgentStream()

  // Expose handleMessage to the parent so it can forward WS messages
  useEffect(() => {
    if (onReady) onReady(handleMessage)
  }, [onReady, handleMessage])

  // Layer 2: Coordination
  const { phase, timeline, thinkingDuration, handleThoughtsDrained } = useAgentPhase(emitter)
  const { displayText, isStreaming } = useStreamRenderer(emitter)
  const { currentThought, allThoughts } = useThoughtQueue(emitter, handleThoughtsDrained)
  const { intent, scrollToBottom, containerRef, contentRef } = useScrollIntent()

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
  const activeHitl = timeline.find((item) => item.status === 'awaiting_approval')
  const isAgentActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error'

  return (
    <div className="flex flex-col h-full relative">
      <MessageThread containerRef={containerRef} contentRef={contentRef}>
        {messages.map((msg) => (
          msg.role === 'user' ? (
            <UserMessageCard
              key={msg.id}
              content={msg.content}
              userInitial={userInitial}
              attachments={msg.attachments_processed}
            />
          ) : (
            <AgentResponseBlock
              key={msg.id}
              phase="complete"
              currentThought={null}
              allThoughts={[]}
              thinkingDuration={null}
              timeline={msg.timeline ?? []}
              displayText={msg.content}
              isStreaming={false}
              onApproveHITL={onApproveHITL ?? (() => {})}
              onDenyHITL={onDenyHITL ?? (() => {})}
            />
          )
        ))}

        {/* Active agent response (streaming) */}
        {isAgentActive && (
          <AgentResponseBlock
            phase={phase}
            currentThought={currentThought}
            allThoughts={allThoughts}
            thinkingDuration={thinkingDuration}
            timeline={timeline}
            displayText={displayText}
            isStreaming={isStreaming}
            onApproveHITL={onApproveHITL ?? (() => {})}
            onDenyHITL={onDenyHITL ?? (() => {})}
          />
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="flex gap-3 items-start animate-fade-in">
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
        visible={intent === 'free' && isAgentActive}
        onClick={() => scrollToBottom()}
      />

      {activeHitl && intent === 'free' && (
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
      />
    </div>
  )
}
