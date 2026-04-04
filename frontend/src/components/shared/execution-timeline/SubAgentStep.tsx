import { useState, useEffect, useRef } from 'react'
import { Bot, ChevronRight, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { ExecutionTimeline } from './ExecutionTimeline'
import type { SubAgentTimelineItem, TimelineItem } from '@/types/timeline'

interface SubAgentStepProps {
  item: SubAgentTimelineItem
  depth: number
  onHITLAction?: (hitlId: string, action: 'approve' | 'deny', note?: string) => void
  currentThought?: string | null
  allThoughts?: string[]
}

/** Count only tool_call items in children */
function countToolCalls(children: TimelineItem[] | null | undefined): number {
  if (!children || !Array.isArray(children)) return 0
  return children.filter((c) => c.type === 'tool_call').length
}

export function SubAgentStep({ item, depth, onHITLAction, currentThought, allThoughts }: SubAgentStepProps) {
  const [expanded, setExpanded] = useState(false)
  const userPinnedRef = useRef(false)
  const toolCallCount = countToolCalls(item.children)
  const totalMs = item.duration_ms
  const isRunning = item.status === 'running'
  const isComplete = item.status === 'complete' || item.status === 'approved'
  const isError = item.status === 'error'

  // Auto-open when running
  useEffect(() => {
    if (isRunning && !expanded && !userPinnedRef.current) {
      setExpanded(true)
    }
  }, [isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse 1.5s after completion
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

  const agentName = item.agent_name || 'Agent'

  // Extract instruction from arguments
  const instruction = item.arguments?.instruction
    ? String(item.arguments.instruction)
    : null

  // Format duration
  const durationStr = totalMs != null ? `${(totalMs / 1000).toFixed(1)}s` : null

  // Detect likely timeout
  const likelyTimedOut = (isComplete || isError) && toolCallCount === 0 && totalMs != null && totalMs > 60_000

  return (
    <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--delegated ${isRunning ? 'chat-workflow-step-live' : ''}`}>
      <div className="chat-timeline-dot">
        <Bot className="w-3.5 h-3.5 text-purple-400" />
      </div>
      <div>
        <button
          onClick={handleToggle}
          className={`chat-agent-invoke-toggle ${expanded ? 'chat-agent-invoke-toggle-open' : ''}`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <ChevronRight className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            <Bot className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />
            <span className="font-medium text-[11px] text-foreground/80 truncate">
              {agentName}
            </span>
            {isRunning && <Loader2 className="h-3 w-3 text-accent animate-spin flex-shrink-0" />}
            {!isRunning && likelyTimedOut && <Clock className="h-3 w-3 text-amber-400 flex-shrink-0" />}
            {!isRunning && isComplete && !likelyTimedOut && <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
            {!isRunning && isError && !likelyTimedOut && <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
          </div>
          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 whitespace-nowrap ml-2">
            {isRunning ? (
              toolCallCount > 0 ? `${toolCallCount} tool calls` : 'executing…'
            ) : likelyTimedOut ? (
              `timed out${durationStr ? ` (${durationStr})` : ''}`
            ) : (
              <>
                {toolCallCount > 0 && `${toolCallCount} tool calls`}
                {toolCallCount > 0 && durationStr && ' · '}
                {durationStr}
              </>
            )}
          </span>
        </button>

        {/* Instruction preview (shown below toggle when collapsed) */}
        {!expanded && instruction && (
          <div className="chat-agent-invoke-instruction">
            {instruction}
          </div>
        )}

        <div className={`chat-collapse ${expanded ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
          <div className="chat-collapse-inner chat-agent-invoke-detail">
            {/* Instruction (shown inside when expanded) */}
            {expanded && instruction && (
              <div className="chat-agent-invoke-instruction-expanded">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-medium">Task</span>
                <p className="text-[11px] text-foreground/65 leading-relaxed mt-0.5">{instruction}</p>
              </div>
            )}

            {item.children && item.children.length > 0 ? (
              <div className="chat-step-detail-card !p-0 !border-0 !bg-transparent">
                <ExecutionTimeline
                  items={item.children}
                  phase={isRunning ? 'running' : isComplete ? 'complete' : isError ? 'error' : 'idle'}
                  depth={depth + 1}
                  onHITLAction={onHITLAction}
                />
              </div>
            ) : isRunning ? (
              <div className="chat-step-detail-card !p-0 !border-0 !bg-transparent pl-4">
                <span className="text-[11px] text-muted-foreground/50 animate-pulse">Agent executing…</span>
              </div>
            ) : null}

            {/* Output preview for completed calls */}
            {!isRunning && isComplete && !likelyTimedOut && item.output && typeof item.output === 'string' && item.output.length > 0 && !expanded && (
              <div className="px-3 py-1.5 text-[11px] text-foreground/50 truncate">
                {item.output.slice(0, 100)}…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
