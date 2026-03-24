import { Lock, Check, X, Clock } from 'lucide-react'
import { getToolIcon } from '@/lib/tool-icons'

interface HITLApprovalCardProps {
  toolName: string
  actionSummary: string
  status: 'pending' | 'approved' | 'denied' | 'timed_out'
  parameters?: Record<string, unknown>
  onApprove: () => void
  onDeny: () => void
}

export function HITLApprovalCard({ toolName, actionSummary, status, onApprove, onDeny }: HITLApprovalCardProps) {
  const Icon = getToolIcon(toolName)
  const isPending = status === 'pending'

  return (
    <div className={`bg-warning/4 border border-warning/20 border-l-4 border-l-warning/60 rounded-md px-3.5 py-3 ${isPending ? 'animate-pulse' : ''}`} style={isPending ? { animationDuration: '2s' } : undefined}>
      <div className="flex items-center gap-1.5 mb-2">
        {isPending && <Lock className="w-[13px] h-[13px] text-warning/85" />}
        {status === 'approved' && <Check className="w-[13px] h-[13px] text-success" />}
        {status === 'denied' && <X className="w-[13px] h-[13px] text-muted-foreground" />}
        {status === 'timed_out' && <Clock className="w-[13px] h-[13px] text-muted-foreground" />}
        <span className={`text-[11px] font-medium ${isPending ? 'text-warning' : status === 'approved' ? 'text-success' : 'text-muted-foreground'}`}>
          {isPending ? 'Awaiting Approval' : status === 'approved' ? 'Approved' : status === 'denied' ? 'Denied' : 'Timed Out'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-[13px] h-[13px] text-accent" />
        <span className="text-[13px] font-mono text-accent/85">{toolName}</span>
      </div>
      {actionSummary && (
        <div className="p-2 bg-card/60 border border-border/50 rounded-sm text-xs text-muted-foreground leading-relaxed mb-2.5">
          {actionSummary}
        </div>
      )}
      {isPending && (
        <div className="flex gap-2">
          <button onClick={onApprove} className="btn-primary px-4 py-1.5 text-xs font-semibold rounded-sm" aria-label="Approve action">Approve</button>
          <button onClick={onDeny} className="btn-ghost px-4 py-1.5 text-xs font-medium rounded-sm" aria-label="Deny action">Deny</button>
        </div>
      )}
    </div>
  )
}
