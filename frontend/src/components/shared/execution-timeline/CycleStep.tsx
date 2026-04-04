import { useState, useEffect, useRef, useMemo } from 'react'
import { RefreshCw, ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { ExecutionTimeline } from './ExecutionTimeline'
import type { CycleTimelineItem } from '@/types/timeline'

interface CycleStepProps {
  item: CycleTimelineItem
  depth: number
  onHITLAction?: (hitlId: string, action: 'approve' | 'deny', note?: string) => void
  currentThought?: string | null
  allThoughts?: string[]
}

const OODA_PHASES = ['perceive', 'plan', 'act', 'evaluate', 'reflect'] as const

export function CycleStep({ item, depth, onHITLAction }: CycleStepProps) {
  const [expanded, setExpanded] = useState(false)
  const [activePhase, setActivePhase] = useState<string>('act')
  const userPinnedRef = useRef(false)
  const isRunning = item.status === 'running'
  const isComplete = item.status === 'complete'
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

  // Format duration
  const durationStr = item.duration_ms != null ? `${(item.duration_ms / 1000).toFixed(1)}s` : null

  // Phase summaries
  const phases = item.phase_summaries ?? {}
  const hasStructuredPhases = Object.keys(phases).length > 0

  const activePhaseText = useMemo(() => {
    if (!hasStructuredPhases) return null
    const val = phases[activePhase]
    if (!val) return null
    return typeof val === 'string' ? val : JSON.stringify(val, null, 2)
  }, [hasStructuredPhases, phases, activePhase])

  const hasCompletionData = hasStructuredPhases
    || (item.evaluation_scores && Object.keys(item.evaluation_scores).length > 0)
    || (item.actions_log && item.actions_log.length > 0)
    || item.next_cycle_reason

  return (
    <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--response ${isRunning ? 'chat-workflow-step-live' : ''}`}>
      <div className="chat-timeline-dot">
        <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
      </div>
      <div>
        <button
          onClick={handleToggle}
          className={`chat-agent-invoke-toggle ${expanded ? 'chat-agent-invoke-toggle-open' : ''}`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <ChevronRight className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            <RefreshCw className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
            <span className="font-medium text-[11px] text-foreground/80">
              Cycle {item.cycle_number}
            </span>
            {item.ooda_phase && (
              <span className="text-[9px] text-muted-foreground/70 border border-border/25 bg-background/50 rounded-md px-1.5 py-0.5 capitalize">
                {item.ooda_phase}
              </span>
            )}
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
            {/* Nested agent timeline */}
            {item.children && item.children.length > 0 && (
              <div className="chat-step-detail-card !p-0 !border-0 !bg-transparent">
                <ExecutionTimeline
                  items={item.children}
                  phase={isRunning ? 'running' : isComplete ? 'complete' : isError ? 'error' : 'idle'}
                  depth={depth + 1}
                  onHITLAction={onHITLAction}
                />
              </div>
            )}

            {/* Completion data */}
            {hasCompletionData && (
              <div className="space-y-2.5 mt-2">
                {/* Score bars */}
                {item.evaluation_scores && Object.keys(item.evaluation_scores).length > 0 && (
                  <div className="space-y-1.5">
                    {Object.entries(item.evaluation_scores).map(([key, value]) => {
                      if (typeof value !== 'number') return null
                      const pct = Math.min(100, Math.max(0, value * 100))
                      const barColor = value >= 0.7
                        ? 'bg-emerald-500'
                        : value >= 0.4
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground/70 truncate w-24 flex-shrink-0">{key}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-foreground font-medium w-7 text-right flex-shrink-0">{value}</span>
                        </div>
                      )
                    })}
                    {item.ratchet_passed != null && (
                      <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${
                        item.ratchet_passed
                          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                          : 'border-red-500/25 bg-red-500/10 text-red-400'
                      }`}>
                        Ratchet: {item.ratchet_passed ? 'Passed' : 'Failed'}
                      </span>
                    )}
                  </div>
                )}

                {/* OODA phase pills (structured only) */}
                {hasStructuredPhases && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      {OODA_PHASES.map((phase) => {
                        const hasContent = !!phases[phase]
                        const isActive = activePhase === phase
                        return (
                          <button
                            key={phase}
                            onClick={() => setActivePhase(phase)}
                            disabled={!hasContent}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                              isActive
                                ? 'bg-accent/20 text-accent border border-accent/40'
                                : hasContent
                                  ? 'bg-muted/30 text-muted-foreground/80 border border-border/25 hover:text-foreground hover:border-border/50'
                                  : 'bg-muted/10 text-muted-foreground/30 border border-border/15 cursor-default'
                            }`}
                          >
                            {phase}
                          </button>
                        )
                      })}
                    </div>
                    {activePhaseText && (
                      <div className="rounded-lg border border-border/25 bg-card/20 px-2.5 py-2 text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap max-h-[140px] overflow-y-auto">
                        {activePhaseText}
                      </div>
                    )}
                  </div>
                )}

                {/* Key Actions */}
                {item.actions_log && item.actions_log.length > 0 && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium mb-1">Actions</h4>
                    <ol className="space-y-0.5">
                      {item.actions_log.map((action, i) => {
                        const label = typeof action === 'string'
                          ? action
                          : typeof action === 'object' && action !== null
                            ? String((action as Record<string, unknown>).action ?? (action as Record<string, unknown>).description ?? JSON.stringify(action))
                            : String(action)
                        return (
                          <li key={i} className="text-[11px] text-muted-foreground/80 flex gap-1.5 leading-snug">
                            <span className="text-accent/50 flex-shrink-0">{i + 1}.</span>
                            <span className="truncate">{label}</span>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )}

                {/* Next cycle reason */}
                {item.next_cycle_reason && (
                  <p className="text-[11px] text-muted-foreground/60 italic">{item.next_cycle_reason}</p>
                )}
              </div>
            )}

            {/* Running + no children */}
            {isRunning && (!item.children || item.children.length === 0) && !hasCompletionData && (
              <div className="chat-step-detail-card !p-0 !border-0 !bg-transparent pl-4">
                <span className="text-[11px] text-muted-foreground/50 animate-pulse">Cycle executing…</span>
              </div>
            )}

            {/* No data available (e.g., old cycles with truncated raw_output) */}
            {!isRunning && (!item.children || item.children.length === 0) && !hasCompletionData && (
              <p className="text-xs text-muted-foreground/50 py-1 pl-1">Detailed phase data not available for this cycle.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
