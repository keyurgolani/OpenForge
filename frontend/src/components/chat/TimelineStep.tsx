import { Brain, Wrench, GitBranch, ShieldAlert } from 'lucide-react'
import { ToolCallCard } from './ToolCallCard'
import { HITLApprovalCard } from './HITLApprovalCard'
import { SubAgentNode } from './SubAgentNode'
import { Timeline } from './Timeline'
import { ThinkingTicker } from './ThinkingTicker'
import type { TimelineItem } from '@/hooks/chat/useAgentPhase'

function getStepType(item: TimelineItem): string {
  if (item.type === 'thinking') return 'thinking'
  if (item.status === 'awaiting_approval') return 'hitl'
  if (item.nested_timeline && item.nested_timeline.length > 0) return 'delegated'
  return 'tool'
}

function StepIcon({ stepType }: { stepType: string }) {
  const cls = 'w-3.5 h-3.5'
  switch (stepType) {
    case 'thinking':
      return <Brain className={`${cls} text-zinc-400`} />
    case 'hitl':
      return <ShieldAlert className={`${cls} text-amber-400`} />
    case 'delegated':
      return <GitBranch className={`${cls} text-purple-400`} />
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

export function TimelineStep({ item, isLast, depth, onApproveHITL, onDenyHITL, currentThought, allThoughts }: TimelineStepProps) {
  const stepType = getStepType(item)
  const isLive = item.type === 'tool_call' ? item.status === 'running' : item.status === 'running'

  return (
    <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--${stepType} ${isLive ? 'chat-workflow-step-live' : ''}`}>
      <div className="chat-timeline-dot">
        <StepIcon stepType={stepType} />
      </div>
      {item.type === 'thinking' ? (
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
