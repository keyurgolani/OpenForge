import { TimelineStep } from './TimelineStep'
import type { TimelineItem } from '@/hooks/chat/useAgentPhase'

interface TimelineProps {
  items: TimelineItem[]
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
  depth?: number
  /** Current thought from the thought queue — passed to the active thinking entry */
  currentThought?: string | null
  /** All collected thoughts — passed to the active thinking entry */
  allThoughts?: string[]
}

export function Timeline({ items, onApproveHITL, onDenyHITL, depth = 0, currentThought, allThoughts }: TimelineProps) {
  if (items.length === 0) return null

  // Find the last thinking entry that's still running (the active one)
  const lastRunningThinkingIdx = items.reduce(
    (acc, item, i) => (item.type === 'thinking' && item.status === 'running' ? i : acc),
    -1,
  )

  return (
    <div className={depth === 0 ? 'chat-workflow-stack' : 'chat-workflow-stack pl-4'}>
      {items.map((item, i) => (
        <TimelineStep
          key={item.type === 'thinking' ? item.id : item.call_id}
          item={item}
          isLast={i === items.length - 1}
          depth={depth}
          onApproveHITL={onApproveHITL}
          onDenyHITL={onDenyHITL}
          currentThought={i === lastRunningThinkingIdx ? currentThought : undefined}
          allThoughts={i === lastRunningThinkingIdx ? allThoughts : undefined}
        />
      ))}
    </div>
  )
}
