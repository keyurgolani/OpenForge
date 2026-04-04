import { Fragment } from 'react'
import type { TimelineItem, ExecutionPhase } from '@/types/timeline'
import { ThinkingStep } from './ThinkingStep'
import { ToolCallStep } from './ToolCallStep'
import { HITLStep } from './HITLStep'
import { SubAgentStep } from './SubAgentStep'
import { IntermediateResponseStep } from './IntermediateResponseStep'
import { NodeExecutionStep } from './NodeExecutionStep'
import { SinkStep } from './SinkStep'
import { CycleStep } from './CycleStep'

interface ExecutionTimelineProps {
  items: TimelineItem[]
  phase: ExecutionPhase
  depth?: number
  connected?: boolean
  /** When true, renders items as a React Fragment without a wrapper div.
   *  Useful when embedding inside an existing chat-workflow-stack. */
  inline?: boolean
  currentThought?: string | null
  allThoughts?: string[]
  onHITLAction?: (hitlId: string, action: 'approve' | 'deny', note?: string) => void
  maxDepth?: number
}

export function ExecutionTimeline({ items, phase, depth = 0, connected, inline, currentThought, allThoughts, onHITLAction, maxDepth = 4 }: ExecutionTimelineProps) {
  if (items.length === 0) return null
  if (depth > maxDepth) return null

  // Find the last running thinking entry to pass currentThought only to it
  const lastRunningThinkingIdx = items.reduce(
    (acc, item, i) => (item.type === 'thinking' && item.status === 'running' ? i : acc),
    -1,
  )

  const content = items.map((item, i) => {
    switch (item.type) {
      case 'thinking':
        return (
          <ThinkingStep
            key={item.id}
            item={item}
            currentThought={i === lastRunningThinkingIdx ? currentThought : undefined}
            allThoughts={i === lastRunningThinkingIdx ? allThoughts : undefined}
          />
        )
      case 'tool_call':
        return <ToolCallStep key={item.call_id} item={item} />
      case 'hitl':
        return <HITLStep key={item.hitl_id} item={item} onAction={onHITLAction} />
      case 'subagent':
        return (
          <SubAgentStep
            key={item.call_id}
            item={item}
            depth={depth}
            onHITLAction={onHITLAction}
          />
        )
      case 'intermediate_response':
        return <IntermediateResponseStep key={item.id} item={item} />
      case 'node_execution':
        return (
          <NodeExecutionStep
            key={item.id}
            item={item}
            depth={depth}
            onHITLAction={onHITLAction}
          />
        )
      case 'sink_execution':
        return <SinkStep key={item.id} item={item} />
      case 'cycle':
        return (
          <CycleStep
            key={item.id}
            item={item}
            depth={depth}
            onHITLAction={onHITLAction}
          />
        )
      default:
        return null
    }
  })

  if (inline) return <Fragment>{content}</Fragment>

  return (
    <div className={depth === 0 ? 'chat-workflow-stack' : 'chat-workflow-stack pl-4'}>
      {content}
    </div>
  )
}
