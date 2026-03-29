import { useEffect, useRef, useState } from 'react'
import { Brain, Wrench, GitBranch, ShieldAlert, MessageSquare, ChevronRight } from 'lucide-react'
import { ToolCallCard } from './ToolCallCard'
import { HITLApprovalCard } from './HITLApprovalCard'
import { SubAgentNode } from './SubAgentNode'
import { Timeline } from './Timeline'
import { ThinkingTicker } from './ThinkingTicker'
import type { TimelineItem } from '@/hooks/chat/useAgentPhase'

function getStepType(item: TimelineItem): string {
  if (item.type === 'thinking') return 'thinking'
  if (item.type === 'intermediate_response') return 'intermediate'
  if (item.type === 'tool_call' && item.status === 'awaiting_approval') return 'hitl'
  if (item.type === 'tool_call' && item.nested_timeline && item.nested_timeline.length > 0) return 'delegated'
  return 'tool'
}

function StepIcon({ stepType }: { stepType: string }) {
  const cls = 'w-3.5 h-3.5'
  switch (stepType) {
    case 'thinking':
      return <Brain className={`${cls} text-muted-foreground`} />
    case 'hitl':
      return <ShieldAlert className={`${cls} text-amber-400`} />
    case 'delegated':
      return <GitBranch className={`${cls} text-purple-400`} />
    case 'intermediate':
      return <MessageSquare className={`${cls} text-blue-400/70`} />
    default:
      return <Wrench className={`${cls} text-accent/70`} />
  }
}

interface TimelineStepProps {
  item: TimelineItem
  isLast: boolean
  depth: number
  onApproveHITL: (hitlId: string) => void
  onDenyHITL: (hitlId: string) => void
  /** For thinking items: the current thought from the thought queue (only for the active/last thinking entry) */
  currentThought?: string | null
  /** For thinking items: all collected thoughts */
  allThoughts?: string[]
}

function IntermediateResponseCard({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Auto-collapse after 1.5 seconds
    timerRef.current = setTimeout(() => setCollapsed(true), 1500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed(prev => !prev)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors py-0.5"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        <span>Intermediate response</span>
      </button>
      {!collapsed && (
        <div className="text-sm text-foreground/75 leading-relaxed mt-1 pl-1 border-l-2 border-border/25 ml-1.5">
          <div className="pl-3 py-1">
            {content.length > 300 ? content.slice(0, 300) + '…' : content}
          </div>
        </div>
      )}
    </div>
  )
}

export function TimelineStep({ item, isLast, depth, onApproveHITL, onDenyHITL, currentThought, allThoughts }: TimelineStepProps) {
  const stepType = getStepType(item)
  const isLive = item.type === 'tool_call' ? item.status === 'running' : (item.type === 'thinking' ? item.status === 'running' : false)

  return (
    <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--${stepType} ${isLive ? 'chat-workflow-step-live' : ''}`}>
      <div className="chat-timeline-dot">
        <StepIcon stepType={stepType} />
      </div>
      {item.type === 'intermediate_response' ? (
        <IntermediateResponseCard content={item.content} />
      ) : item.type === 'thinking' ? (
        <ThinkingTicker
          currentThought={item.status === 'running' ? currentThought ?? null : null}
          isActive={item.status === 'running'}
          thinkingDuration={item.duration_ms}
          allThoughts={item.status === 'running' ? (allThoughts ?? item.sentences) : item.sentences}
        />
      ) : item.status === 'awaiting_approval' && item.hitl ? (
        <HITLApprovalCard
          toolName={item.tool_name}
          actionSummary={item.hitl.action_summary}
          status={item.hitl.status as 'pending' | 'approved' | 'denied' | 'timed_out'}
          onApprove={() => onApproveHITL(item.hitl!.hitl_id)}
          onDeny={() => onDenyHITL(item.hitl!.hitl_id)}
        />
      ) : item.type === 'tool_call' && item.nested_timeline && item.nested_timeline.length > 0 && depth < 3 ? (
        <SubAgentNode
          item={item} depth={depth} onApproveHITL={onApproveHITL} onDenyHITL={onDenyHITL}
          renderTimeline={(props) => <Timeline items={props.items} depth={props.depth} onApproveHITL={props.onApproveHITL} onDenyHITL={props.onDenyHITL} />}
        />
      ) : item.type === 'tool_call' ? (
        <ToolCallCard
          toolName={item.tool_name}
          arguments={item.arguments}
          status={item.status}
          success={item.success}
          output={item.output}
          error={item.error}
          durationMs={item.duration_ms}
        />
      ) : null}
    </div>
  )
}
