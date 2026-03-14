import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listAllExecutions, listAgents } from '@/lib/api'
import { chatRoute, ROUTES } from '@/lib/routes'
import { formatDistanceToNow } from 'date-fns'
import { Activity, Clock, Wrench, MessageCircle, ArrowRight, Loader2, Play, Pause, CheckCircle2, XCircle, AlertTriangle, Timer } from 'lucide-react'

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

/* ── Execution Row ────────────────────────────────────────────────────────── */

function ExecutionRow({ exec, agentMap, onClick }: {
    exec: Execution
    agentMap: Record<string, string>
    onClick: () => void
}) {
    const navigate = useNavigate()
    return (
        <tr
            className="border-b border-border/30 last:border-b-0 hover:bg-white/[0.03] cursor-pointer transition-colors group"
            onClick={onClick}
        >
            <td className="px-4 py-2.5">
                <span className="font-mono text-xs text-foreground/70" title={exec.id}>
                    {truncateId(exec.id)}
                </span>
            </td>
            <td className="px-4 py-2.5">
                <span className="text-sm text-foreground/90">
                    {agentMap[exec.agent_id] ?? 'Unknown Agent'}
                </span>
            </td>
            <td className="px-4 py-2.5">
                <StatusBadge status={exec.status} />
            </td>
            <td className="px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {formatDistanceToNow(new Date(exec.started_at), { addSuffix: true })}
                </span>
            </td>
            <td className="px-4 py-2.5">
                <span className="text-xs text-muted-foreground">
                    {formatDuration(exec.started_at, exec.completed_at)}
                </span>
            </td>
            <td className="px-4 py-2.5 text-center">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Wrench className="w-3 h-3" />
                    {exec.tool_calls_count}
                </span>
            </td>
            <td className="px-4 py-2.5 text-center">
                <button
                    className="inline-flex items-center gap-1 text-xs text-accent/60 hover:text-accent transition-colors"
                    title="Open conversation"
                    onClick={(e) => {
                        e.stopPropagation()
                        navigate(chatRoute(exec.workspace_id, exec.conversation_id))
                    }}
                >
                    <MessageCircle className="w-3.5 h-3.5" />
                </button>
            </td>
            <td className="px-4 py-2.5 text-right">
                <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent transition-colors" />
            </td>
        </tr>
    )
}

/* ── Widget ───────────────────────────────────────────────────────────────── */

function ExecutionWidget({ title, icon, iconColor, executions, agentMap, emptyText }: {
    title: string
    icon: React.ReactNode
    iconColor: string
    executions: Execution[]
    agentMap: Record<string, string>
    emptyText: string
}) {
    const navigate = useNavigate()

    return (
        <div className="glass-card rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/40 bg-card/30">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconColor}`}>
                    {icon}
                </div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">{executions.length}</span>
            </div>

            {executions.length === 0 ? (
                <div className="px-4 py-8 text-center">
                    <p className="text-xs text-muted-foreground/60">{emptyText}</p>
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            <th className="px-4 py-2 font-medium">ID</th>
                            <th className="px-4 py-2 font-medium">Agent</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2 font-medium">Started</th>
                            <th className="px-4 py-2 font-medium">Duration</th>
                            <th className="px-4 py-2 font-medium text-center"><Wrench className="w-3 h-3 inline-block" /></th>
                            <th className="px-4 py-2 font-medium text-center">Chat</th>
                            <th className="px-4 py-2 font-medium" />
                        </tr>
                    </thead>
                    <tbody>
                        {executions.map(exec => (
                            <ExecutionRow
                                key={exec.id}
                                exec={exec}
                                agentMap={agentMap}
                                onClick={() => navigate(ROUTES.LEGACY_EXECUTION_DETAIL.replace(':executionId', exec.id))}
                            />
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

/* ── Main Page ────────────────────────────────────────────────────────────── */

export default function ExecutionListPage() {
    const { data: executions = [], isLoading } = useQuery<Execution[]>({
        queryKey: ['executions'],
        queryFn: () => listAllExecutions(),
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

    const running = useMemo(() => executions.filter(e => e.status === 'running'), [executions])
    const queued = useMemo(() => executions.filter(e => e.status === 'queued'), [executions])
    const awaitingApproval = useMemo(() => executions.filter(e => e.status === 'paused_hitl'), [executions])
    const recent = useMemo(
        () => executions.filter(e => e.status === 'completed' || e.status === 'failed' || e.status === 'cancelled').slice(0, 20),
        [executions],
    )

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (executions.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                    <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-muted-foreground">No agent executions yet.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Start a chat to see executions here.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-5 animate-fade-in">
            {/* Active: Running */}
            {running.length > 0 && (
                <ExecutionWidget
                    title="Running"
                    icon={<Play className="w-3.5 h-3.5 text-emerald-400" />}
                    iconColor="bg-emerald-500/10"
                    executions={running}
                    agentMap={agentMap}
                    emptyText=""
                />
            )}

            {/* Awaiting Approval */}
            {awaitingApproval.length > 0 && (
                <ExecutionWidget
                    title="Awaiting Approval"
                    icon={<Pause className="w-3.5 h-3.5 text-amber-400" />}
                    iconColor="bg-amber-500/10"
                    executions={awaitingApproval}
                    agentMap={agentMap}
                    emptyText=""
                />
            )}

            {/* Queued */}
            {queued.length > 0 && (
                <ExecutionWidget
                    title="Queued"
                    icon={<Timer className="w-3.5 h-3.5 text-gray-400" />}
                    iconColor="bg-gray-500/10"
                    executions={queued}
                    agentMap={agentMap}
                    emptyText=""
                />
            )}

            {/* Recent (completed / failed / cancelled) */}
            <ExecutionWidget
                title="Recent Executions"
                icon={<Clock className="w-3.5 h-3.5 text-blue-400" />}
                iconColor="bg-blue-500/10"
                executions={recent}
                agentMap={agentMap}
                emptyText="No completed executions yet."
            />
        </div>
    )
}
