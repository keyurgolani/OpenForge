import { TimelineStep } from './TimelineStep'
import type { TimelineItem } from '@/hooks/chat/useAgentPhase'

interface TimelineProps {
  items: TimelineItem[]
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
  depth?: number
}

export function Timeline({ items, onApproveHITL, onDenyHITL, depth = 0 }: TimelineProps) {
  if (items.length === 0) return null
  return (
    <div className={`flex flex-col gap-0 ${depth > 0 ? 'pl-6' : 'pl-1'}`}>
      {items.map((item, i) => (
        <TimelineStep
          key={item.call_id}
          item={item}
          isLast={i === items.length - 1}
          depth={depth}
          onApproveHITL={onApproveHITL}
          onDenyHITL={onDenyHITL}
        />
      ))}
    </div>
  )
}
