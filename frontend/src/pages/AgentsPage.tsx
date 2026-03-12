import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    listAgents, updateAgent, triggerAgent,
    listAgentSchedules, createAgentSchedule, updateAgentSchedule, deleteAgentSchedule,
    listAllExecutions, listTargets,
} from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import {
    Bot, Play, Clock, Settings2, Plus, Trash2, Edit, Target, Calendar,
    Loader2, X, Check, ChevronDown, ChevronUp, ExternalLink, Wrench, Activity,
    ToggleLeft, ToggleRight, Save,
} from 'lucide-react'

/* ── Types ───────────────────────────────────────────────────────────────── */

interface AgentRaw {
    id: string
    name: string
    description: string | null
    is_system: boolean
    icon: string | null
    config: Record<string, any>
}

interface Agent {
    id: string
    name: string
    description: string | null
    is_system: boolean
    icon: string | null
    system_prompt: string | null
    tool_categories: string[]
    rag_enabled: boolean
    rag_threshold: number
    rag_limit: number
    max_iterations: number
}

function normalizeAgent(raw: AgentRaw): Agent {
    const c = raw.config ?? {}
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        is_system: raw.is_system,
        icon: raw.icon,
        system_prompt: c.system_prompt ?? null,
        tool_categories: c.allowed_tool_categories ?? [],
        rag_enabled: c.rag_enabled ?? false,
        rag_threshold: c.rag_score_threshold ?? 0.35,
        rag_limit: c.rag_limit ?? 5,
        max_iterations: c.max_iterations ?? 20,
    }
}

interface Schedule {
    id: string
    agent_id: string
    name: string
    instruction: string
    cron_expression: string
    is_enabled: boolean
    next_run_at: string | null
    created_at: string
}

interface Execution {
    id: string
    workspace_id: string
    conversation_id: string
    agent_id: string
    agent_name: string | null
    workspace_name: string | null
    status: 'queued' | 'running' | 'paused_hitl' | 'completed' | 'failed' | 'cancelled'
    iteration_count: number
    tool_calls_count: number
    started_at: string
    completed_at: string | null
}

