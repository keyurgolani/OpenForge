import { Brain } from 'lucide-react'
import { ThinkingTicker } from '@/components/chat/ThinkingTicker'
import type { ThinkingTimelineItem } from '@/types/timeline'

interface ThinkingStepProps {
  item: ThinkingTimelineItem
  currentThought?: string | null
  allThoughts?: string[]
}

export function ThinkingStep({ item, currentThought, allThoughts }: ThinkingStepProps) {
  const isActive = item.status === 'running'

  return (
    <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--thinking ${isActive ? 'chat-workflow-step-live' : ''}`}>
      <div className="chat-timeline-dot">
        <Brain className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <ThinkingTicker
        currentThought={isActive ? (currentThought ?? null) : null}
        isActive={isActive}
        thinkingDuration={item.duration_ms}
        allThoughts={isActive ? (allThoughts ?? item.sentences) : item.sentences}
      />
    </div>
  )
}
