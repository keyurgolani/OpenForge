import { useState, useEffect, useRef, type ReactNode } from 'react'
import { ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import type { ToolCallTimelineItem } from '@/hooks/chat/useAgentPhase'

interface SubAgentNodeProps {
  item: ToolCallTimelineItem
  depth: number
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
  /** Render function for nested timeline — breaks circular dependency with Timeline */
  renderTimeline: (props: { items: ToolCallTimelineItem[]; depth: number; onApproveHITL: (id: string) => void; onDenyHITL: (id: string) => void }) => ReactNode
}

export function SubAgentNode({ item, depth, onApproveHITL, onDenyHITL, renderTimeline }: SubAgentNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const userPinnedRef = useRef(false)
  const stepCount = item.nested_timeline?.length ?? 0
  const totalMs = item.duration_ms
  const isRunning = item.status === 'running'
  const isComplete = item.status === 'complete' || item.status === 'approved'
  const isError = item.status === 'error'

  // Auto-open when running (live preview)
  useEffect(() => {
    if (isRunning && !expanded && !userPinnedRef.current) {
      setExpanded(true)
    }
  }, [isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse 1s after completion (skip if user manually expanded)
  useEffect(() => {
    if ((isComplete || isError) && expanded && !userPinnedRef.current) {
      const timer = setTimeout(() => setExpanded(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isComplete, isError, expanded])

  const handleToggle = () => {
    const willOpen = !expanded
    setExpanded(willOpen)
    if (willOpen) {
      userPinnedRef.current = true
    } else {
      userPinnedRef.current = false
    }
  }

  // Extract the agent name from arguments (agent.invoke passes agent_id)
  const agentHint = item.arguments?.agent_id
    ? String(item.arguments.agent_id)
    : item.arguments?.agent_slug
      ? String(item.arguments.agent_slug)
      : ''

  return (
    <div>
      <button
        onClick={handleToggle}
        className={`chat-subsection-toggle ${expanded ? 'chat-subsection-toggle-open' : ''}`}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className="font-mono text-[11px]">{item.tool_name}</span>
        {agentHint && <span className="text-[11px] text-muted-foreground/60 truncate max-w-[200px]">{agentHint}</span>}
        {isRunning && <Loader2 className="h-3 w-3 text-accent animate-spin" />}
        {!isRunning && isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
        {!isRunning && isError && <XCircle className="h-3 w-3 text-red-400" />}
        <span className="text-[10px] text-muted-foreground/70 ml-auto">
          {stepCount} steps{totalMs ? `, ${(totalMs / 1000).toFixed(1)}s` : ''}
        </span>
      </button>
      <div className={`chat-collapse ${expanded ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
        <div className="chat-collapse-inner">
          {item.nested_timeline && item.nested_timeline.length > 0 && (
            <div className="chat-step-detail-card !p-0 !border-0 !bg-transparent">
              {renderTimeline({ items: item.nested_timeline as ToolCallTimelineItem[], depth: depth + 1, onApproveHITL, onDenyHITL })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
