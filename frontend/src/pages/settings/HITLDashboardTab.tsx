import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, CheckCircle, Check, X,
} from 'lucide-react'
import { listPendingHITL, approveHITL, denyHITL } from '@/lib/api'
import type { HITLRequest } from './types'
import { RISK_STYLES } from './constants'
import { WorkspaceFilterSelect } from './components'

function HITLDashboardTab() {
    const qc = useQueryClient()
    const [filterWorkspace, setFilterWorkspace] = useState('')

    const { data: pendingData, isLoading: loadingPending } = useQuery({
        queryKey: ['hitl-pending', filterWorkspace],
        queryFn: () => listPendingHITL({ workspace_id: filterWorkspace || undefined }),
        refetchInterval: 5_000,
    })
    const pending: HITLRequest[] = pendingData ?? []

    const [actionNotes, setActionNotes] = useState<Record<string, string>>({})
    const [acting, setActing] = useState<string | null>(null)

    const handleApprove = async (id: string) => {
        setActing(id)
        try {
            await approveHITL(id, actionNotes[id] || undefined)
            setActionNotes(prev => { const n = { ...prev }; delete n[id]; return n })
            qc.invalidateQueries({ queryKey: ['hitl-pending'] })
            qc.invalidateQueries({ queryKey: ['hitl-history'] })
        } finally {
            setActing(null)
        }
    }

    const handleDeny = async (id: string) => {
        setActing(id)
        try {
            await denyHITL(id, actionNotes[id] || undefined)
            setActionNotes(prev => { const n = { ...prev }; delete n[id]; return n })
            qc.invalidateQueries({ queryKey: ['hitl-pending'] })
            qc.invalidateQueries({ queryKey: ['hitl-history'] })
        } finally {
            setActing(null)
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-sm">Human-in-the-Loop</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Review and approve or deny tool calls that require human oversight. Configure per-tool permissions in the Native Tools tab. History of resolved requests is in the Audit tab.
                    </p>
                </div>
                <WorkspaceFilterSelect value={filterWorkspace} onChange={setFilterWorkspace} />
            </div>

            <div className="space-y-3">
                {loadingPending && (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {!loadingPending && pending.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground glass-card rounded-xl">
                        <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No pending approvals.</p>
                        <p className="text-xs mt-1 opacity-60">Tool calls requiring review will appear here.</p>
                    </div>
                )}

                {pending.map(req => (
                    <div key={req.id} className="glass-card rounded-xl p-4 space-y-3 border border-amber-500/20">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-medium text-sm">{req.tool_id}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${RISK_STYLES[req.risk_level] ?? RISK_STYLES.medium}`}>
                                        {req.risk_level}
                                    </span>
                                </div>
                                {req.action_summary && (
                                    <p className="text-xs text-muted-foreground mt-1">{req.action_summary}</p>
                                )}
                                <p className="text-[10px] text-muted-foreground/60 mt-1">
                                    {new Date(req.created_at).toLocaleString()}
                                    <span className="ml-2">Conversation: {req.conversation_id.slice(0, 8)}…</span>
                                </p>
                            </div>
                        </div>

                        {/* Input parameters */}
                        {req.tool_input && Object.keys(req.tool_input).length > 0 && (
                            <div>
                                <p className="text-[10px] text-muted-foreground/70 font-medium mb-1 uppercase tracking-wide">Input Parameters</p>
                                <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-foreground/60 bg-muted/30 rounded-lg p-3 border border-border/40 max-h-48 overflow-y-auto">
                                    {JSON.stringify(req.tool_input, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* Action row */}
                        <div className="space-y-2">
                            <textarea
                                className="w-full rounded-lg border border-border/50 bg-background/30 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-1 focus:ring-accent/40"
                                placeholder="Optional: add guidance for the agent..."
                                rows={2}
                                value={actionNotes[req.id] ?? ''}
                                onChange={e => setActionNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                            />
                            <div className="flex gap-2">
                                <button
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                                    onClick={() => void handleApprove(req.id)}
                                    disabled={acting === req.id}
                                >
                                    {acting === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    Approve
                                </button>
                                <button
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                                    onClick={() => void handleDeny(req.id)}
                                    disabled={acting === req.id}
                                >
                                    {acting === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                    Deny
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default HITLDashboardTab
