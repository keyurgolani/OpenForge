import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
    Loader2, ChevronRight, ChevronLeft, Zap, Search, Wrench, Clock, ExternalLink,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { listAgents, listAllExecutionsPaginated } from '@/lib/api'

const PAGE_SIZE = 25

const statusCfg: Record<string, { label: string; classes: string; pulse?: boolean }> = {
    running:     { label: 'Running',   classes: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30', pulse: true },
    completed:   { label: 'Done',      classes: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30' },
    failed:      { label: 'Failed',    classes: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30' },
    cancelled:   { label: 'Cancelled', classes: 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30' },
    queued:      { label: 'Queued',    classes: 'bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30' },
    paused_hitl: { label: 'Awaiting',  classes: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' },
}

const fmtDuration = (s: string, e: string | null) => {
    const ms = (e ? new Date(e).getTime() : Date.now()) - new Date(s).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

export function AgentExecutionsSubTab() {
    const navigate = useNavigate()
    const [page, setPage] = useState(0)
    const [statusFilter, setStatusFilter] = useState('')
    const [agentFilter, setAgentFilter] = useState('')

    const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: listAgents })
    const agentList = agents as { id: string; name: string }[]
    const agentMap: Record<string, string> = {}
    for (const a of agentList) agentMap[a.id] = a.name

    const { data, isLoading } = useQuery({
        queryKey: ['executions-paginated', page, statusFilter, agentFilter],
        queryFn: () => listAllExecutionsPaginated({
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(agentFilter ? { agent_id: agentFilter } : {}),
        }),
    })

    const items: any[] = data?.items ?? []
    const total: number = data?.total ?? 0
    const totalPages = Math.ceil(total / PAGE_SIZE)

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Search className="w-3 h-3" />
                    Filters
                </div>
                <select className="input text-xs py-1 px-2.5 w-auto min-w-[120px]" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
                    <option value="">All statuses</option>
                    <option value="completed">Completed</option>
                    <option value="running">Running</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="queued">Queued</option>
                    <option value="paused_hitl">Awaiting Approval</option>
                </select>
                <select className="input text-xs py-1 px-2.5 w-auto min-w-[140px]" value={agentFilter} onChange={e => { setAgentFilter(e.target.value); setPage(0) }}>
                    <option value="">All agents</option>
                    {agentList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {(statusFilter || agentFilter) && (
                    <button className="text-[10px] text-accent hover:underline" onClick={() => { setStatusFilter(''); setAgentFilter(''); setPage(0) }}>
                        Clear filters
                    </button>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {total} execution{total !== 1 ? 's' : ''}
                </span>
            </div>

            {isLoading && items.length === 0 ? (
                <div className="flex items-center justify-center py-16 glass-card rounded-xl">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-12 glass-card rounded-xl">
                    <Zap className="w-8 h-8 mx-auto mb-2 opacity-25" />
                    <p className="text-xs text-muted-foreground/60">No executions match the current filters.</p>
                </div>
            ) : (
                <div className="glass-card rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                                <th className="px-4 py-2.5 font-medium">Status</th>
                                <th className="px-4 py-2.5 font-medium">Agent</th>
                                <th className="px-4 py-2.5 font-medium">Duration</th>
                                <th className="px-4 py-2.5 font-medium text-center"><Wrench className="w-3 h-3 inline-block" /></th>
                                <th className="px-4 py-2.5 font-medium">Started</th>
                                <th className="px-4 py-2.5 font-medium" />
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((exec: any) => {
                                const cfg = statusCfg[exec.status] ?? statusCfg.queued
                                return (
                                    <tr key={exec.id} className="border-b border-border/30 last:border-b-0 hover:bg-white/[0.03] cursor-pointer transition-colors group" onClick={() => navigate(`/executions/${exec.id}`)}>
                                        <td className="px-4 py-2.5">
                                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.classes}`}>
                                                {cfg.pulse && (
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                                                    </span>
                                                )}
                                                {cfg.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="text-sm text-foreground/90">{exec.agent_name ?? agentMap[exec.agent_id] ?? 'Unknown'}</div>
                                            {exec.workspace_name && <div className="text-[10px] text-muted-foreground/60">{exec.workspace_name}</div>}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDuration(exec.started_at, exec.completed_at)}</td>
                                        <td className="px-4 py-2.5 text-center">
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Wrench className="w-3 h-3" /> {exec.tool_calls_count}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <Clock className="w-3 h-3" />
                                                {formatDistanceToNow(new Date(exec.started_at), { addSuffix: true })}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-accent transition-colors" />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
                    <div className="flex items-center gap-1">
                        <button className="btn-ghost py-1 px-2 text-xs disabled:opacity-30" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 tabular-nums">{page + 1} / {totalPages}</span>
                        <button className="btn-ghost py-1 px-2 text-xs disabled:opacity-30" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
