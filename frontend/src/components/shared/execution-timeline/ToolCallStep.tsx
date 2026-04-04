import { useState, useEffect, useRef } from 'react'
import { Wrench, ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import type { ToolCallTimelineItem } from '@/types/timeline'

interface ToolCallStepProps {
  item: ToolCallTimelineItem
}

function getHeaderHint(args: Record<string, unknown> | null | undefined): string {
  if (!args) return ''
  if (args.query) return `"${args.query}"`
  if (args.url) return String(args.url)
  if (args.path) return String(args.path)
  if (args.command) return String(args.command)
  const keys = Object.keys(args)
  if (keys.length === 0) return ''
  return JSON.stringify(args, null, 0).slice(0, 80)
}

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') return output.slice(0, 500)
  if (output && typeof output === 'object') {
    const s = JSON.stringify(output, null, 2)
    return s.length > 500 ? s.slice(0, 497) + '...' : s
  }
  return String(output)
}

export function ToolCallStep({ item }: ToolCallStepProps) {
  const [isOpen, setIsOpen] = useState(false)
  const userPinnedRef = useRef(false)
  const isComplete = item.status === 'complete' || item.status === 'approved'
  const isError = item.status === 'error'
  const isRunning = item.status === 'running'
  const headerHint = getHeaderHint(item.arguments)

  // Auto-open when running (live preview)
  useEffect(() => {
    if (isRunning && !isOpen && !userPinnedRef.current) {
      setIsOpen(true)
    }
  }, [isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse 1.5s after completion (skip if user manually expanded)
  useEffect(() => {
    if ((isComplete || isError) && isOpen && !userPinnedRef.current) {
      const timer = setTimeout(() => setIsOpen(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isComplete, isError, isOpen])

  const handleToggle = () => {
    const willOpen = !isOpen
    setIsOpen(willOpen)
    if (willOpen) {
      userPinnedRef.current = true
    } else {
      userPinnedRef.current = false
    }
  }

  return (
    <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--tool ${isRunning ? 'chat-workflow-step-live' : ''}`}>
      <div className="chat-timeline-dot">
        <Wrench className="w-3.5 h-3.5 text-accent/70" />
      </div>
      <div>
        <button
          onClick={handleToggle}
          className={`chat-subsection-toggle ${isOpen ? 'chat-subsection-toggle-open' : ''}`}
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          <span className="font-mono text-[11px]">{item.tool_name}</span>
          {headerHint && <span className="text-[11px] text-muted-foreground/60 truncate max-w-[200px]">{truncate(headerHint)}</span>}
          {isRunning && <Loader2 className="h-3 w-3 text-accent animate-spin" />}
          {!isRunning && isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          {!isRunning && isError && <XCircle className="h-3 w-3 text-red-400" />}
          {item.error && !isOpen && (
            <span className="text-red-400/70 text-xs truncate max-w-[200px]">
              {item.error.length > 80 ? item.error.slice(0, 77) + '…' : item.error}
            </span>
          )}
          {item.duration_ms != null && !isRunning && (
            <span className="text-[10px] text-muted-foreground/70 ml-auto">{(item.duration_ms / 1000).toFixed(1)}s</span>
          )}
        </button>
        <div className={`chat-collapse ${isOpen ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
          <div className="chat-collapse-inner">
            <div className="chat-step-detail-card">
              {/* Input arguments */}
              {item.arguments && Object.keys(item.arguments).length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-accent/55 font-medium mb-1">Input</div>
                  {Object.entries(item.arguments).map(([key, val]) => (
                    <div key={key} className="flex gap-2 text-[11px] mb-0.5">
                      <span className="text-muted-foreground/70 font-mono flex-shrink-0">{key}:</span>
                      <span className="text-foreground/75 break-all">
                        {typeof val === 'string' ? truncate(val, 120) : JSON.stringify(val)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {isError && item.error && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-red-400/70 font-medium mb-1">Error</div>
                  <pre className="text-[11px] text-red-300/80 whitespace-pre-wrap break-words">{item.error}</pre>
                </div>
              )}

              {/* Output */}
              {isComplete && item.output && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-emerald-400/55 font-medium mb-1">Output</div>
                  <pre className="text-[11px] text-foreground/60 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto font-mono">
                    {formatOutput(item.output)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
