import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, Loader2, ShieldAlert, X } from 'lucide-react'

import { approveApprovalRequest, denyApprovalRequest, listApprovalRequests } from '@/lib/api'
import { WorkspaceFilterSelect } from '@/pages/settings/components'
import type { ApprovalRecord } from '@/types/trust'

export default function ApprovalInboxPanel() {
  const qc = useQueryClient()
  const [filterWorkspace, setFilterWorkspace] = useState('')
  const [status, setStatus] = useState<'pending' | 'all'>('pending')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ approvals: ApprovalRecord[]; total: number }>({
    queryKey: ['approval-requests', status, filterWorkspace],
    queryFn: () => listApprovalRequests({ status: status === 'pending' ? 'pending' : '', limit: 200 }),
    refetchInterval: status === 'pending' ? 5000 : false,
  })

  const approvals = (data?.approvals ?? []).filter((approval) => !filterWorkspace || approval.scope_id === filterWorkspace)

  const approveMutation = useMutation({
    mutationFn: (approvalId: string) => approveApprovalRequest(approvalId, notes[approvalId]),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['approval-requests'] })
    },
  })

  const denyMutation = useMutation({
    mutationFn: (approvalId: string) => denyApprovalRequest(approvalId, notes[approvalId]),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['approval-requests'] })
    },
  })

  return (
    <div className="space-y-5">
      <div className="glass-card rounded-2xl border-accent/20 bg-accent/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Approval Inbox</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Review pending approval requests, inspect the requested action and payload preview, then approve or deny with an operator note.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <WorkspaceFilterSelect value={filterWorkspace} onChange={setFilterWorkspace} />
        <div className="flex gap-2 rounded-xl border border-border/40 bg-background/20 p-1">
          {[
            { value: 'pending', label: 'Pending' },
            { value: 'all', label: 'All recent' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value as 'pending' | 'all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                status === option.value ? 'bg-accent/20 text-accent' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && approvals.length === 0 && (
        <div className="glass-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          No approval requests matched the current filters.
        </div>
      )}

      {!isLoading && approvals.length > 0 && (
        <div className="space-y-3">
          {approvals.map((approval) => {
            const expanded = activeId === approval.id
            const acting = approveMutation.isPending || denyMutation.isPending
            return (
              <div key={approval.id} className="glass-card rounded-2xl p-4">
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setActiveId(expanded ? null : approval.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{approval.tool_name ?? approval.requested_action}</span>
                        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{approval.status}</span>
                        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{approval.risk_category}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{approval.reason_text}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(approval.requested_at).toLocaleString()} • {approval.scope_type}:{approval.scope_id ?? 'system'}</p>
                    </div>
                    <span className="text-[11px] text-accent">{expanded ? 'Hide details' : 'Show details'}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="mt-4 space-y-4 border-t border-border/40 pt-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),300px]">
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Requested action</p>
                          <p className="mt-1 text-sm text-foreground">{approval.requested_action}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Matched policy</p>
                            <p className="mt-1 break-all font-mono text-xs text-foreground">{approval.matched_policy_id ?? 'Default risk policy'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Matched rule</p>
                            <p className="mt-1 break-all font-mono text-xs text-foreground">{approval.matched_rule_id ?? 'No specific rule'}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Payload preview</p>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/40 bg-background/30 p-3 text-xs text-foreground">
                            {JSON.stringify(approval.payload_preview ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {approval.source_run_id && (
                          <div className="rounded-xl border border-border/40 bg-background/20 px-3 py-3 text-[11px] text-muted-foreground">
                            Source run: <span className="break-all font-mono text-foreground">{approval.source_run_id}</span>
                          </div>
                        )}
                        <textarea
                          className="min-h-[160px] w-full rounded-xl border border-border/50 bg-background/20 px-3 py-3 text-xs text-foreground outline-none transition-colors focus:border-accent/40"
                          placeholder="Optional operator note"
                          value={notes[approval.id] ?? ''}
                          onChange={(event) => setNotes((current) => ({ ...current, [approval.id]: event.target.value }))}
                        />
                        {approval.status === 'pending' ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
                              disabled={acting}
                              onClick={() => approveMutation.mutate(approval.id)}
                            >
                              {approveMutation.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5" /> Approve</span>}
                            </button>
                            <button
                              type="button"
                              className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-60"
                              disabled={acting}
                              onClick={() => denyMutation.mutate(approval.id)}
                            >
                              {denyMutation.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <span className="inline-flex items-center gap-2"><X className="h-3.5 w-3.5" /> Deny</span>}
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-border/40 bg-background/20 px-3 py-3 text-xs text-muted-foreground">
                            {approval.status} {approval.resolved_at ? `on ${new Date(approval.resolved_at).toLocaleString()}` : ''}
                            {approval.resolution_note ? ` • ${approval.resolution_note}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
