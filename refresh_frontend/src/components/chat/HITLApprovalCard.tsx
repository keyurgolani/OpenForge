import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type HITLStatus = 'pending' | 'approved' | 'denied'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface HITLApprovalData {
  id: string
  toolName: string
  actionSummary: string
  riskLevel: RiskLevel
  status: HITLStatus
  input?: Record<string, unknown>
}

interface HITLApprovalCardProps {
  approval: HITLApprovalData
  onResolve?: (hitlId: string, approved: boolean) => void
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

const riskConfig: Record<RiskLevel, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: 'text-success', bg: 'bg-success/10' },
  medium: { label: 'Medium', color: 'text-warning', bg: 'bg-warning/10' },
  high: { label: 'High', color: 'text-danger', bg: 'bg-danger/10' },
  critical: { label: 'Critical', color: 'text-danger', bg: 'bg-danger/15' },
}

const statusConfig: Record<
  HITLStatus,
  { label: string; border: string; bg: string; icon: typeof Clock }
> = {
  pending: {
    label: 'Awaiting approval',
    border: 'border-warning/40',
    bg: 'bg-warning/[0.04]',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    border: 'border-success/40',
    bg: 'bg-success/[0.04]',
    icon: Check,
  },
  denied: {
    label: 'Denied',
    border: 'border-danger/40',
    bg: 'bg-danger/[0.04]',
    icon: AlertTriangle,
  },
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function HITLApprovalCard({
  approval,
  onResolve,
  className,
}: HITLApprovalCardProps) {
  const [resolving, setResolving] = useState(false)
  const risk = riskConfig[approval.riskLevel]
  const status = statusConfig[approval.status]
  const StatusIcon = status.icon

  async function handleResolve(approved: boolean) {
    if (!onResolve || resolving) return
    setResolving(true)
    try {
      onResolve(approval.id, approved)
    } finally {
      setResolving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'relative overflow-hidden rounded-lg border',
        status.border,
        status.bg,
        approval.status === 'pending' && 'shadow-sm',
        className,
      )}
    >
      {/* Animated pending border */}
      {approval.status === 'pending' && (
        <motion.div
          className="absolute inset-0 rounded-lg border-2 border-warning/30 pointer-events-none"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-label text-sm font-semibold text-fg">
                {approval.toolName}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wide',
                  risk.bg,
                  risk.color,
                )}
              >
                {risk.label} risk
              </span>
            </div>

            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              {approval.actionSummary}
            </p>
          </div>
        </div>

        {/* Input preview */}
        {approval.input && Object.keys(approval.input).length > 0 && (
          <div className="mt-3 rounded-md bg-bg-sunken/50 px-3 py-2">
            <pre className="max-h-32 overflow-auto font-mono text-[11px] leading-relaxed text-fg-muted">
              {JSON.stringify(approval.input, null, 2)}
            </pre>
          </div>
        )}

        {/* Status / Actions */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <StatusIcon
              className={cn(
                'h-3.5 w-3.5',
                approval.status === 'pending' && 'text-warning',
                approval.status === 'approved' && 'text-success',
                approval.status === 'denied' && 'text-danger',
              )}
            />
            <span
              className={cn(
                'font-label text-xs font-medium',
                approval.status === 'pending' && 'text-warning',
                approval.status === 'approved' && 'text-success',
                approval.status === 'denied' && 'text-danger',
              )}
            >
              {status.label}
            </span>
          </div>

          {approval.status === 'pending' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleResolve(false)}
                disabled={resolving}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5',
                  'font-label text-xs font-semibold',
                  'border border-danger/30 text-danger',
                  'hover:bg-danger/10 active:bg-danger/15',
                  'transition-colors duration-150 focus-ring',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                Deny
              </button>
              <button
                type="button"
                onClick={() => handleResolve(true)}
                disabled={resolving}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5',
                  'font-label text-xs font-semibold',
                  'bg-success text-fg-on-primary',
                  'hover:bg-success/90 active:bg-success/80',
                  'transition-colors duration-150 focus-ring',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                Approve
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
