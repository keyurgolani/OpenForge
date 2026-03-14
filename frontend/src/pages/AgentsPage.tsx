import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    listAgents, updateAgent, triggerAgent,
    listAgentSchedules, createAgentSchedule, updateAgentSchedule, deleteAgentSchedule,
    listTargets, listWorkspaces, getToolRegistry,
} from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import {
    Bot, Play, Clock, Settings2, Plus, Trash2, Edit, Target, Calendar,
    Loader2, X, Check, ChevronDown, ChevronUp,
    ExternalLink, Shield, Search,
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
    max_iterations: number
    tool_overrides: Record<string, string>
    max_tool_calls_per_minute: number
    max_tool_calls_per_execution: number
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
        max_iterations: c.max_iterations ?? 20,
        tool_overrides: c.tool_overrides ?? {},
        max_tool_calls_per_minute: c.max_tool_calls_per_minute ?? 30,
        max_tool_calls_per_execution: c.max_tool_calls_per_execution ?? 200,
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

interface TargetItem {
    id: string
    name: string
    description: string | null
    knowledge_id: string | null
    updated_at: string
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const CRON_PRESETS = [
    { label: 'Every Hour', value: '0 * * * *' },
    { label: 'Daily',      value: '0 9 * * *' },
    { label: 'Weekly',     value: '0 9 * * 1' },
    { label: 'Custom',     value: '' },
] as const

/* ── Trigger Modal ───────────────────────────────────────────────────────── */

function TriggerModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
    const [instruction, setInstruction] = useState('')
    const [success, setSuccess] = useState<string | null>(null)
    const navigate = useNavigate()
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const wsList = workspaces as { id: string; name: string }[]
    const [selectedWs, setSelectedWs] = useState('')

    useEffect(() => {
        if (!selectedWs && wsList.length > 0) setSelectedWs(wsList[0].id)
    }, [wsList, selectedWs])

    const mutation = useMutation({
        mutationFn: () => triggerAgent(agent.id, { instruction, workspace_id: selectedWs }),
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
                                    navigate(`/executions/${success}`)
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
                            <label className="text-xs text-muted-foreground block mb-1.5">Workspace</label>
                            <select className="input w-full text-sm" value={selectedWs} onChange={e => setSelectedWs(e.target.value)}>
                                {wsList.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                            </select>
                        </div>
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
                                disabled={!instruction.trim() || !selectedWs || mutation.isPending}
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

function ScheduleModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
    const qc = useQueryClient()
    const [name, setName] = useState('')
    const [instruction, setInstruction] = useState('')
    const [cronPreset, setCronPreset] = useState<string>('0 9 * * *')
    const [customCron, setCustomCron] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const wsList = workspaces as { id: string; name: string }[]
    const [selectedWs, setSelectedWs] = useState('')

    useEffect(() => {
        if (!selectedWs && wsList.length > 0) setSelectedWs(wsList[0].id)
    }, [wsList, selectedWs])

    const cronValue = cronPreset === '' ? customCron : cronPreset
    const isCustom = cronPreset === ''

    const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
        queryKey: ['agent-schedules', selectedWs],
        queryFn: () => listAgentSchedules(selectedWs),
        enabled: !!selectedWs,
    })

    const agentSchedules = useMemo(
        () => (schedules as Schedule[]).filter(s => s.agent_id === agent.id),
        [schedules, agent.id],
    )

    const createMutation = useMutation({
        mutationFn: () => createAgentSchedule(selectedWs, {
            agent_id: agent.id,
            name,
            instruction,
            cron_expression: cronValue,
            is_enabled: true,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['agent-schedules', selectedWs] })
            setName('')
            setInstruction('')
            setEditingId(null)
        },
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: object }) => updateAgentSchedule(selectedWs, id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-schedules', selectedWs] }),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAgentSchedule(selectedWs, id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-schedules', selectedWs] }),
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

                {/* Workspace selector */}
                <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Workspace</label>
                    <select className="input w-full text-sm" value={selectedWs} onChange={e => setSelectedWs(e.target.value)}>
                        {wsList.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
                    </select>
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

const PERM_OPTIONS = ['default', 'allowed', 'hitl', 'blocked'] as const
const PERM_COLORS: Record<string, string> = {
    default: 'bg-muted/40 text-muted-foreground',
    allowed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    hitl: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    blocked: 'bg-red-500/15 text-red-400 border-red-500/30',
}

function ConfigureModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
    const qc = useQueryClient()
    const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt ?? '')
    const [maxIterations, setMaxIterations] = useState(agent.max_iterations)
    const [toolOverrides, setToolOverrides] = useState<Record<string, string>>(agent.tool_overrides)
    const [maxCallsPerMinute, setMaxCallsPerMinute] = useState(agent.max_tool_calls_per_minute)
    const [maxCallsPerExecution, setMaxCallsPerExecution] = useState(agent.max_tool_calls_per_execution)
    const [permSectionOpen, setPermSectionOpen] = useState(Object.keys(agent.tool_overrides).length > 0)
    const [permFilter, setPermFilter] = useState('')

    const { data: toolRegistry } = useQuery({
        queryKey: ['tool-registry'],
        queryFn: getToolRegistry,
        enabled: permSectionOpen,
    })

    const tools: { id: string; category: string; display_name: string; risk_level: string }[] =
        toolRegistry?.tools ?? []

    const filteredTools = useMemo(() => {
        if (!permFilter) return tools
        const q = permFilter.toLowerCase()
        return tools.filter(t => t.id.toLowerCase().includes(q) || t.display_name.toLowerCase().includes(q))
    }, [tools, permFilter])

    const toolsByCategory = useMemo(() => {
        const groups: Record<string, typeof filteredTools> = {}
        for (const t of filteredTools) {
            ;(groups[t.category] ??= []).push(t)
        }
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
    }, [filteredTools])

    const overrideCount = Object.values(toolOverrides).filter(v => v !== 'default').length

    function setOverride(toolId: string, perm: string) {
        setToolOverrides(prev => {
            const next = { ...prev }
            if (perm === 'default') {
                delete next[toolId]
            } else {
                next[toolId] = perm
            }
            return next
        })
    }

    const mutation = useMutation({
        mutationFn: () => updateAgent(agent.id, {
            config: {
                system_prompt: systemPrompt,
                max_iterations: maxIterations,
                tool_overrides: toolOverrides,
                max_tool_calls_per_minute: maxCallsPerMinute,
                max_tool_calls_per_execution: maxCallsPerExecution,
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
            <div className="glass-card w-full max-w-2xl rounded-2xl border border-border/60 p-6 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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

                {/* Per-Agent Tool Permissions */}
                <div className="border border-border/40 rounded-xl overflow-hidden">
                    <button
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                        onClick={() => setPermSectionOpen(!permSectionOpen)}
                    >
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-accent" />
                            <span className="text-xs font-medium">Tool Permissions</span>
                            {overrideCount > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
                                    {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        {permSectionOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                    {permSectionOpen && (
                        <div className="border-t border-border/40 p-4 space-y-3">
                            <p className="text-[10px] text-muted-foreground/70">
                                Override global permissions for this agent. "Default" uses the global setting.
                            </p>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                                <input
                                    className="input w-full pl-8 text-xs py-1.5"
                                    placeholder="Filter tools..."
                                    value={permFilter}
                                    onChange={e => setPermFilter(e.target.value)}
                                />
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-3">
                                {toolsByCategory.map(([category, catTools]) => (
                                    <div key={category}>
                                        <div className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">{category}</div>
                                        <div className="space-y-1">
                                            {catTools.map(tool => {
                                                const currentPerm = toolOverrides[tool.id] ?? 'default'
                                                return (
                                                    <div key={tool.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-muted/10">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-xs truncate" title={tool.id}>{tool.display_name}</span>
                                                            {tool.risk_level !== 'low' && (
                                                                <span className={`text-[9px] px-1 py-0.5 rounded ${tool.risk_level === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                                                                    {tool.risk_level}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-0.5 flex-shrink-0">
                                                            {PERM_OPTIONS.map(p => (
                                                                <button
                                                                    key={p}
                                                                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                                                                        currentPerm === p
                                                                            ? PERM_COLORS[p] + ' border-current'
                                                                            : 'border-transparent text-muted-foreground/40 hover:text-muted-foreground/70'
                                                                    }`}
                                                                    onClick={() => setOverride(tool.id, p)}
                                                                >
                                                                    {p === 'hitl' ? 'HITL' : p.charAt(0).toUpperCase() + p.slice(1)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                                {tools.length === 0 && (
                                    <p className="text-xs text-muted-foreground/50 text-center py-4">Loading tools...</p>
                                )}
                                {tools.length > 0 && filteredTools.length === 0 && (
                                    <p className="text-xs text-muted-foreground/50 text-center py-4">No tools match filter</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Rate Limits */}
                <div className="space-y-3 border border-border/40 rounded-xl p-4">
                    <label className="text-xs font-medium">Rate Limits</label>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] text-muted-foreground block mb-1">
                                Per minute: {maxCallsPerMinute}
                            </label>
                            <input
                                type="range"
                                min="5"
                                max="120"
                                step="5"
                                value={maxCallsPerMinute}
                                onChange={e => setMaxCallsPerMinute(parseInt(e.target.value))}
                                className="w-full accent-accent"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-muted-foreground block mb-1">
                                Per execution: {maxCallsPerExecution}
                            </label>
                            <input
                                type="range"
                                min="10"
                                max="500"
                                step="10"
                                value={maxCallsPerExecution}
                                onChange={e => setMaxCallsPerExecution(parseInt(e.target.value))}
                                className="w-full accent-accent"
                            />
                        </div>
                    </div>
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
    const navigate = useNavigate()

    const [triggerAgent_, setTriggerAgent] = useState<Agent | null>(null)
    const [scheduleAgent, setScheduleAgent] = useState<Agent | null>(null)
    const [configureAgent, setConfigureAgent] = useState<Agent | null>(null)
    const [expandedSection, setExpandedSection] = useState<'targets' | null>(null)
    const [targetWsId, setTargetWsId] = useState('')

    /* ── Queries ─────────────────────────────────────────────────────────── */

    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const workspaceList = workspaces as { id: string; name: string; icon: string; color: string }[]

    const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
        queryKey: ['agents'],
        queryFn: async () => {
            const raw: AgentRaw[] = await listAgents()
            return raw.map(normalizeAgent)
        },
    })

    useEffect(() => {
        if (!targetWsId && workspaceList.length > 0) setTargetWsId(workspaceList[0].id)
    }, [workspaceList, targetWsId])

    const { data: targets = [] } = useQuery<TargetItem[]>({
        queryKey: ['targets', targetWsId],
        queryFn: () => listTargets(targetWsId),
        enabled: !!targetWsId,
    })

    /* ── Render ──────────────────────────────────────────────────────────── */

    return (
        <>
            <div className="flex-1 min-h-0 overflow-y-auto p-6 lg:p-8 space-y-8">
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

                                    {agent.description && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                                    )}

                                    <div className="flex flex-wrap gap-1.5">
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

                    {/* Continuous Targets Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
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
                            {expandedSection === 'targets' && workspaceList.length > 1 && (
                                <select
                                    className="input text-xs py-1 px-2 w-auto ml-auto"
                                    value={targetWsId}
                                    onChange={e => setTargetWsId(e.target.value)}
                                >
                                    {workspaceList.map(ws => (
                                        <option key={ws.id} value={ws.id}>{ws.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

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
                                                        navigate(`/w/${targetWsId}/knowledge/${target.knowledge_id}`)
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
                </div>

            {/* Modals */}
            {triggerAgent_ && (
                <TriggerModal
                    agent={triggerAgent_}
                    onClose={() => setTriggerAgent(null)}
                />
            )}
            {scheduleAgent && (
                <ScheduleModal
                    agent={scheduleAgent}
                    onClose={() => setScheduleAgent(null)}
                />
            )}
            {configureAgent && (
                <ConfigureModal
                    agent={configureAgent}
                    onClose={() => setConfigureAgent(null)}
                />
            )}
        </>
    )
}
