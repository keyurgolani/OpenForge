import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getExecutionById, getAgent, getConversation } from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { formatDistanceToNow } from 'date-fns'
import {
    Brain, Wrench, Bot, Clock, ArrowLeft, MessageCircle, User,
    Activity, CheckCircle2, XCircle, AlertTriangle, Shield, Square,
} from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { AgentTimeline } from '@/components/agent'
import type { TimelineEntry } from '@/hooks/useStreamingChat'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

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

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="glass-card rounded-xl border border-border/60 px-4 py-3 flex items-center gap-3">
            <span className="text-muted-foreground/50">{icon}</span>
            <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">{label}</p>
                <p className="text-sm font-semibold text-foreground/80">{value}</p>
            </div>
        </div>
    )
}

// ── Main page component ──────────────────────────────────────────────────────

export default function ExecutionMonitorPage() {
    const { executionId } = useParams<{ executionId: string }>()
    const navigate = useNavigate()
    const [cancelling, setCancelling] = useState(false)

    const { data: execution, isLoading, error } = useQuery<Execution>({
        queryKey: ['execution', executionId],
        queryFn: () => getExecutionById(executionId!),
        enabled: !!executionId,
        refetchInterval: (query) => {
            const status = query.state.data?.status
            return status === 'running' || status === 'queued' || status === 'paused_hitl' ? 3000 : false
        },
    })

    const { data: agent } = useQuery({
        queryKey: ['agent', execution?.agent_id],
        queryFn: () => getAgent(execution!.agent_id),
        enabled: !!execution?.agent_id,
    })

    const { data: conversation } = useQuery({
        queryKey: ['conversation', execution?.workspace_id, execution?.conversation_id],
        queryFn: () => getConversation(execution!.workspace_id, execution!.conversation_id),
        enabled: !!execution?.workspace_id && !!execution?.conversation_id,
    })

    // WebSocket for cancel — only connect when execution is active
    const wsWorkspaceId = execution?.workspace_id ?? ''
    const { send, isConnected } = useWorkspaceWebSocket(wsWorkspaceId)

    const userMessage = conversation?.messages?.find((m: any) => m.role === 'user')
    const assistantMessages = conversation?.messages?.filter((m: any) => m.role === 'assistant') ?? []
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]

    const handleCancel = () => {
        if (!execution || !isConnected) return
        setCancelling(true)
        send({ type: 'chat_cancel', conversation_id: execution.conversation_id })
    }

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
    const isLive = execution.status === 'running' || execution.status === 'queued' || execution.status === 'paused_hitl'

    return (
        <div className="h-full overflow-y-auto">
            <div className="px-4 sm:px-6 py-5 space-y-5">

                {/* ── Navigation ─────────────────────────────────────────────── */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(`/executions`)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-foreground/70 transition-colors"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to executions
                    </button>
                    {execution.conversation_id && (
                        <button
                            onClick={() => navigate(`/w/${execution.workspace_id}/agent/${execution.conversation_id}`)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-foreground/70 transition-colors ml-auto"
                        >
                            <MessageCircle className="h-3.5 w-3.5" />
                            View conversation
                        </button>
                    )}
                </div>

                {/* ── Header: agent + status + live + cancel ──────────────────── */}
                <div className="flex flex-wrap items-center gap-3">
                    <Bot className="h-5 w-5 text-accent/60 shrink-0" />
                    <h1 className="text-lg font-semibold text-foreground/90">{agentName}</h1>
                    <StatusBadge status={execution.status} />
                    {isLive && (
                        <>
                            <span className="flex items-center gap-1.5 text-[10px] text-sky-400/60">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
                                </span>
                                LIVE
                            </span>
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={cancelling || !isConnected}
                                className="flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                                <Square className="h-3 w-3" />
                                {cancelling ? 'Cancelling...' : 'Stop'}
                            </button>
                        </>
                    )}
                    <p className="basis-full text-xs text-muted-foreground/40 font-mono">{execution.id}</p>
                </div>

                {/* ── Stat cards ─────────────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard
                        icon={<Clock className="h-4 w-4" />}
                        label="Started"
                        value={formatDistanceToNow(new Date(execution.started_at), { addSuffix: true })}
                    />
                    <StatCard
                        icon={<Activity className="h-4 w-4" />}
                        label="Duration"
                        value={formatDuration(execution.started_at, execution.completed_at)}
                    />
                    <StatCard
                        icon={<Brain className="h-4 w-4" />}
                        label="Iterations"
                        value={String(execution.iteration_count)}
                    />
                    <StatCard
                        icon={<Wrench className="h-4 w-4" />}
                        label="Tool Calls"
                        value={String(execution.tool_calls_count)}
                    />
                </div>

                {/* ── Error message ──────────────────────────────────────────── */}
                {execution.error_message && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-5 py-3">
                        <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400/80" />
                            <span className="text-[11px] font-medium text-red-400/80 uppercase tracking-wide">Error</span>
                        </div>
                        <p className="text-xs text-red-400/70 break-words">{execution.error_message}</p>
                    </div>
                )}

                {/* ── Two-column layout: Timeline + Context ─────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* ── Timeline (wide column) ────────────────────────────── */}
                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-sm font-medium text-foreground/70 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-accent/50" />
                            Timeline
                            <span className="text-muted-foreground/40 font-normal">
                                ({execution.timeline?.length ?? 0} entries)
                            </span>
                        </h2>

                        {(!execution.timeline || execution.timeline.length === 0) ? (
                            <div className="glass-card rounded-xl border border-border/60 px-6 py-12 text-center">
                                <Activity className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
                                <p className="text-xs text-muted-foreground/40">
                                    {isLive ? 'Waiting for timeline events...' : 'No timeline entries recorded.'}
                                </p>
                            </div>
                        ) : (
                            <AgentTimeline
                                timeline={execution.timeline}
                                workspaceId={execution.workspace_id}
                                conversationId={execution.conversation_id}
                                readonly
                                isStreaming={isLive}
                            />
                        )}
                    </div>

                    {/* ── Context sidebar (narrow column) ───────────────────── */}
                    <div className="space-y-4">
                        {/* User Request */}
                        {userMessage && (
                            <div className="glass-card rounded-xl border border-border/60 px-5 py-4">
                                <div className="flex items-center gap-2 mb-2.5">
                                    <User className="h-4 w-4 text-blue-400/70" />
                                    <span className="text-xs font-medium text-blue-400/80">User Request</span>
                                </div>
                                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                                    {userMessage.content}
                                </p>
                            </div>
                        )}

                        {/* Agent Response */}
                        {lastAssistantMessage && (
                            <div className="glass-card rounded-xl border border-emerald-500/15 px-5 py-4">
                                <div className="flex items-center gap-2 mb-2.5">
                                    <Bot className="h-4 w-4 text-emerald-400/70" />
                                    <span className="text-xs font-medium text-emerald-400/80">Agent Response</span>
                                </div>
                                <div
                                    className="markdown-content text-sm text-foreground/80 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: md.render(lastAssistantMessage.content ?? '') }}
                                />
                            </div>
                        )}

                        {/* No context available */}
                        {!userMessage && !lastAssistantMessage && (
                            <div className="glass-card rounded-xl border border-border/60 px-5 py-8 text-center">
                                <MessageCircle className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
                                <p className="text-xs text-muted-foreground/40">No conversation context available.</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    )
}
