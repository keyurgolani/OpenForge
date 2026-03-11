import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listExecutions, listAgents } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Activity, Clock, Wrench, MessageCircle, ArrowRight, Loader2 } from 'lucide-react'

interface Execution {
    id: string
    workspace_id: string
    conversation_id: string
    agent_id: string
    status: 'queued' | 'running' | 'paused_hitl' | 'completed' | 'failed' | 'cancelled'
    iteration_count: number
    tool_calls_count: number
    timeline: any[]
    error_message: string | null
    started_at: string
    completed_at: string | null
}

const STATUS_CONFIG: Record<string, { label: string; classes: string; pulse?: boolean }> = {
    running:     { label: 'Running',    classes: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30', pulse: true },
    completed:   { label: 'Completed',  classes: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30' },
    failed:      { label: 'Failed',     classes: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30' },
    cancelled:   { label: 'Cancelled',  classes: 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30' },
    queued:      { label: 'Queued',     classes: 'bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30' },
    paused_hitl: { label: 'Awaiting',   classes: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' },
}

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued
    return (
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.classes}`}>
            {cfg.pulse && (
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
            )}
            {cfg.label}
        </span>
    )
}

function formatDuration(startedAt: string, completedAt: string | null): string {
    const start = new Date(startedAt).getTime()
    const end = completedAt ? new Date(completedAt).getTime() : Date.now()
    const diffMs = end - start
    if (diffMs < 1000) return `${diffMs}ms`
    if (diffMs < 60_000) return `${(diffMs / 1000).toFixed(1)}s`
    const mins = Math.floor(diffMs / 60_000)
    const secs = Math.round((diffMs % 60_000) / 1000)
    return `${mins}m ${secs}s`
}

function truncateId(id: string): string {
    return id.length > 8 ? id.slice(0, 8) : id
}

export default function ExecutionListPage() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()

    const { data: executions = [], isLoading } = useQuery<Execution[]>({
        queryKey: ['executions', workspaceId],
        queryFn: () => listExecutions(workspaceId),
        enabled: !!workspaceId,
        refetchInterval: 5000,
    })

    const { data: agents = [] } = useQuery<{ id: string; name: string }[]>({
        queryKey: ['agents'],
        queryFn: listAgents,
    })

    const agentMap = useMemo(() => {
        const map: Record<string, string> = {}
        for (const a of agents) map[a.id] = a.name
        return map
    }, [agents])

    const runningCount = useMemo(
        () => executions.filter(e => e.status === 'running').length,
        [executions],
    )

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold tracking-tight">Agent Executions</h1>
                        <p className="text-xs text-muted-foreground">
                            {executions.length} execution{executions.length !== 1 ? 's' : ''}
                            {runningCount > 0 && (
                                <span className="text-emerald-400 ml-1.5">
                                    ({runningCount} running)
                                </span>
                            )}
                        </p>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Empty */}
            {!isLoading && executions.length === 0 && (
                <div className="text-center py-24 glass-card rounded-xl">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-muted-foreground">No agent executions yet.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Start an agent conversation to see executions here.</p>
                </div>
            )}

            {/* Table */}
            {!isLoading && executions.length > 0 && (
                <div className="glass-card rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                                <th className="px-4 py-3 font-medium">Execution</th>
                                <th className="px-4 py-3 font-medium">Agent</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium">Started</th>
                                <th className="px-4 py-3 font-medium">Duration</th>
                                <th className="px-4 py-3 font-medium text-center">
                                    <Wrench className="w-3.5 h-3.5 inline-block" />
                                </th>
                                <th className="px-4 py-3 font-medium text-center">Chat</th>
                                <th className="px-4 py-3 font-medium" />
                            </tr>
                        </thead>
                        <tbody>
                            {executions.map((exec) => (
                                <tr
                                    key={exec.id}
                                    className="border-b border-border/30 last:border-b-0 hover:bg-white/[0.03] cursor-pointer transition-colors group"
                                    onClick={() => navigate(`/w/${workspaceId}/executions/${exec.id}`)}
                                >
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-xs text-foreground/70" title={exec.id}>
                                            {truncateId(exec.id)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-sm text-foreground/90">
                                            {agentMap[exec.agent_id] ?? 'Unknown Agent'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={exec.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Clock className="w-3 h-3 flex-shrink-0" />
                                            {formatDistanceToNow(new Date(exec.started_at), { addSuffix: true })}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs text-muted-foreground">
                                            {formatDuration(exec.started_at, exec.completed_at)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                            <Wrench className="w-3 h-3" />
                                            {exec.tool_calls_count}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            className="inline-flex items-center gap-1 text-xs text-accent/60 hover:text-accent transition-colors"
                                            title="Open conversation"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/w/${workspaceId}/agent/${exec.conversation_id}`)
                                            }}
                                        >
                                            <MessageCircle className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent transition-colors" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
