import { useState } from 'react'
import { GitBranch, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Timeline } from './Timeline'
import type { TimelineItem } from '@/hooks/chat/useAgentPhase'

interface SubAgentNodeProps {
  item: TimelineItem
  depth: number
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
}

export function SubAgentNode({ item, depth, onApproveHITL, onDenyHITL }: SubAgentNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const stepCount = item.nested_timeline?.length ?? 0
  const totalMs = item.duration_ms

  return (
    <div className="bg-card border border-border rounded-md px-3.5 py-2.5 shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.04)]">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left">
        <GitBranch className="w-[13px] h-[13px] text-accent" />
        <span className="text-[13px] font-mono text-accent/85">{item.tool_name}</span>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {stepCount} steps{totalMs ? `, ${(totalMs / 1000).toFixed(1)}s` : ''}
        </span>
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {expanded && item.nested_timeline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden mt-2"
          >
            <Timeline items={item.nested_timeline} depth={depth + 1} onApproveHITL={onApproveHITL} onDenyHITL={onDenyHITL} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
