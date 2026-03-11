import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getExecution, getAgent } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import {
    Brain, Wrench, Shield, Bot, Clock, ArrowLeft, MessageCircle,
    Activity, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

type ExecutionStatus = 'queued' | 'running' | 'paused_hitl' | 'completed' | 'failed' | 'cancelled'

interface Execution {
    id: string
    workspace_id: string
    conversation_id: string
    agent_id: string
    status: ExecutionStatus
    iteration_count: number
    tool_calls_count: number
    timeline: TimelineEntry[]
    error_message: string | null
    started_at: string
    completed_at: string | null
}

type TimelineEntry =
    | { type: 'thinking'; content: string }
    | { type: 'tool_call'; call_id: string; tool_name: string; arguments: any; success?: boolean; output?: any; error?: string }
    | { type: 'hitl_request'; hitl_id: string; tool_id: string; action_summary: string; risk_level: string; status: string }
    | { type: 'subagent_invocation'; call_id: string; tool_name: string; arguments: any; success: boolean; subagent_response: string; subagent_timeline: any[] }

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ExecutionStatus, { label: string; className: string; icon: React.ReactNode }> = {
    queued:      { label: 'Queued',    className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',        icon: <Clock className="h-3 w-3" /> },
    running:     { label: 'Running',   className: 'bg-sky-500/15 text-sky-400 border-sky-500/30',           icon: <Activity className="h-3 w-3 animate-pulse" /> },
    paused_hitl: { label: 'Awaiting Approval', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <Shield className="h-3 w-3" /> },
    completed:   { label: 'Completed', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:      { label: 'Failed',    className: 'bg-red-500/15 text-red-400 border-red-500/30',           icon: <XCircle className="h-3 w-3" /> },
    cancelled:   { label: 'Cancelled', className: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30',        icon: <XCircle className="h-3 w-3" /> },
}

function StatusBadge({ status }: { status: ExecutionStatus }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
            {cfg.icon}
            {cfg.label}
        </span>
    )
}

// ── Duration helper ──────────────────────────────────────────────────────────

function formatDuration(startedAt: string, completedAt: string | null): string {
    const start = new Date(startedAt).getTime()
    const end = completedAt ? new Date(completedAt).getTime() : Date.now()
    const diffMs = end - start
    if (diffMs < 1000) return `${diffMs}ms`
    const secs = Math.floor(diffMs / 1000)
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    const remSecs = secs % 60
    if (mins < 60) return `${mins}m ${remSecs}s`
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return `${hrs}h ${remMins}m`
}

// ── JSON preview ─────────────────────────────────────────────────────────────

function JsonPreview({ data, maxHeight = 'max-h-64' }: { data: any; maxHeight?: string }) {
    if (data === null || data === undefined) {
        return <span className="text-[11px] text-muted-foreground/40 italic">null</span>
    }
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    return (
        <pre className={`overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 border border-white/5 px-3 py-2 text-[11px] text-foreground/70 font-mono ${maxHeight}`}>
            {text}
        </pre>
    )
}

// ── Collapsible section ──────────────────────────────────────────────────────

function CollapsibleSection({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors"
            >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {label}
            </button>
            {open && <div className="mt-1.5">{children}</div>}
        </div>
    )
}

// ── Timeline entry components ────────────────────────────────────────────────

function ThinkingEntry({ entry }: { entry: Extract<TimelineEntry, { type: 'thinking' }> }) {
    const [expanded, setExpanded] = useState(false)
    const isLong = entry.content.length > 200
    return (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm px-4 py-3">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-2 w-full text-left"
            >
                {isLong
                    ? (expanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />)
                    : <span className="w-3.5 h-3.5 shrink-0" />}
                <Brain className="h-4 w-4 text-zinc-500 shrink-0" />
                <span className="text-xs font-medium text-zinc-400">Thinking</span>
            </button>
            <div className={`mt-2 pl-10 ${isLong && !expanded ? 'line-clamp-3' : ''}`}>
                <p className="text-[12px] leading-relaxed text-muted-foreground/60 whitespace-pre-wrap">
                    {entry.content}
                </p>
            </div>
        </div>
    )
}

function ToolCallEntry({ entry }: { entry: Extract<TimelineEntry, { type: 'tool_call' }> }) {
    const [expanded, setExpanded] = useState(false)
    const hasResult = entry.success !== undefined
    const isSuccess = entry.success === true

    const category = entry.tool_name.split('.')[0] ?? entry.tool_name
    const action = entry.tool_name.split('.').slice(1).join('.')

    return (
        <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.03] backdrop-blur-sm px-4 py-3">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-2 w-full text-left"
            >
                {expanded ? <ChevronDown className="h-3.5 w-3.5 text-cyan-500/70 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-cyan-500/70 shrink-0" />}
                <Wrench className="h-4 w-4 text-cyan-500/70 shrink-0" />
                <span className="flex items-baseline gap-1 min-w-0 flex-1">
                    <span className="text-xs text-cyan-400/60">{category}</span>
                    {action && (
                        <>
                            <span className="text-cyan-500/30">.</span>
                            <span className="text-xs font-medium text-cyan-300/80">{action}</span>
                        </>
                    )}
                </span>
                {hasResult && (
                    isSuccess
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                )}
                {!hasResult && <Activity className="h-3.5 w-3.5 text-cyan-400/50 animate-pulse shrink-0" />}
            </button>
            {expanded && (
                <div className="mt-3 pl-10 space-y-3">
                    {entry.arguments && Object.keys(entry.arguments).length > 0 && (
                        <CollapsibleSection label="Input" defaultOpen>
                            <JsonPreview data={entry.arguments} />
                        </CollapsibleSection>
                    )}
                    {hasResult && isSuccess && entry.output !== undefined && (
                        <CollapsibleSection label="Output" defaultOpen>
                            <JsonPreview data={entry.output} />
                        </CollapsibleSection>
                    )}
                    {hasResult && !isSuccess && entry.error && (
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-red-400/70 font-medium mb-1">Error</div>
                            <p className="text-[12px] text-red-400/80 break-words">{entry.error}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function HITLEntry({ entry }: { entry: Extract<TimelineEntry, { type: 'hitl_request' }> }) {
    const riskColors: Record<string, string> = {
        low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        high: 'text-red-400 bg-red-500/10 border-red-500/20',
    }
    const statusLabels: Record<string, { label: string; icon: React.ReactNode }> = {
        pending:  { label: 'Pending',  icon: <Clock className="h-3 w-3 text-amber-400" /> },
        approved: { label: 'Approved', icon: <CheckCircle2 className="h-3 w-3 text-emerald-400" /> },
        denied:   { label: 'Denied',   icon: <XCircle className="h-3 w-3 text-red-400" /> },
    }
    const riskCls = riskColors[entry.risk_level] ?? riskColors.medium
    const statusCfg = statusLabels[entry.status] ?? statusLabels.pending

    return (
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.03] backdrop-blur-sm px-4 py-3">
            <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-500/70 shrink-0" />
                <span className="text-xs font-medium text-amber-300/80 flex-1">Human Approval Required</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${riskCls}`}>
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {entry.risk_level}
                </span>
            </div>
            <div className="mt-2 pl-6 space-y-2">
                <p className="text-[12px] text-foreground/70 leading-relaxed">{entry.action_summary}</p>
                <div className="flex items-center gap-1.5">
                    {statusCfg.icon}
                    <span className="text-[11px] text-muted-foreground/60">{statusCfg.label}</span>
                </div>
            </div>
        </div>
    )
}

function SubagentEntry({ entry }: { entry: Extract<TimelineEntry, { type: 'subagent_invocation' }> }) {
    const [expanded, setExpanded] = useState(false)
    return (
        <div className="rounded-xl border border-purple-500/15 bg-purple-500/[0.03] backdrop-blur-sm px-4 py-3">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-2 w-full text-left"
            >
                {expanded ? <ChevronDown className="h-3.5 w-3.5 text-purple-500/70 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-purple-500/70 shrink-0" />}
                <Bot className="h-4 w-4 text-purple-500/70 shrink-0" />
                <span className="text-xs font-medium text-purple-300/80 flex-1">
                    Subagent: <span className="font-mono text-purple-400/60">{entry.tool_name}</span>
                </span>
                {entry.success
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
            </button>
            {expanded && (
                <div className="mt-3 pl-10 space-y-3">
                    {entry.arguments && Object.keys(entry.arguments).length > 0 && (
                        <CollapsibleSection label="Arguments">
                            <JsonPreview data={entry.arguments} />
                        </CollapsibleSection>
                    )}
                    {entry.subagent_response && (
                        <CollapsibleSection label="Response" defaultOpen>
                            <JsonPreview data={entry.subagent_response} />
                        </CollapsibleSection>
                    )}
                    {entry.subagent_timeline && entry.subagent_timeline.length > 0 && (
                        <CollapsibleSection label={`Nested Timeline (${entry.subagent_timeline.length} steps)`}>
                            <div className="space-y-2 border-l-2 border-purple-500/20 pl-4 mt-1">
                                {entry.subagent_timeline.map((nestedEntry: any, idx: number) => (
                                    <TimelineEntryCard key={idx} entry={nestedEntry} />
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Timeline entry dispatcher ────────────────────────────────────────────────

function TimelineEntryCard({ entry }: { entry: TimelineEntry }) {
    switch (entry.type) {
        case 'thinking':
            return <ThinkingEntry entry={entry} />
        case 'tool_call':
            return <ToolCallEntry entry={entry} />
        case 'hitl_request':
            return <HITLEntry entry={entry} />
        case 'subagent_invocation':
            return <SubagentEntry entry={entry} />
        default:
            return null
    }
}

// ── Timeline icon for the connecting line ────────────────────────────────────

function TimelineDot({ type }: { type: string }) {
    const base = 'h-3 w-3 shrink-0'
    switch (type) {
        case 'thinking':
            return <Brain className={`${base} text-zinc-500`} />
        case 'tool_call':
            return <Wrench className={`${base} text-cyan-500/70`} />
        case 'hitl_request':
            return <Shield className={`${base} text-amber-500/70`} />
        case 'subagent_invocation':
            return <Bot className={`${base} text-purple-500/70`} />
        default:
            return <Activity className={`${base} text-muted-foreground/40`} />
    }
}

// ── Main page component ──────────────────────────────────────────────────────

export default function ExecutionMonitorPage() {
    const { workspaceId, executionId } = useParams<{ workspaceId: string; executionId: string }>()
    const navigate = useNavigate()

    const { data: execution, isLoading, error } = useQuery<Execution>({
        queryKey: ['execution', workspaceId, executionId],
        queryFn: () => getExecution(workspaceId!, executionId!),
        enabled: !!workspaceId && !!executionId,
        refetchInterval: (query) => {
            const status = query.state.data?.status
            return status === 'running' || status === 'queued' ? 3000 : false
        },
    })

    const { data: agent } = useQuery({
        queryKey: ['agent', execution?.agent_id],
        queryFn: () => getAgent(execution!.agent_id),
        enabled: !!execution?.agent_id,
    })

    // ── Loading state ────────────────────────────────────────────────────────

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Activity className="h-6 w-6 text-accent/60 animate-pulse" />
                    <span className="text-sm text-muted-foreground/60">Loading execution...</span>
                </div>
            </div>
        )
    }

    // ── Error state ──────────────────────────────────────────────────────────

    if (error || !execution) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="flex flex-col items-center gap-3 text-center">
                    <XCircle className="h-6 w-6 text-red-400/60" />
                    <span className="text-sm text-red-400/80">Failed to load execution</span>
                    <button
                        onClick={() => navigate(-1)}
                        className="text-xs text-muted-foreground/50 hover:text-foreground/70 transition-colors underline underline-offset-2"
                    >
                        Go back
                    </button>
                </div>
            </div>
        )
    }

    const agentName = agent?.name ?? 'Agent'
    const isLive = execution.status === 'running' || execution.status === 'queued'

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

                {/* ── Navigation ─────────────────────────────────────────────── */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(`/settings`)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-foreground/70 transition-colors"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to executions
                    </button>
                    {execution.conversation_id && (
                        <button
                            onClick={() => navigate(`/w/${workspaceId}/agent/${execution.conversation_id}`)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-foreground/70 transition-colors ml-auto"
                        >
                            <MessageCircle className="h-3.5 w-3.5" />
                            View conversation
                        </button>
                    )}
                </div>

                {/* ── Header ─────────────────────────────────────────────────── */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md px-6 py-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-3">
                                <Bot className="h-5 w-5 text-accent/60" />
                                <h1 className="text-lg font-semibold text-foreground/90">{agentName}</h1>
                                <StatusBadge status={execution.status} />
                                {isLive && (
                                    <span className="flex items-center gap-1 text-[10px] text-sky-400/60">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
                                        </span>
                                        LIVE
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground/40 font-mono">
                                {execution.id}
                            </p>
                        </div>
                    </div>

                    {/* ── Metadata stats ──────────────────────────────────────── */}
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                        <MetaStat
                            icon={<Clock className="h-3.5 w-3.5" />}
                            label="Started"
                            value={formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })}
                        />
                        <MetaStat
                            icon={<Activity className="h-3.5 w-3.5" />}
                            label="Duration"
                            value={formatDuration(execution.started_at, execution.completed_at)}
                        />
                        <MetaStat
                            icon={<Brain className="h-3.5 w-3.5" />}
                            label="Iterations"
                            value={String(execution.iteration_count)}
                        />
                        <MetaStat
                            icon={<Wrench className="h-3.5 w-3.5" />}
                            label="Tool calls"
                            value={String(execution.tool_calls_count)}
                        />
                    </div>

                    {/* ── Error message ───────────────────────────────────────── */}
                    {execution.error_message && (
                        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-4 py-2.5">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-400/80" />
                                <span className="text-[11px] font-medium text-red-400/80 uppercase tracking-wide">Error</span>
                            </div>
                            <p className="text-xs text-red-400/70 break-words">{execution.error_message}</p>
                        </div>
                    )}
                </div>

                {/* ── Timeline ───────────────────────────────────────────────── */}
                <div>
                    <h2 className="text-sm font-medium text-foreground/70 mb-4 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-accent/50" />
                        Timeline
                        <span className="text-muted-foreground/40 font-normal">
                            ({execution.timeline?.length ?? 0} entries)
                        </span>
                    </h2>

                    {(!execution.timeline || execution.timeline.length === 0) ? (
                        <div className="rounded-2xl border border-white/[0.04] bg-white/[0.01] px-6 py-12 text-center">
                            <Activity className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground/40">
                                {isLive ? 'Waiting for timeline events...' : 'No timeline entries recorded.'}
                            </p>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Vertical connecting line */}
                            <div className="absolute left-[13px] top-4 bottom-4 w-px bg-white/[0.06]" />

                            <div className="space-y-3">
                                {execution.timeline.map((entry, idx) => (
                                    <div key={idx} className="relative flex gap-4">
                                        {/* Dot on the line */}
                                        <div className="relative z-10 mt-3.5 flex items-center justify-center h-[26px] w-[26px] rounded-full bg-background border border-white/[0.08] shrink-0">
                                            <TimelineDot type={entry.type} />
                                        </div>
                                        {/* Card */}
                                        <div className="flex-1 min-w-0">
                                            <TimelineEntryCard entry={entry} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}

// ── Small stat display ───────────────────────────────────────────────────────

function MetaStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground/40">{icon}</span>
            <span className="text-muted-foreground/50">{label}</span>
            <span className="text-foreground/70 font-medium">{value}</span>
        </div>
    )
}
