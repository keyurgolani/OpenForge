import { useState, useEffect, useRef } from 'react'
import { ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface ToolCallCardProps {
  toolName: string
  arguments?: Record<string, unknown> | null
  status: string
  success?: boolean | null
  output?: unknown
  error?: string | null
  durationMs?: number | null
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

export function ToolCallCard({ toolName, arguments: args, status, success, output, error, durationMs }: ToolCallCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const userPinnedRef = useRef(false)
  const isComplete = status === 'complete' || status === 'approved'
  const isError = status === 'error'
  const isRunning = status === 'running'
  const headerHint = getHeaderHint(args)

  // Auto-open when running (live preview)
  useEffect(() => {
    if (isRunning && !isOpen && !userPinnedRef.current) {
      setIsOpen(true)
    }
  }, [isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse 1s after completion (skip if user manually expanded)
  useEffect(() => {
    if ((isComplete || isError) && isOpen && !userPinnedRef.current) {
      const timer = setTimeout(() => setIsOpen(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isComplete, isError, isOpen])

  const handleToggle = () => {
    const willOpen = !isOpen
    setIsOpen(willOpen)
    // If user manually opens, pin it so auto-collapse won't close it
    if (willOpen) {
      userPinnedRef.current = true
    } else {
      // User manually closed — clear the pin
      userPinnedRef.current = false
    }
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        className={`chat-subsection-toggle ${isOpen ? 'chat-subsection-toggle-open' : ''}`}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        <span className="font-mono text-[11px]">{toolName}</span>
        {headerHint && <span className="text-[11px] text-muted-foreground/60 truncate max-w-[200px]">{truncate(headerHint)}</span>}
        {isRunning && <Loader2 className="h-3 w-3 text-accent animate-spin" />}
        {!isRunning && isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
        {!isRunning && isError && <XCircle className="h-3 w-3 text-red-400" />}
        {error && !isOpen && (
          <span className="text-red-400/70 text-xs truncate max-w-[200px]">
            {error.length > 80 ? error.slice(0, 77) + '…' : error}
          </span>
        )}
        {durationMs != null && !isRunning && (
          <span className="text-[10px] text-muted-foreground/70 ml-auto">{(durationMs / 1000).toFixed(1)}s</span>
        )}
      </button>
      <div className={`chat-collapse ${isOpen ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
        <div className="chat-collapse-inner">
          <div className="chat-step-detail-card">
            {/* Input arguments */}
            {args && Object.keys(args).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-accent/55 font-medium mb-1">Input</div>
                {Object.entries(args).map(([key, val]) => (
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
            {isError && error && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-red-400/70 font-medium mb-1">Error</div>
                <pre className="text-[11px] text-red-300/80 whitespace-pre-wrap break-words">{error}</pre>
              </div>
            )}

            {/* Output */}
            {isComplete && output && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-emerald-400/55 font-medium mb-1">Output</div>
                <pre className="text-[11px] text-foreground/60 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto font-mono">
                  {formatOutput(output)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
