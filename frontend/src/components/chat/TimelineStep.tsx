import { Check, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { ToolCallCard } from './ToolCallCard'
import { HITLApprovalCard } from './HITLApprovalCard'
import { SubAgentNode } from './SubAgentNode'
import type { TimelineItem } from '@/hooks/chat/useAgentPhase'

function StatusDot({ status }: { status: string }) {
  const base = 'w-2.5 h-2.5 rounded-full flex items-center justify-center flex-shrink-0'
  switch (status) {
    case 'running':
      return <div className={`${base} bg-accent shadow-[0_0_8px_hsla(192,100%,66%,0.5)] animate-pulse`} />
    case 'complete': case 'approved':
      return (
        <motion.div
          className={`${base} bg-success shadow-[0_0_6px_hsla(142,71%,45%,0.4)]`}
          initial={{ scale: 1 }} animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <Check className="w-[7px] h-[7px] text-white" strokeWidth={3} />
        </motion.div>
      )
    case 'error':
      return <div className={`${base} bg-destructive`}><X className="w-[7px] h-[7px] text-white" strokeWidth={3} /></div>
    case 'awaiting_approval':
      return <div className={`${base} bg-warning shadow-[0_0_8px_hsla(38,92%,50%,0.4)] animate-pulse`} />
    default:
      return <div className={`${base} border border-border`} />
  }
}

interface TimelineStepProps {
  item: TimelineItem
  isLast: boolean
  depth: number
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
}

export function TimelineStep({ item, isLast, depth, onApproveHITL, onDenyHITL }: TimelineStepProps) {
  const railWidth = depth === 0 ? 'w-[2px]' : 'w-px'
  const railColor = depth === 0 ? 'bg-accent/20' : 'bg-accent/10'

  return (
    <motion.div
      className="flex gap-0"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="flex flex-col items-center w-5 flex-shrink-0">
        <StatusDot status={item.status} />
        {!isLast && <div className={`${railWidth} flex-1 ${railColor}`} />}
      </div>
      <div className="flex-1 ml-2.5 mb-2.5">
        {item.status === 'awaiting_approval' && item.hitl ? (
          <HITLApprovalCard
            toolName={item.tool_name}
            actionSummary={item.hitl.action_summary}
            status={item.hitl.status as 'pending' | 'approved' | 'denied' | 'timed_out'}
            onApprove={() => onApproveHITL(item.hitl!.hitl_id)}
            onDeny={() => onDenyHITL(item.hitl!.hitl_id)}
          />
        ) : item.nested_timeline && item.nested_timeline.length > 0 && depth < 3 ? (
          <SubAgentNode item={item} depth={depth} onApproveHITL={onApproveHITL} onDenyHITL={onDenyHITL} />
        ) : (
          <ToolCallCard
            toolName={item.tool_name}
            arguments={item.arguments}
            status={item.status}
            success={item.success}
            output={item.output}
            error={item.error}
            durationMs={item.duration_ms}
          />
        )}
      </div>
    </motion.div>
  )
}
