import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  Wrench,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import type { TimelineStepData } from './TimelineStep'
import TimelineStep from './TimelineStep'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ToolCallStatus = 'running' | 'success' | 'error'

export interface ToolCallData {
  id: string
  toolName: string
  category?: string
  input?: Record<string, unknown>
  output?: string | Record<string, unknown>
  status: ToolCallStatus
  durationMs?: number
  subSteps?: TimelineStepData[]
}

interface ToolCallCardProps {
  call: ToolCallData
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function StatusIndicator({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'running':
      return <LoadingSpinner size="sm" />
    case 'success':
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/10">
          <Check className="h-3 w-3 text-success" />
        </div>
      )
    case 'error':
      return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-danger/10">
          <AlertTriangle className="h-3 w-3 text-danger" />
        </div>
      )
  }
}

function CollapsibleJson({
  label,
  data,
}: {
  label: string
  data: string | Record<string, unknown> | undefined
}) {
  const [open, setOpen] = useState(false)
  if (data == null) return null

  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-label font-medium text-fg-subtle hover:text-fg-muted transition-colors"
      >
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight className="h-3 w-3" />
        </motion.div>
        {label}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-bg-sunken px-3 py-2 font-mono text-[11px] leading-relaxed text-fg-muted">
              {text}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ToolCallCard({ call, className }: ToolCallCardProps) {
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-bg-elevated',
        'transition-shadow duration-200 hover:shadow-sm',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Wrench className="h-3.5 w-3.5 text-primary" />
        </div>

        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <span className="truncate font-label text-xs font-semibold text-fg">
            {call.toolName}
          </span>
          {call.category && (
            <span className="shrink-0 rounded-full bg-bg-sunken px-2 py-0.5 font-label text-[10px] font-medium text-fg-subtle">
              {call.category}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {call.durationMs != null && (
            <span className="font-mono text-[10px] text-fg-subtle">
              {formatDuration(call.durationMs)}
            </span>
          )}
          <StatusIndicator status={call.status} />
        </div>
      </div>

      {/* Body */}
      <div className="space-y-2 border-t border-border/40 px-3 py-2.5">
        <CollapsibleJson label="Input" data={call.input} />
        <CollapsibleJson label="Output" data={call.output} />

        {/* Nested timeline */}
        {call.subSteps && call.subSteps.length > 0 && (
          <div className="mt-2 space-y-1">
            <span className="font-label text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Sub-steps
            </span>
            <div className="space-y-0.5">
              {call.subSteps.map((sub) => (
                <TimelineStep key={sub.id} step={sub} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
