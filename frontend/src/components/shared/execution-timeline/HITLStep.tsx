import { ShieldAlert, Lock, Check, X, Clock } from 'lucide-react'
import { getToolIcon } from '@/lib/tool-icons'
import type { HITLTimelineItem } from '@/types/timeline'

interface HITLStepProps {
  item: HITLTimelineItem
  onAction?: (hitlId: string, action: 'approve' | 'deny', note?: string) => void
}

export function HITLStep({ item, onAction }: HITLStepProps) {
  const Icon = getToolIcon(item.tool_name)

  // Map timeline status to display status
  const displayStatus: 'pending' | 'approved' | 'denied' | 'timed_out' =
    item.status === 'awaiting_approval'
      ? 'pending'
      : item.status === 'approved'
        ? 'approved'
        : item.status === 'denied'
          ? 'denied'
          : 'timed_out'

  const isPending = displayStatus === 'pending'

  return (
    <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--hitl ${isPending ? 'chat-workflow-step-live' : ''}`}>
      <div className="chat-timeline-dot">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
      </div>
      <div className={`bg-warning/4 border border-warning/20 border-l-4 border-l-warning/60 rounded-md px-3.5 py-3 ${isPending ? 'animate-pulse' : ''}`} style={isPending ? { animationDuration: '2s' } : undefined}>
        <div className="flex items-center gap-1.5 mb-2">
          {isPending && <Lock className="w-[13px] h-[13px] text-warning/85" />}
          {displayStatus === 'approved' && <Check className="w-[13px] h-[13px] text-success" />}
          {displayStatus === 'denied' && <X className="w-[13px] h-[13px] text-muted-foreground" />}
          {displayStatus === 'timed_out' && <Clock className="w-[13px] h-[13px] text-muted-foreground" />}
          <span className={`text-[11px] font-medium ${isPending ? 'text-warning' : displayStatus === 'approved' ? 'text-success' : 'text-muted-foreground'}`}>
            {isPending ? 'Awaiting Approval' : displayStatus === 'approved' ? 'Approved' : displayStatus === 'denied' ? 'Denied' : 'Timed Out'}
          </span>
          {item.risk_level && (
            <span className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full ${
              item.risk_level === 'high'
                ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                : item.risk_level === 'medium'
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
            }`}>
              {item.risk_level}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <Icon className="w-[13px] h-[13px] text-accent" />
          <span className="text-[13px] font-mono text-accent/85">{item.tool_name}</span>
        </div>
        {item.action_summary && (
          <div className="p-2 bg-card/60 border border-border/20 rounded-sm text-xs text-muted-foreground leading-relaxed mb-2.5">
            {item.action_summary}
          </div>
        )}
        {item.resolution_note && (
          <div className="text-[11px] text-muted-foreground/70 italic mb-2">
            {item.resolution_note}
          </div>
        )}
        {isPending && onAction && (
          <div className="flex gap-2">
            <button onClick={() => onAction(item.hitl_id, 'approve')} className="btn-primary px-4 py-1.5 text-xs font-semibold rounded-sm" aria-label="Approve action">Approve</button>
            <button onClick={() => onAction(item.hitl_id, 'deny')} className="btn-ghost px-4 py-1.5 text-xs font-medium rounded-sm" aria-label="Deny action">Deny</button>
          </div>
        )}
      </div>
    </div>
  )
}
