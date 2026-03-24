import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { getToolIcon } from '@/lib/tool-icons'

interface ToolCallCardProps {
  toolName: string
  arguments: Record<string, unknown>
  status: string
  success?: boolean | null
  output?: unknown
  error?: string | null
  durationMs?: number | null
}

function getInputPreview(toolName: string, args: Record<string, unknown>): string {
  if (args.query) return `"${args.query}"`
  if (args.url) return String(args.url)
  if (args.path) return String(args.path)
  if (args.command) return String(args.command)
  const keys = Object.keys(args)
  if (keys.length === 0) return ''
  return JSON.stringify(args, null, 0).slice(0, 80)
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') return output.slice(0, 200)
  if (output && typeof output === 'object') {
    const s = JSON.stringify(output)
    return s.length > 200 ? s.slice(0, 197) + '...' : s
  }
  return String(output)
}

export function ToolCallCard({ toolName, arguments: args, status, success, output, error, durationMs }: ToolCallCardProps) {
  const [showOutput, setShowOutput] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const Icon = getToolIcon(toolName)
  const isComplete = status === 'complete' || status === 'approved'
  const isError = status === 'error'

  useEffect(() => {
    if (isComplete && !collapsed) {
      const timer = setTimeout(() => setCollapsed(true), 800)
      return () => clearTimeout(timer)
    }
  }, [isComplete])

  const statusColor = status === 'running' ? 'text-accent' : isComplete ? 'text-success' : isError ? 'text-destructive' : 'text-muted-foreground'
  const borderClass = status === 'running' ? 'border-accent/20' : isError ? 'border-destructive/20' : 'border-border'

  return (
    <div className={`bg-card ${borderClass} border rounded-md px-3.5 py-2.5 relative overflow-hidden shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.04)] hover:-translate-y-px hover:shadow-md transition-all duration-150`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="w-[13px] h-[13px] text-accent" />
          <span className="text-[13px] font-mono text-accent/85">{toolName}</span>
        </div>
        <span className={`text-[11px] font-medium ${statusColor}`}>
          {status === 'running' ? 'Running' : durationMs ? `${(durationMs / 1000).toFixed(1)}s` : ''}
        </span>
      </div>
      {!collapsed && (
        <>
          {getInputPreview(toolName, args) && (
            <div className="text-xs text-muted-foreground mb-1.5">{getInputPreview(toolName, args)}</div>
          )}
          {isError && error && <div className="text-xs text-destructive mt-1">{error}</div>}
          {isComplete && output && (
            <div className="text-xs text-foreground/50 flex justify-between items-center mt-1.5">
              <span>{typeof output === 'string' ? output.slice(0, 60) : 'Result available'}</span>
              <button onClick={() => setShowOutput(!showOutput)} className="text-accent/60 text-[11px] hover:text-accent">
                {showOutput ? 'Hide' : 'Show'} <ChevronDown className={`w-2.5 h-2.5 inline transition-transform ${showOutput ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
          {showOutput && output && (
            <pre className="mt-2 p-2 bg-muted/30 rounded-sm text-[11px] text-muted-foreground overflow-x-auto max-h-[200px] overflow-y-auto font-mono">
              {formatOutput(output)}
            </pre>
          )}
        </>
      )}
      {status === 'running' && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/50 to-transparent animate-pulse" />
      )}
    </div>
  )
}