interface TargetItem {
    id: string
    name: string
    description: string | null
    knowledge_id: string | null
    updated_at: string
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; classes: string; pulse?: boolean }> = {
    running:     { label: 'Running',   classes: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30', pulse: true },
    completed:   { label: 'Done',      classes: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30' },
    failed:      { label: 'Failed',    classes: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30' },
    cancelled:   { label: 'Cancelled', classes: 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30' },
    queued:      { label: 'Queued',    classes: 'bg-gray-500/15 text-gray-400 ring-1 ring-gray-500/30' },
    paused_hitl: { label: 'Awaiting',  classes: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30' },
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

const CRON_PRESETS = [
    { label: 'Every Hour', value: '0 * * * *' },
    { label: 'Daily',      value: '0 9 * * *' },
    { label: 'Weekly',     value: '0 9 * * 1' },
    { label: 'Custom',     value: '' },
] as const

/* ── Trigger Modal ───────────────────────────────────────────────────────── */

function TriggerModal({ agent, workspaceId, onClose }: { agent: Agent; workspaceId: string; onClose: () => void }) {
    const [instruction, setInstruction] = useState('')
    const [success, setSuccess] = useState<string | null>(null)
    const navigate = useNavigate()

    const mutation = useMutation({
        mutationFn: () => triggerAgent(agent.id, { instruction, workspace_id: workspaceId }),
        onSuccess: (data) => {
            setSuccess(data?.execution_id ?? 'started')
        },
    })

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-lg rounded-2xl border border-border/60 p-6 space-y-4 animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Play className="w-4 h-4 text-accent" />
                        Trigger {agent.name}
                    </h2>
                    <button className="btn-ghost p-1.5" onClick={onClose}><X className="w-4 h-4" /></button>
                </div>

                {success ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-emerald-400 text-sm">
                            <Check className="w-4 h-4" />
                            Agent triggered successfully.
                        </div>
                        {typeof success === 'string' && success !== 'started' && (
                            <button
                                className="btn-primary text-xs py-1.5 px-3"
                                onClick={() => {
                                    navigate(`/w/${workspaceId}/executions/${success}`)
                                    onClose()
                                }}
                            >
                                <ExternalLink className="w-3 h-3" />
                                View Execution
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="text-xs text-muted-foreground block mb-1.5">Instruction</label>
                            <textarea
                                className="input w-full h-28 resize-none"
                                placeholder="Describe what the agent should do..."
                                value={instruction}
                                onChange={e => setInstruction(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button className="btn-ghost text-xs py-1.5 px-3" onClick={onClose}>Cancel</button>
                            <button
                                className="btn-primary text-xs py-1.5 px-3"
                                onClick={() => mutation.mutate()}
                                disabled={!instruction.trim() || mutation.isPending}
                            >
                                {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                Run
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

/* ── Schedule Modal ──────────────────────────────────────────────────────── */

function ScheduleModal({ agent, workspaceId, onClose }: { agent: Agent; workspaceId: string; onClose: () => void }) {
    const qc = useQueryClient()
    const [name, setName] = useState('')
    const [instruction, setInstruction] = useState('')
    const [cronPreset, setCronPreset] = useState<string>('0 9 * * *')
    const [customCron, setCustomCron] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)

    const cronValue = cronPreset === '' ? customCron : cronPreset
    const isCustom = cronPreset === ''

    const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
        queryKey: ['agent-schedules', workspaceId],
        queryFn: () => listAgentSchedules(workspaceId),
        enabled: !!workspaceId,
    })

    const agentSchedules = useMemo(
        () => (schedules as Schedule[]).filter(s => s.agent_id === agent.id),
        [schedules, agent.id],
    )

    const createMutation = useMutation({
        mutationFn: () => createAgentSchedule(workspaceId, {
            agent_id: agent.id,
            name,
            instruction,
            cron_expression: cronValue,
            is_enabled: true,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['agent-schedules', workspaceId] })
            setName('')
            setInstruction('')
            setEditingId(null)
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => updateAgentSchedule(workspaceId, id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-schedules', workspaceId] }),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAgentSchedule(workspaceId, id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-schedules', workspaceId] }),
    })

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-xl rounded-2xl border border-border/60 p-6 space-y-5 animate-fade-in max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-accent" />
                        Schedules for {agent.name}
                    </h2>
                    <button className="btn-ghost p-1.5" onClick={onClose}><X className="w-4 h-4" /></button>
                </div>

                {/* Create form */}
                <div className="space-y-3 border border-border/40 rounded-xl p-4">
                    <h3 className="text-sm font-medium">New Schedule</h3>
                    <input
                        className="input w-full"
                        placeholder="Schedule name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                    <textarea
                        className="input w-full h-20 resize-none"
                        placeholder="Instruction for the agent..."
                        value={instruction}
                        onChange={e => setInstruction(e.target.value)}
                    />

                    <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">Frequency</label>
                        <div className="flex flex-wrap gap-1.5">
                            {CRON_PRESETS.map(p => (
                                <button
                                    key={p.label}
                                    type="button"
                                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                        (p.value === '' ? isCustom : cronPreset === p.value)
                                            ? 'bg-accent/15 border-accent/40 text-accent'
                                            : 'border-border/60 text-muted-foreground hover:bg-muted/30'
                                    }`}
                                    onClick={() => setCronPreset(p.value)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        {isCustom && (
                            <input
                                className="input w-full mt-2"
                                placeholder="* * * * * (cron expression)"
                                value={customCron}
                                onChange={e => setCustomCron(e.target.value)}
                            />
                        )}
                    </div>

                    <button
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => createMutation.mutate()}
                        disabled={!name.trim() || !instruction.trim() || !cronValue.trim() || createMutation.isPending}
                    >
                        {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Create Schedule
                    </button>
                </div>

                {/* Existing schedules */}
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Existing Schedules</h3>
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    {!isLoading && agentSchedules.length === 0 && (
                        <p className="text-xs text-muted-foreground/60">No schedules configured for this agent.</p>
                    )}
                    {agentSchedules.map(sched => (
                        <div key={sched.id} className="glass-card rounded-xl px-4 py-3 space-y-2 border border-border/40">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium truncate">{sched.name}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted/20 px-1.5 py-0.5 rounded">
                                        {sched.cron_expression}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                        className="btn-ghost p-1"
                                        title={sched.is_enabled ? 'Disable' : 'Enable'}
                                        onClick={() => updateMutation.mutate({ id: sched.id, data: { is_enabled: !sched.is_enabled } })}
                                    >
                                        {sched.is_enabled
                                            ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                                            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                                    </button>
                                    <button
                                        className="btn-ghost p-1"
                                        title="Edit"
                                        onClick={() => setEditingId(editingId === sched.id ? null : sched.id)}
                                    >
                                        <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        className="btn-ghost p-1 text-red-400/70 hover:text-red-400"
                                        title="Delete"
                                        onClick={() => deleteMutation.mutate(sched.id)}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{sched.instruction}</p>
                            {sched.next_run_at && (
                                <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Next: {formatDistanceToNow(new Date(sched.next_run_at), { addSuffix: true })}
                                </p>
                            )}
                            {editingId === sched.id && (
                                <ScheduleInlineEditor
                                    schedule={sched}
                                    onSave={(data) => {
                                        updateMutation.mutate({ id: sched.id, data })
                                        setEditingId(null)
                                    }}
                                    onCancel={() => setEditingId(null)}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function ScheduleInlineEditor({ schedule, onSave, onCancel }: { schedule: Schedule; onSave: (data: object) => void; onCancel: () => void }) {
    const [name, setName] = useState(schedule.name)
    const [instruction, setInstruction] = useState(schedule.instruction)
    const [cron, setCron] = useState(schedule.cron_expression)

    return (
        <div className="space-y-2 pt-2 border-t border-border/30">
            <input className="input w-full text-xs" value={name} onChange={e => setName(e.target.value)} placeholder="Name" />
            <textarea className="input w-full text-xs h-16 resize-none" value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Instruction" />
            <input className="input w-full text-xs" value={cron} onChange={e => setCron(e.target.value)} placeholder="Cron expression" />
            <div className="flex gap-1.5">
                <button className="btn-primary text-xs py-1 px-2.5" onClick={() => onSave({ name, instruction, cron_expression: cron })}>
                    <Save className="w-3 h-3" /> Save
                </button>
                <button className="btn-ghost text-xs py-1 px-2.5" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    )
}

/* ── Agent Configuration Modal ───────────────────────────────────────────── */

function ConfigureModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
    const qc = useQueryClient()
    const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt ?? '')
    const [ragEnabled, setRagEnabled] = useState(agent.rag_enabled)
    const [ragThreshold, setRagThreshold] = useState(agent.rag_threshold)
    const [ragLimit, setRagLimit] = useState(agent.rag_limit)
    const [maxIterations, setMaxIterations] = useState(agent.max_iterations)

    const mutation = useMutation({
        mutationFn: () => updateAgent(agent.id, {
            config: {
                system_prompt: systemPrompt,
                rag_enabled: ragEnabled,
                rag_score_threshold: ragThreshold,
                rag_limit: ragLimit,
                max_iterations: maxIterations,
            },
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['agents'] })
            onClose()
        },
    })

    const isSystem = agent.is_system

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-lg rounded-2xl border border-border/60 p-6 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-accent" />
                        Configure {agent.name}
                    </h2>
                    <button className="btn-ghost p-1.5" onClick={onClose}><X className="w-4 h-4" /></button>
                </div>

                {/* System Prompt */}
                <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">System Prompt</label>
                    <textarea
                        className="input w-full h-32 resize-none text-xs font-mono"
                        value={systemPrompt}
                        onChange={e => setSystemPrompt(e.target.value)}
                        readOnly={isSystem}
                        placeholder="System prompt for this agent..."
                    />
                    {isSystem && <p className="text-[10px] text-muted-foreground/60 mt-1">System agents have read-only prompts.</p>}
                </div>

                {/* Tool categories */}
                <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Tool Categories</label>
                    <div className="flex flex-wrap gap-1.5">
                        {(agent.tool_categories ?? []).map(cat => (
                            <span key={cat} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                                {cat}
                            </span>
                        ))}
                        {(!agent.tool_categories || agent.tool_categories.length === 0) && (
                            <span className="text-xs text-muted-foreground/60">All tools enabled</span>
                        )}
                    </div>
                </div>

                {/* RAG Settings */}
                <div className="space-y-3 border border-border/40 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-medium">RAG (Knowledge Retrieval)</label>
                        <button
                            className="btn-ghost p-0.5"
                            onClick={() => setRagEnabled(!ragEnabled)}
                        >
                            {ragEnabled
                                ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                                : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                        </button>
                    </div>
                    {ragEnabled && (
                        <div className="space-y-2">
                            <div>
                                <label className="text-[10px] text-muted-foreground block mb-1">
                                    Threshold: {ragThreshold.toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={ragThreshold}
                                    onChange={e => setRagThreshold(parseFloat(e.target.value))}
                                    className="w-full accent-accent"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-muted-foreground block mb-1">
                                    Limit: {ragLimit}
                                </label>
                                <input
                                    type="range"
                                    min="1"
                                    max="20"
                                    step="1"
                                    value={ragLimit}
                                    onChange={e => setRagLimit(parseInt(e.target.value))}
                                    className="w-full accent-accent"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Max iterations */}
                <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">
                        Max Iterations: {maxIterations}
                    </label>
                    <input
                        type="range"
                        min="1"
                        max="50"
                        step="1"
                        value={maxIterations}
                        onChange={e => setMaxIterations(parseInt(e.target.value))}
                        className="w-full accent-accent"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button className="btn-ghost text-xs py-1.5 px-3" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => mutation.mutate()}
                        disabled={mutation.isPending}
                    >
                        {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function AgentsPage() {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()

    const [triggerAgent_, setTriggerAgent] = useState<Agent | null>(null)
    const [scheduleAgent, setScheduleAgent] = useState<Agent | null>(null)
    const [configureAgent, setConfigureAgent] = useState<Agent | null>(null)
    const [expandedSection, setExpandedSection] = useState<'executions' | 'targets' | null>('executions')

    /* ── Queries ─────────────────────────────────────────────────────────── */

    const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
        queryKey: ['agents'],
        queryFn: async () => {
            const raw: AgentRaw[] = await listAgents()
            return raw.map(normalizeAgent)
        },
    })

    const { data: executions = [] } = useQuery<Execution[]>({
        queryKey: ['executions-global'],
        queryFn: () => listAllExecutions(),
        refetchInterval: 8000,
    })

    const { data: targets = [] } = useQuery<TargetItem[]>({
        queryKey: ['targets', workspaceId],
        queryFn: () => listTargets(workspaceId),
        enabled: !!workspaceId,
    })

    const agentMap = useMemo(() => {
        const map: Record<string, string> = {}
        for (const a of agents) map[a.id] = a.name
        return map
    }, [agents])

    const recentExecs = useMemo(
        () => (executions as Execution[]).slice(0, 20),
        [executions],
    )

    /* ── Render ──────────────────────────────────────────────────────────── */

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-accent" />
                </div>
                <div>
                    <h1 className="text-lg font-semibold tracking-tight">Agents</h1>
                    <p className="text-xs text-muted-foreground">
                        {agents.length} agent{agents.length !== 1 ? 's' : ''} available
                    </p>
                </div>
            </div>

            {/* Loading state */}
            {agentsLoading && (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Agent Cards Grid */}
            {!agentsLoading && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {(agents as Agent[]).map(agent => (
                        <div
                            key={agent.id}
                            className="glass-card rounded-xl border border-border/60 p-5 space-y-3 hover:border-accent/30 transition-colors cursor-pointer group"
                            onClick={() => setConfigureAgent(agent)}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                                        {agent.icon ? (
                                            <span className="text-lg">{agent.icon}</span>
                                        ) : (
                                            <Bot className="w-4 h-4 text-accent" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold truncate">{agent.name}</h3>
                                        <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                            agent.is_system
                                                ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30'
                                                : 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30'
                                        }`}>
                                            {agent.is_system ? 'System' : 'Custom'}
                                        </span>
                                    </div>
                                </div>
                                <Settings2 className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-accent transition-colors flex-shrink-0 mt-1" />
                            </div>

                            {/* Description */}
                            {agent.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                            )}

                            {/* Badges */}
                            <div className="flex flex-wrap gap-1.5">
                                {agent.rag_enabled && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20">RAG</span>
                                )}
                                {(agent.tool_categories ?? []).slice(0, 3).map(cat => (
                                    <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border/40">
                                        {cat}
                                    </span>
                                ))}
                                {(agent.tool_categories ?? []).length > 3 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border/40">
                                        +{agent.tool_categories.length - 3}
                                    </span>
                                )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-1.5 pt-1">
                                <button
                                    className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5 border border-border/40 hover:border-accent/40 hover:text-accent"
                                    onClick={e => { e.stopPropagation(); setTriggerAgent(agent) }}
                                >
                                    <Play className="w-3 h-3" /> Trigger
                                </button>
                                <button
                                    className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5 border border-border/40 hover:border-accent/40 hover:text-accent"
                                    onClick={e => { e.stopPropagation(); setScheduleAgent(agent) }}
                                >
                                    <Clock className="w-3 h-3" /> Schedule
                                </button>
                                <button
                                    className="btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5 border border-border/40 hover:border-accent/40 hover:text-accent"
                                    onClick={e => { e.stopPropagation(); setConfigureAgent(agent) }}
                                >
                                    <Settings2 className="w-3 h-3" /> Configure
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Recent Executions Section */}
            <div className="space-y-3">
                <button
                    className="flex items-center gap-2 text-sm font-medium text-foreground/90 hover:text-foreground transition-colors"
                    onClick={() => setExpandedSection(expandedSection === 'executions' ? null : 'executions')}
                >
                    <Activity className="w-4 h-4 text-accent" />
                    Recent Executions
                    <span className="text-xs text-muted-foreground">({recentExecs.length})</span>
                    {expandedSection === 'executions'
                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {expandedSection === 'executions' && (
                    <>
                        {recentExecs.length === 0 ? (
                            <div className="text-center py-8 glass-card rounded-xl">
                                <Activity className="w-8 h-8 mx-auto mb-2 opacity-25" />
                                <p className="text-xs text-muted-foreground/60">No executions yet.</p>
                            </div>
                        ) : (
                            <div className="glass-card rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                                            <th className="px-4 py-2.5 font-medium">Status</th>
                                            <th className="px-4 py-2.5 font-medium">Agent</th>
                                            <th className="px-4 py-2.5 font-medium">Duration</th>
                                            <th className="px-4 py-2.5 font-medium text-center">
                                                <Wrench className="w-3 h-3 inline-block" />
                                            </th>
                                            <th className="px-4 py-2.5 font-medium">Started</th>
                                            <th className="px-4 py-2.5 font-medium" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentExecs.map(exec => (
                                            <tr
                                                key={exec.id}
                                                className="border-b border-border/30 last:border-b-0 hover:bg-white/[0.03] cursor-pointer transition-colors group"
                                                onClick={() => navigate(`/w/${exec.workspace_id}/executions/${exec.id}`)}
                                            >
                                                <td className="px-4 py-2.5">
                                                    <StatusBadge status={exec.status} />
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <div className="text-sm text-foreground/90">
                                                        {exec.agent_name ?? agentMap[exec.agent_id] ?? 'Unknown'}
                                                    </div>
                                                    {exec.workspace_name && (
                                                        <div className="text-[10px] text-muted-foreground/60">{exec.workspace_name}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                                    {formatDuration(exec.started_at, exec.completed_at)}
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Wrench className="w-3 h-3" /> {exec.tool_calls_count}
                                                    </span>
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
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Continuous Targets Section */}
            <div className="space-y-3">
                <button
                    className="flex items-center gap-2 text-sm font-medium text-foreground/90 hover:text-foreground transition-colors"
                    onClick={() => setExpandedSection(expandedSection === 'targets' ? null : 'targets')}
                >
                    <Target className="w-4 h-4 text-accent" />
                    Continuous Targets
                    <span className="text-xs text-muted-foreground">({(targets as TargetItem[]).length})</span>
                    {expandedSection === 'targets'
                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {expandedSection === 'targets' && (
                    <>
                        {(targets as TargetItem[]).length === 0 ? (
                            <div className="text-center py-8 glass-card rounded-xl">
                                <Target className="w-8 h-8 mx-auto mb-2 opacity-25" />
                                <p className="text-xs text-muted-foreground/60">No continuous targets configured.</p>
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {(targets as TargetItem[]).map(target => (
                                    <div
                                        key={target.name}
                                        className="glass-card rounded-xl border border-border/60 p-4 space-y-2 hover:border-accent/30 transition-colors cursor-pointer"
                                        onClick={() => {
                                            if (target.knowledge_id) {
                                                navigate(`/w/${workspaceId}/knowledge/${target.knowledge_id}`)
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Target className="w-4 h-4 text-accent/70" />
                                            <span className="text-sm font-medium truncate">{target.name}</span>
                                        </div>
                                        {target.updated_at && (
                                            <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Updated {formatDistanceToNow(new Date(target.updated_at), { addSuffix: true })}
                                            </p>
                                        )}
                                        {target.knowledge_id && (
                                            <span className="text-[10px] text-accent/60 flex items-center gap-1">
                                                <ExternalLink className="w-3 h-3" /> View knowledge
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modals */}
            {triggerAgent_ && (
                <TriggerModal
                    agent={triggerAgent_}
                    workspaceId={workspaceId}
                    onClose={() => setTriggerAgent(null)}
                />
            )}
            {scheduleAgent && (
                <ScheduleModal
                    agent={scheduleAgent}
                    workspaceId={workspaceId}
                    onClose={() => setScheduleAgent(null)}
                />
            )}
            {configureAgent && (
                <ConfigureModal
                    agent={configureAgent}
                    onClose={() => setConfigureAgent(null)}
                />
            )}
        </div>
    )
}
