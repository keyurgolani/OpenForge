import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  Settings2,
  Brain,
  Wrench,
  AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type TimelineStepType = 'model_selection' | 'thinking' | 'tool_call' | 'error'

export interface TimelineStepData {
  id: string
  type: TimelineStepType
  label: string
  detail?: string
  durationMs?: number
  children?: React.ReactNode
}

interface TimelineStepProps {
  step: TimelineStepData
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Config per type                                                            */
/* -------------------------------------------------------------------------- */

const typeConfig: Record<
  TimelineStepType,
  { icon: LucideIcon; border: string; iconColor: string; bg: string }
> = {
  model_selection: {
    icon: Settings2,
    border: 'border-l-primary-400',
    iconColor: 'text-primary',
    bg: 'bg-primary/5',
  },
  thinking: {
    icon: Brain,
    border: 'border-l-secondary-400',
    iconColor: 'text-secondary',
    bg: 'bg-secondary/5',
  },
  tool_call: {
    icon: Wrench,
    border: 'border-l-primary-600',
    iconColor: 'text-primary-600',
    bg: 'bg-primary/5',
  },
  error: {
    icon: AlertTriangle,
    border: 'border-l-danger',
    iconColor: 'text-danger',
    bg: 'bg-danger/5',
  },
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function TimelineStep({ step, className }: TimelineStepProps) {
  const [expanded, setExpanded] = useState(false)
  const config = typeConfig[step.type]
  const Icon = config.icon
  const hasContent = !!step.detail || !!step.children

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div
      className={cn(
        'border-l-2 pl-3',
        config.border,
        className,
      )}
    >
      <button
        type="button"
        onClick={() => hasContent && setExpanded(!expanded)}
        disabled={!hasContent}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
          'transition-colors duration-150',
          hasContent && 'hover:bg-fg/[0.03] cursor-pointer',
          !hasContent && 'cursor-default',
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', config.iconColor)} />

        <span className="flex-1 truncate font-label text-xs font-medium text-fg-muted">
          {step.label}
        </span>

        {step.durationMs != null && (
          <span className="shrink-0 font-mono text-[10px] text-fg-subtle">
            {formatDuration(step.durationMs)}
          </span>
        )}

        {hasContent && (
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="h-3 w-3 text-fg-subtle" />
          </motion.div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className={cn('mt-1 rounded-md px-2.5 py-2', config.bg)}>
              {step.detail && (
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-fg-muted">
                  {step.detail}
                </pre>
              )}
              {step.children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
