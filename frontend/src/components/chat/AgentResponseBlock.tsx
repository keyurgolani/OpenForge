import { Bot } from 'lucide-react'
import { Timeline } from './Timeline'
import { StreamedResponse } from './StreamedResponse'
import type { AgentPhase, TimelineItem } from '@/hooks/chat/useAgentPhase'

interface AgentResponseBlockProps {
  phase: AgentPhase
  currentThought: string | null
  allThoughts: string[]
  thinkingDuration: number | null
  timeline: TimelineItem[]
  displayText: string
  isStreaming: boolean
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
}

export function AgentResponseBlock({
  phase, currentThought, allThoughts, thinkingDuration,
  timeline, displayText, isStreaming,
  onApproveHITL, onDenyHITL,
}: AgentResponseBlockProps) {
  const isActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error'

  return (
    <div className="flex gap-2 items-start animate-fade-in">
      <div className="chat-avatar w-7 h-7 rounded-full bg-muted/45 border border-border/70 flex-shrink-0 flex items-center justify-center">
        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="max-w-[90%] space-y-2 min-w-0">
        {isActive && (
          <div className="agent-generation-pill">
            <span className="agent-generation-orb" />
            <span>Responding…</span>
          </div>
        )}
        {timeline.length > 0 && (
          <Timeline
            items={timeline}
            onApproveHITL={onApproveHITL}
            onDenyHITL={onDenyHITL}
            currentThought={currentThought}
            allThoughts={allThoughts}
          />
        )}
        {(displayText || (!isActive)) && (
          <div className="chat-bubble-assistant">
            <StreamedResponse text={displayText} isStreaming={isStreaming} />
          </div>
        )}
      </div>
    </div>
  )
}
