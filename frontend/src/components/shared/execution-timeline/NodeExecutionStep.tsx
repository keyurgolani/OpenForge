import { useState, useEffect, useRef } from 'react'
import { Bot, Download, ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { ExecutionTimeline } from './ExecutionTimeline'
import type { NodeExecutionTimelineItem } from '@/types/timeline'

interface NodeExecutionStepProps {
  item: NodeExecutionTimelineItem
  depth: number
  onHITLAction?: (hitlId: string, action: 'approve' | 'deny', note?: string) => void
  currentThought?: string | null
  allThoughts?: string[]
}

export function NodeExecutionStep({ item, depth, onHITLAction }: NodeExecutionStepProps) {
  const [expanded, setExpanded] = useState(false)
  const userPinnedRef = useRef(false)
  const isRunning = item.status === 'running'
  const isComplete = item.status === 'complete'
  const isError = item.status === 'error'

  const NodeIcon = item.node_type === 'sink' ? Download : Bot

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

  // Format duration
  const durationStr = item.duration_ms != null ? `${(item.duration_ms / 1000).toFixed(1)}s` : null

  return (
    <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--delegated ${isRunning ? 'chat-workflow-step-live' : ''}`}>
      <div className="chat-timeline-dot">
        <NodeIcon className="w-3.5 h-3.5 text-purple-400" />
      </div>
      <div>
        <button
          onClick={handleToggle}
          className={`chat-agent-invoke-toggle ${expanded ? 'chat-agent-invoke-toggle-open' : ''}`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <ChevronRight className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            <NodeIcon className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />
            <span className="font-medium text-[11px] text-foreground/80 truncate">
              {item.node_key}
            </span>
            <span className="text-[10px] text-muted-foreground/50">{item.node_type}</span>
            {isRunning && <Loader2 className="h-3 w-3 text-accent animate-spin flex-shrink-0" />}
            {!isRunning && isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
            {!isRunning && isError && <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
          </div>
          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 whitespace-nowrap ml-2">
            {isRunning ? 'executing…' : durationStr ?? ''}
          </span>
        </button>

        <div className={`chat-collapse ${expanded ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
          <div className="chat-collapse-inner chat-agent-invoke-detail">
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
                <span className="text-[11px] text-muted-foreground/50 animate-pulse">Node executing…</span>
              </div>
            ) : null}

            {/* Output preview for completed nodes */}
            {isComplete && item.output_preview && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wide text-emerald-400/55 font-medium mb-1">Output</div>
                <pre className="text-[11px] text-foreground/60 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto font-mono">
                  {item.output_preview}
                </pre>
              </div>
            )}

            {/* Error display */}
            {isError && item.error && (
              <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-xs text-red-400">
                {item.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
