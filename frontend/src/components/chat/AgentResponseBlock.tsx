import { Layers } from 'lucide-react'
import { ThinkingTicker } from './ThinkingTicker'
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
  const isThinking = phase === 'thinking' || phase === 'draining_thoughts'
  const showThinkingSummary = !isThinking && allThoughts.length > 0

  return (
    <div className="flex gap-3 items-start animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/20 to-purple-500/15 border border-accent/15 flex-shrink-0 flex items-center justify-center shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.08)]">
        <Layers className="w-3.5 h-3.5 text-accent" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {(isThinking || showThinkingSummary) && (
          <ThinkingTicker
            currentThought={currentThought}
            isActive={isThinking}
            thinkingDuration={thinkingDuration}
            allThoughts={allThoughts}
          />
        )}
        {timeline.length > 0 && (
          <Timeline items={timeline} onApproveHITL={onApproveHITL} onDenyHITL={onDenyHITL} />
        )}
        <StreamedResponse text={displayText} isStreaming={isStreaming} />
      </div>
    </div>
  )
}
