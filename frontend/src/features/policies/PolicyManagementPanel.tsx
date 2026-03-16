import { useState, useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Bot, Brain, ChevronDown, ChevronRight, FileOutput, Gauge, Hammer,
    Info, Loader2, Play, Plus, Save, Search, Shield, ShieldAlert, SlidersHorizontal,
    Trash2, Wrench, X, RefreshCw,
} from 'lucide-react'

import {
    listPolicies, createToolPolicy, updateToolPolicy, deleteToolPolicy, simulatePolicy, getToolRegistry,
    listModelPolicies, createModelPolicy, updateModelPolicy, deleteModelPolicy,
    listMemoryPolicies, createMemoryPolicy, updateMemoryPolicy, deleteMemoryPolicy,
    listOutputContracts, createOutputContract, updateOutputContract, deleteOutputContract,
    listSafetyPolicies, createSafetyPolicy, updateSafetyPolicy, deleteSafetyPolicy,
    listProviders, listModels,
} from '@/lib/api'
import type { PolicyRecord, PolicySimulationResult } from '@/types/trust'
import type { ToolMeta } from '../../pages/settings/types'
import { CATEGORY_ICONS, RISK_STYLES } from '../../pages/settings/constants'

/* ────────────────────────────────────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────────────────────────────────────── */

const POLICY_TABS = [
    { id: 'tool', label: 'Tool Policies', icon: Hammer },
    { id: 'model', label: 'Model Policies', icon: Bot },
    { id: 'memory', label: 'Memory Policies', icon: Brain },
    { id: 'output', label: 'Output Contracts', icon: FileOutput },
    { id: 'safety', label: 'Safety Policies', icon: ShieldAlert },
] as const
type PolicyTab = typeof POLICY_TABS[number]['id']

const RISK_OPTIONS = [
    'harmless_read_only',
    'retrieval_search',
    'local_mutation',
    'external_mutation',
    'sensitive_data_access',
    'network_exfiltration_risk',
    'destructive',
]

function slugify(name: string) {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/* ────────────────────────────────────────────────────────────────────────────
   ToolSelectorPanel  (preserved from existing code)
   ──────────────────────────────────────────────────────────────────────────── */

function ToolSelectorPanel({
    label,
    selectedTools,
    onToggle,
    registryTools,
}: {
    label: string
    selectedTools: string[]
    onToggle: (toolId: string) => void
    registryTools: ToolMeta[]
}) {
    const [filter, setFilter] = useState('')
    const [collapsed, setCollapsed] = useState(true)

    const grouped = useMemo(() => {
        const filtered = registryTools.filter(t => {
            if (!filter) return true
            const q = filter.toLowerCase()
            return t.id.toLowerCase().includes(q) || t.display_name.toLowerCase().includes(q)
        })
        return filtered.reduce<Record<string, ToolMeta[]>>((acc, t) => {
            (acc[t.category] ??= []).push(t)
            return acc
        }, {})
    }, [registryTools, filter])

    return (
        <div className="space-y-2">
            <button
                type="button"
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                onClick={() => setCollapsed(!collapsed)}
            >
                {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {label} ({selectedTools.length} selected)
            </button>

            {!collapsed && (
                <div className="rounded-xl border border-border/40 bg-background/20 p-3 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <input
                            className="input text-xs pl-7 py-1.5"
                            placeholder="Filter tools..."
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                    </div>

                    {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, tools]) => {
                        const allSelected = tools.every(t => selectedTools.includes(t.id))
                        return (
                            <div key={cat}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-muted-foreground/60">{CATEGORY_ICONS[cat] ?? <Wrench className="w-3.5 h-3.5" />}</span>
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{cat}</span>
                                    <div className="flex-1 h-px bg-border/40" />
                                    <button
                                        type="button"
                                        className="text-[10px] text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                            if (allSelected) {
                                                tools.forEach(t => { if (selectedTools.includes(t.id)) onToggle(t.id) })
                                            } else {
                                                tools.forEach(t => { if (!selectedTools.includes(t.id)) onToggle(t.id) })
                                            }
                                        }}
                                    >
                                        {allSelected ? 'Deselect all' : 'Select all'}
                                    </button>
                                </div>
                                {tools.map(tool => (
                                    <label key={tool.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/20 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="accent-accent"
                                            checked={selectedTools.includes(tool.id)}
                                            onChange={() => onToggle(tool.id)}
                                        />
                                        <span className="text-xs text-foreground">{tool.display_name}</span>
                                        <span className="text-[10px] font-mono text-muted-foreground/50">{tool.id}</span>
                                        <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded border font-medium ${RISK_STYLES[tool.risk_level] ?? RISK_STYLES.low}`}>
                                            {tool.risk_level}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )
                    })}

                    {Object.keys(grouped).length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">No tools match filter.</p>
                    )}
                </div>
            )}
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────────────
   Draft types
   ──────────────────────────────────────────────────────────────────────────── */

type ToolPolicyDraft = {
    name: string
    description: string
    default_action: string
    allowed_tools: string[]
    blocked_tools: string[]
    approval_required_tools: string[]
    rate_limits: Record<string, number>
}

type ModelPolicyDraft = {
    name: string; slug: string; description: string
    default_provider_id: string
    default_model: string
    allow_runtime_override: boolean
    allowed_models: string[]
    blocked_models: string[]
    max_tokens_per_request: string
    max_tokens_per_day: string
}

const SAFETY_RULE_TYPES = [
    { value: 'trust_boundary', label: 'Trust Boundary' },
    { value: 'output_filtering', label: 'Output Filtering' },
    { value: 'input_validation', label: 'Input Validation' },
    { value: 'context_isolation', label: 'Context Isolation' },
    { value: 'pii_detection', label: 'PII Detection' },
    { value: 'pii_filter', label: 'PII Filter' },
    { value: 'data_handling', label: 'Data Handling' },
    { value: 'data_classification', label: 'Data Classification' },
] as const

type SafetyRuleDraft = { id: string; rule_type: string; reason_text: string }

type MemoryPolicyDraft = {
    name: string; slug: string; description: string
    history_limit: string
    history_strategy: string
    attachment_support: boolean
    auto_bookmark_urls: boolean
    mention_support: boolean
}

type OutputContractDraft = {
    name: string; slug: string; description: string
    execution_mode: string
    require_structured_output: boolean
    require_citations: boolean
}

type SafetyPolicyDraft = {
    name: string; description: string
    scope_type: string
    scope_id: string
    rules: SafetyRuleDraft[]
}

/* ────────────────────────────────────────────────────────────────────────────
   Tool Policies Section
   ──────────────────────────────────────────────────────────────────────────── */

function ToolPoliciesSection() {
    const qc = useQueryClient()
    const [creating, setCreating] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [draft, setDraft] = useState<ToolPolicyDraft>({
        name: '', description: '', default_action: 'allow',
        allowed_tools: [], blocked_tools: [], approval_required_tools: [],
        rate_limits: {},
    })
    const [error, setError] = useState<string | null>(null)
    const [simulation, setSimulation] = useState<PolicySimulationResult | null>(null)
    const [simulationError, setSimulationError] = useState<string | null>(null)
    const [simulationForm, setSimulationForm] = useState({
        tool_name: 'shell.execute',
        risk_category: 'external_mutation',
        workspace_id: '',
        profile_id: '',
        workflow_id: '',
        mission_id: '',
        run_id: 'preview-run',
    })

    const { data, isLoading } = useQuery<{ policies: PolicyRecord[]; total: number }>({
        queryKey: ['policies'],
        queryFn: () => listPolicies({ limit: 200 }),
    })

    const { data: toolRegistryData } = useQuery({
        queryKey: ['tool-registry'],
        queryFn: getToolRegistry,
        retry: false,
        staleTime: 60_000,
    })
    const registryTools: ToolMeta[] = toolRegistryData?.tools ?? []

    const policies = data?.policies ?? []
    const toolPolicies = policies.filter(p => p.policy_kind === 'tool')
    const filteredPolicies = toolPolicies.filter((policy) => {
        const haystack = `${policy.name} ${policy.scope_type} ${policy.scope_id ?? ''}`.toLowerCase()
        return haystack.includes(search.toLowerCase())
    })
    const selected = creating ? null : (filteredPolicies.find(p => p.id === selectedId) ?? null)
    const showEditor = creating || selected != null

    useEffect(() => {
        if (!selected) return
        setDraft({
            name: selected.name ?? '',
            description: selected.description ?? '',
            default_action: selected.default_action ?? 'allow',
            allowed_tools: selected.allowed_tools ?? [],
            blocked_tools: selected.blocked_tools ?? [],
            approval_required_tools: selected.approval_required_tools ?? [],
            rate_limits: (selected.rate_limits ?? {}) as Record<string, number>,
        })
        setError(null)
    }, [selected?.id])

    function startCreate() {
        setCreating(true)
        setSelectedId(null)
        setDraft({
            name: '', description: '', default_action: 'allow',
            allowed_tools: [], blocked_tools: [], approval_required_tools: [],
            rate_limits: {},
        })
        setError(null)
    }

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                name: draft.name,
                description: draft.description || null,
                default_action: draft.default_action,
                allowed_tools: draft.allowed_tools,
                blocked_tools: draft.blocked_tools,
                approval_required_tools: draft.approval_required_tools,
                rate_limits: draft.rate_limits,
            }
            if (creating) return createToolPolicy(payload)
            if (!selected) return
            return updateToolPolicy(selected.id, payload)
        },
        onSuccess: async (result) => {
            setError(null)
            await qc.invalidateQueries({ queryKey: ['policies'] })
            if (creating && result?.id) {
                setCreating(false)
                setSelectedId(result.id)
            }
        },
        onError: (e: Error) => setError(e.message),
    })

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!selected) return
            return deleteToolPolicy(selected.id)
        },
        onSuccess: async () => {
            setSelectedId(null)
            await qc.invalidateQueries({ queryKey: ['policies'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    const simulateMutation = useMutation({
        mutationFn: () =>
            simulatePolicy({
                tool_name: simulationForm.tool_name,
                risk_category: simulationForm.risk_category,
                scope_context: {
                    workspace_id: simulationForm.workspace_id || null,
                    profile_id: simulationForm.profile_id || null,
                    workflow_id: simulationForm.workflow_id || null,
                    mission_id: simulationForm.mission_id || null,
                },
                run_id: simulationForm.run_id || null,
            }),
        onSuccess: (result: PolicySimulationResult) => {
            setSimulationError(null)
            setSimulation(result)
        },
        onError: (error: Error) => {
            setSimulation(null)
            setSimulationError(error.message)
        },
    })

    return (
        <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)] h-[calc(100vh-220px)]">
            {/* Left panel */}
            <section className="glass-card rounded-2xl p-4 overflow-y-auto min-h-0">
                <div className="flex items-center gap-2 mb-3">
                    <Hammer className="h-4 w-4 text-accent" />
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-foreground">Tool Policies</h4>
                        <p className="text-[11px] text-muted-foreground">Configure tool permissions, approval requirements, and rate limits.</p>
                    </div>
                </div>
                <button type="button" className="btn-primary w-full justify-center gap-2 text-xs mb-3" onClick={startCreate}>
                    <Plus className="h-3.5 w-3.5" /> New Tool Policy
                </button>
                <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input className="input pl-9 text-sm" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="space-y-2">
                    {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                    {!isLoading && filteredPolicies.length === 0 && (
                        <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground">No tool policies found.</div>
                    )}
                    {filteredPolicies.map(p => {
                        const active = !creating && p.id === selected?.id
                        return (
                            <button key={p.id} type="button"
                                onClick={() => { setCreating(false); setSelectedId(p.id) }}
                                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-accent/35 bg-accent/10' : 'border-border/40 bg-background/20 hover:border-border/70 hover:bg-background/35'}`}
                            >
                                <p className="text-sm font-medium text-foreground">{p.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground">{p.scope_type}:{p.scope_id ?? 'system'}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{p.default_action ?? 'allow'}</span>
                                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{p.affected_tools.length} tools</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </section>

            {/* Right panel */}
            <section className="overflow-y-auto space-y-5 min-h-0">
                {!showEditor && (
                    <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
                        Select a tool policy to edit or create a new one.
                    </div>
                )}

                {showEditor && (
                    <>
                        {/* Editor card */}
                        <div className="glass-card rounded-2xl p-5">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h4 className="text-sm font-semibold text-foreground">{creating ? 'New Tool Policy' : `Edit: ${selected?.name}`}</h4>
                                <div className="flex items-center gap-2">
                                    {!creating && selected && (
                                        <button type="button" className="btn-ghost gap-2 text-xs text-red-400 hover:text-red-300" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                                            {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                            Delete
                                        </button>
                                    )}
                                    <button type="button" className="btn-primary gap-2 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                        {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                        {creating ? 'Create' : 'Save'}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="block text-xs font-medium text-muted-foreground">
                                    Name
                                    <input className="input mt-1 text-sm" value={draft.name}
                                        onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                                    />
                                </label>
                                <label className="block text-xs font-medium text-muted-foreground">
                                    Description
                                    <textarea className="input mt-1 text-sm" rows={3} value={draft.description}
                                        onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                                    />
                                </label>
                                <label className="block text-xs font-medium text-muted-foreground">
                                    Default action
                                    <select className="input mt-1 text-sm" value={draft.default_action} onChange={e => setDraft(prev => ({ ...prev, default_action: e.target.value }))}>
                                        <option value="allow">allow</option>
                                        <option value="deny">deny</option>
                                        <option value="requires_approval">requires_approval</option>
                                    </select>
                                </label>
                                <ToolSelectorPanel
                                    label="Allowed tools"
                                    selectedTools={draft.allowed_tools}
                                    onToggle={(toolId) => setDraft(prev => ({
                                        ...prev,
                                        allowed_tools: prev.allowed_tools.includes(toolId)
                                            ? prev.allowed_tools.filter(id => id !== toolId)
                                            : [...prev.allowed_tools, toolId],
                                    }))}
                                    registryTools={registryTools}
                                />
                                <ToolSelectorPanel
                                    label="Blocked tools"
                                    selectedTools={draft.blocked_tools}
                                    onToggle={(toolId) => setDraft(prev => ({
                                        ...prev,
                                        blocked_tools: prev.blocked_tools.includes(toolId)
                                            ? prev.blocked_tools.filter(id => id !== toolId)
                                            : [...prev.blocked_tools, toolId],
                                    }))}
                                    registryTools={registryTools}
                                />
                                <ToolSelectorPanel
                                    label="Approval-required tools"
                                    selectedTools={draft.approval_required_tools}
                                    onToggle={(toolId) => setDraft(prev => ({
                                        ...prev,
                                        approval_required_tools: prev.approval_required_tools.includes(toolId)
                                            ? prev.approval_required_tools.filter(id => id !== toolId)
                                            : [...prev.approval_required_tools, toolId],
                                    }))}
                                    registryTools={registryTools}
                                />
                                <div className="space-y-2">
                                    <span className="text-xs font-medium text-muted-foreground">Rate limits</span>
                                    <div className="rounded-xl border border-border/40 bg-background/20 p-3 space-y-2">
                                        {Object.entries(draft.rate_limits).map(([key, value]) => (
                                            <div key={key} className="flex items-center gap-2">
                                                <input
                                                    className="input text-xs flex-1"
                                                    value={key}
                                                    onChange={e => {
                                                        const newLimits = { ...draft.rate_limits }
                                                        delete newLimits[key]
                                                        newLimits[e.target.value] = value
                                                        setDraft(prev => ({ ...prev, rate_limits: newLimits }))
                                                    }}
                                                    placeholder="Tool ID or category"
                                                />
                                                <input
                                                    type="number"
                                                    className="input text-xs w-24"
                                                    value={value}
                                                    min={1}
                                                    onChange={e => setDraft(prev => ({ ...prev, rate_limits: { ...prev.rate_limits, [key]: parseInt(e.target.value) || 0 } }))}
                                                />
                                                <button
                                                    type="button"
                                                    className="text-red-400 hover:text-red-300 p-1"
                                                    onClick={() => {
                                                        const newLimits = { ...draft.rate_limits }
                                                        delete newLimits[key]
                                                        setDraft(prev => ({ ...prev, rate_limits: newLimits }))
                                                    }}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            className="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
                                            onClick={() => setDraft(prev => ({ ...prev, rate_limits: { ...prev.rate_limits, '': 0 } }))}
                                        >
                                            <Plus className="w-3 h-3" /> Add rate limit
                                        </button>
                                    </div>
                                </div>
                                {error && <p className="text-xs text-red-400">{error}</p>}
                            </div>
                        </div>

                        {/* Policy Simulation (below the editor) */}
                        <div className="glass-card rounded-2xl p-5">
                            <div className="mb-3 flex items-center gap-2">
                                <Gauge className="h-4 w-4 text-accent" />
                                <h4 className="text-sm font-semibold text-foreground">Policy Simulation</h4>
                            </div>
                            <div className="space-y-3">
                                <input className="input text-sm" placeholder="Tool name" value={simulationForm.tool_name} onChange={(event) => setSimulationForm((current) => ({ ...current, tool_name: event.target.value }))} />
                                <select className="input text-sm" value={simulationForm.risk_category} onChange={(event) => setSimulationForm((current) => ({ ...current, risk_category: event.target.value }))}>
                                    {RISK_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                                <input className="input text-sm" placeholder="Workspace ID (optional)" value={simulationForm.workspace_id} onChange={(event) => setSimulationForm((current) => ({ ...current, workspace_id: event.target.value }))} />
                                <input className="input text-sm" placeholder="Profile ID (optional)" value={simulationForm.profile_id} onChange={(event) => setSimulationForm((current) => ({ ...current, profile_id: event.target.value }))} />
                                <input className="input text-sm" placeholder="Workflow ID (optional)" value={simulationForm.workflow_id} onChange={(event) => setSimulationForm((current) => ({ ...current, workflow_id: event.target.value }))} />
                                <input className="input text-sm" placeholder="Mission ID (optional)" value={simulationForm.mission_id} onChange={(event) => setSimulationForm((current) => ({ ...current, mission_id: event.target.value }))} />
                                <input className="input text-sm" placeholder="Run ID (optional)" value={simulationForm.run_id} onChange={(event) => setSimulationForm((current) => ({ ...current, run_id: event.target.value }))} />
                                <button type="button" className="btn-primary w-full justify-center gap-2 text-xs" onClick={() => simulateMutation.mutate()} disabled={simulateMutation.isPending}>
                                    {simulateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                    Simulate
                                </button>
                            </div>
                            {simulationError && <p className="mt-3 text-xs text-red-400">{simulationError}</p>}
                            {simulation && (
                                <div className="mt-4 space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
                                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <SlidersHorizontal className="h-4 w-4 text-accent" />
                                        Decision: {simulation.decision}
                                    </div>
                                    <dl className="space-y-2 text-xs text-muted-foreground">
                                        <div>
                                            <dt className="font-medium text-foreground">Matched scope</dt>
                                            <dd>{simulation.matched_policy_scope ?? 'default risk policy'}</dd>
                                        </div>
                                        <div>
                                            <dt className="font-medium text-foreground">Reason</dt>
                                            <dd>{simulation.reason_text}</dd>
                                        </div>
                                        {simulation.rate_limit_state && Object.keys(simulation.rate_limit_state).length > 0 && (
                                            <div>
                                                <dt className="font-medium text-foreground">Rate limit state</dt>
                                                <dd className="whitespace-pre-wrap font-mono">{JSON.stringify(simulation.rate_limit_state, null, 2)}</dd>
                                            </div>
                                        )}
                                    </dl>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </section>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────────────
   Model Policies Section
   ──────────────────────────────────────────────────────────────────────────── */

function ModelPoliciesSection() {
    const qc = useQueryClient()
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [search, setSearch] = useState('')
    const emptyDraft: ModelPolicyDraft = {
        name: '', slug: '', description: '', default_provider_id: '', default_model: '',
        allow_runtime_override: false, allowed_models: [], blocked_models: [],
        max_tokens_per_request: '', max_tokens_per_day: '',
    }
    const [draft, setDraft] = useState<ModelPolicyDraft>(emptyDraft)
    const [error, setError] = useState<string | null>(null)

    // Fetch providers & their models
    const { data: providersRaw } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const providers: { id: string; provider_name: string; display_name: string; enabled_models: any[] }[] = providersRaw ?? []

    const [providerModels, setProviderModels] = useState<Record<string, { id: string; name: string }[]>>({})
    const [fetchingModels, setFetchingModels] = useState<string | null>(null)

    const handleFetchModels = async (providerId: string) => {
        if (!providerId || providerModels[providerId]) return
        setFetchingModels(providerId)
        try {
            const models = await listModels(providerId)
            setProviderModels(prev => ({ ...prev, [providerId]: models }))
        } catch { /* ignore */ }
        setFetchingModels(null)
    }

    // Auto-fetch models when provider is selected
    useEffect(() => {
        if (draft.default_provider_id) handleFetchModels(draft.default_provider_id)
    }, [draft.default_provider_id])

    // All available model IDs across all fetched providers
    const allAvailableModels = useMemo(() => {
        const models: { id: string; name: string; providerId: string; providerName: string }[] = []
        for (const p of providers) {
            const pModels = providerModels[p.id]
            if (pModels) {
                for (const m of pModels) {
                    if (!models.some(e => e.id === m.id)) {
                        models.push({ id: m.id, name: m.name, providerId: p.id, providerName: p.display_name || p.provider_name })
                    }
                }
            }
        }
        return models
    }, [providers, providerModels])

    // Models for the selected provider
    const selectedProviderModels = draft.default_provider_id ? (providerModels[draft.default_provider_id] ?? []) : []

    const { data, isLoading } = useQuery({
        queryKey: ['model-policies'],
        queryFn: listModelPolicies,
    })
    const items: any[] = data?.model_policies ?? data?.policies ?? []
    const filtered = items.filter(p => {
        const hay = `${p.name} ${p.slug ?? ''}`.toLowerCase()
        return hay.includes(search.toLowerCase())
    })
    const selected = creating ? null : (filtered.find(p => p.id === selectedId) ?? null)
    useEffect(() => {
        if (!selected) return
        setDraft({
            name: selected.name ?? '',
            slug: selected.slug ?? '',
            description: selected.description ?? '',
            default_provider_id: selected.default_provider_id ?? '',
            default_model: selected.default_model ?? '',
            allow_runtime_override: selected.allow_runtime_override ?? false,
            allowed_models: selected.allowed_models ?? [],
            blocked_models: selected.blocked_models ?? [],
            max_tokens_per_request: selected.max_tokens_per_request != null ? String(selected.max_tokens_per_request) : '',
            max_tokens_per_day: selected.max_tokens_per_day != null ? String(selected.max_tokens_per_day) : '',
        })
        setError(null)
    }, [selected?.id])

    function startCreate() {
        setCreating(true)
        setSelectedId(null)
        setDraft(emptyDraft)
        setError(null)
    }

    function buildPayload() {
        return {
            name: draft.name,
            slug: draft.slug,
            description: draft.description || null,
            default_provider_id: draft.default_provider_id || null,
            default_model: draft.default_model || null,
            allow_runtime_override: draft.allow_runtime_override,
            allowed_models: draft.allowed_models,
            blocked_models: draft.blocked_models,
            max_tokens_per_request: draft.max_tokens_per_request ? parseInt(draft.max_tokens_per_request) || null : null,
            max_tokens_per_day: draft.max_tokens_per_day ? parseInt(draft.max_tokens_per_day) || null : null,
        }
    }

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = buildPayload()
            if (creating) return createModelPolicy(payload)
            if (selected) return updateModelPolicy(selected.id, payload)
        },
        onSuccess: async () => {
            setError(null)
            setCreating(false)
            await qc.invalidateQueries({ queryKey: ['model-policies'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    const deleteMutation = useMutation({
        mutationFn: async () => { if (selected) return deleteModelPolicy(selected.id) },
        onSuccess: async () => {
            setSelectedId(null)
            await qc.invalidateQueries({ queryKey: ['model-policies'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    // Model picker helper for allowed/blocked lists
    const [modelPickerTarget, setModelPickerTarget] = useState<'allowed' | 'blocked' | null>(null)
    const [modelPickerProvider, setModelPickerProvider] = useState('')
    const [modelPickerSearch, setModelPickerSearch] = useState('')

    const pickerModels = useMemo(() => {
        const src = modelPickerProvider ? (providerModels[modelPickerProvider] ?? []) : allAvailableModels
        const q = modelPickerSearch.toLowerCase()
        return q ? src.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : src
    }, [modelPickerProvider, providerModels, allAvailableModels, modelPickerSearch])

    function openModelPicker(target: 'allowed' | 'blocked') {
        setModelPickerTarget(target)
        setModelPickerProvider('')
        setModelPickerSearch('')
        // Auto-fetch models for all providers if not fetched
        for (const p of providers) {
            if (!providerModels[p.id]) handleFetchModels(p.id)
        }
    }

    function togglePickerModel(modelId: string) {
        if (!modelPickerTarget) return
        const field = modelPickerTarget === 'allowed' ? 'allowed_models' : 'blocked_models'
        setDraft(prev => {
            const list = prev[field]
            return { ...prev, [field]: list.includes(modelId) ? list.filter(m => m !== modelId) : [...list, modelId] }
        })
    }

    const showEditor = creating || selected

    return (
        <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)] h-[calc(100vh-220px)]">
            {/* Left panel */}
            <section className="glass-card rounded-2xl p-4 overflow-y-auto min-h-0">
                <div className="flex items-center gap-2 mb-3">
                    <Bot className="h-4 w-4 text-accent" />
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-foreground">Model Policies</h4>
                        <p className="text-[11px] text-muted-foreground">Configure LLM provider defaults, model allowlists, and token budgets.</p>
                    </div>
                </div>
                <button type="button" className="btn-primary w-full justify-center gap-2 text-xs mb-3" onClick={startCreate}>
                    <Plus className="h-3.5 w-3.5" /> New Model Policy
                </button>
                <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input className="input pl-9 text-sm" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="space-y-2">
                    {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                    {!isLoading && filtered.length === 0 && (
                        <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground">No model policies found.</div>
                    )}
                    {filtered.map(p => {
                        const active = !creating && p.id === selected?.id
                        return (
                            <button key={p.id} type="button"
                                onClick={() => { setCreating(false); setSelectedId(p.id) }}
                                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-accent/35 bg-accent/10' : 'border-border/40 bg-background/20 hover:border-border/70 hover:bg-background/35'}`}
                            >
                                <p className="text-sm font-medium text-foreground">{p.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground">{p.slug}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                                    {p.is_system && <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5">System</span>}
                                    <span className="rounded-full bg-muted/40 px-2 py-0.5">Override: {p.allow_runtime_override ? 'On' : 'Off'}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </section>

            {/* Right panel */}
            <section className="overflow-y-auto space-y-5 min-h-0">
                {!showEditor && (
                    <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
                        Select a model policy to edit or create a new one.
                    </div>
                )}
                {showEditor && (
                    <div className="glass-card rounded-2xl p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-foreground">{creating ? 'New Model Policy' : `Edit: ${selected?.name}`}</h4>
                            <div className="flex items-center gap-2">
                                {!creating && selected && (
                                    <button type="button" className="btn-ghost gap-2 text-xs text-red-400 hover:text-red-300" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                                        {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        Delete
                                    </button>
                                )}
                                <button type="button" className="btn-primary gap-2 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    {creating ? 'Create' : 'Save'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-xs font-medium text-muted-foreground">
                                Name
                                <input className="input mt-1 text-sm" value={draft.name}
                                    onChange={e => {
                                        const name = e.target.value
                                        setDraft(prev => ({ ...prev, name, ...(creating ? { slug: slugify(name) } : {}) }))
                                    }}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Slug
                                <input className="input mt-1 text-sm font-mono" value={draft.slug}
                                    onChange={e => setDraft(prev => ({ ...prev, slug: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Description
                                <textarea className="input mt-1 text-sm" rows={3} value={draft.description}
                                    onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </label>

                            {/* Default Provider */}
                            <label className="block text-xs font-medium text-muted-foreground">
                                Default provider
                                <select className="input mt-1 text-sm" value={draft.default_provider_id}
                                    onChange={e => setDraft(prev => ({ ...prev, default_provider_id: e.target.value, default_model: '' }))}>
                                    <option value="">None (any provider)</option>
                                    {providers.map(p => (
                                        <option key={p.id} value={p.id}>{p.display_name || p.provider_name} ({p.provider_name})</option>
                                    ))}
                                </select>
                            </label>

                            {/* Default Model */}
                            <div className="block text-xs font-medium text-muted-foreground">
                                <span>Default model</span>
                                {draft.default_provider_id && fetchingModels === draft.default_provider_id && (
                                    <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin" />
                                )}
                                {draft.default_provider_id && selectedProviderModels.length > 0 ? (
                                    <select className="input mt-1 text-sm" value={draft.default_model}
                                        onChange={e => setDraft(prev => ({ ...prev, default_model: e.target.value }))}>
                                        <option value="">None</option>
                                        {selectedProviderModels.map(m => (
                                            <option key={m.id} value={m.id}>{m.name || m.id}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="flex gap-2 mt-1">
                                        <input className="input text-sm flex-1" placeholder="e.g., gpt-4o" value={draft.default_model}
                                            onChange={e => setDraft(prev => ({ ...prev, default_model: e.target.value }))}
                                        />
                                        {draft.default_provider_id && !fetchingModels && (
                                            <button type="button" className="btn-ghost text-xs py-1.5 px-2.5 gap-1"
                                                onClick={() => {
                                                    setProviderModels(prev => { const next = { ...prev }; delete next[draft.default_provider_id]; return next })
                                                    handleFetchModels(draft.default_provider_id)
                                                }}>
                                                <RefreshCw className="w-3 h-3" /> Fetch
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">Allow runtime override</span>
                                <button type="button"
                                    onClick={() => setDraft(prev => ({ ...prev, allow_runtime_override: !prev.allow_runtime_override }))}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                        draft.allow_runtime_override
                                            ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                            : 'bg-muted/30 text-muted-foreground ring-1 ring-border/50'
                                    }`}
                                >
                                    {draft.allow_runtime_override ? 'On' : 'Off'}
                                </button>
                            </div>

                            {/* Allowed Models */}
                            <div className="text-xs font-medium text-muted-foreground">
                                <div className="flex items-center justify-between mb-1">
                                    <span>Allowed models</span>
                                    <button type="button" className="btn-ghost text-[10px] py-0.5 px-2 gap-1" onClick={() => openModelPicker('allowed')}>
                                        <Plus className="w-3 h-3" /> Add from provider
                                    </button>
                                </div>
                                {draft.allowed_models.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {draft.allowed_models.map(m => (
                                            <span key={m} className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[11px] font-mono">
                                                {m}
                                                <button type="button" onClick={() => setDraft(prev => ({ ...prev, allowed_models: prev.allowed_models.filter(x => x !== m) }))}
                                                    className="hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground/60 mt-1">No restrictions — all models allowed.</p>
                                )}
                            </div>

                            {/* Blocked Models */}
                            <div className="text-xs font-medium text-muted-foreground">
                                <div className="flex items-center justify-between mb-1">
                                    <span>Blocked models</span>
                                    <button type="button" className="btn-ghost text-[10px] py-0.5 px-2 gap-1" onClick={() => openModelPicker('blocked')}>
                                        <Plus className="w-3 h-3" /> Add from provider
                                    </button>
                                </div>
                                {draft.blocked_models.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {draft.blocked_models.map(m => (
                                            <span key={m} className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-2.5 py-1 text-[11px] font-mono">
                                                {m}
                                                <button type="button" onClick={() => setDraft(prev => ({ ...prev, blocked_models: prev.blocked_models.filter(x => x !== m) }))}
                                                    className="hover:text-red-300 transition-colors"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground/60 mt-1">No models blocked.</p>
                                )}
                            </div>

                            {/* Model Picker Overlay */}
                            {modelPickerTarget && (
                                <div className="rounded-xl border border-accent/30 bg-background/60 backdrop-blur-sm p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-foreground">
                                            Select models for {modelPickerTarget === 'allowed' ? 'allowlist' : 'blocklist'}
                                        </span>
                                        <button type="button" onClick={() => setModelPickerTarget(null)} className="btn-ghost text-xs py-0.5 px-2">
                                            <X className="w-3.5 h-3.5" /> Close
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        <select className="input text-xs flex-1" value={modelPickerProvider}
                                            onChange={e => { setModelPickerProvider(e.target.value); if (e.target.value) handleFetchModels(e.target.value) }}>
                                            <option value="">All providers</option>
                                            {providers.map(p => (
                                                <option key={p.id} value={p.id}>{p.display_name || p.provider_name}</option>
                                            ))}
                                        </select>
                                        <div className="relative flex-1">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                            <input className="input text-xs pl-7" placeholder="Filter models..." value={modelPickerSearch} onChange={e => setModelPickerSearch(e.target.value)} />
                                        </div>
                                    </div>
                                    {fetchingModels && (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Fetching models...</div>
                                    )}
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                        {pickerModels.length === 0 && !fetchingModels && (
                                            <p className="text-[11px] text-muted-foreground py-2 text-center">
                                                {providers.length === 0 ? 'No providers configured. Add providers in Settings.' : 'No models found. Try fetching models from a provider.'}
                                            </p>
                                        )}
                                        {pickerModels.map(m => {
                                            const targetList = modelPickerTarget === 'allowed' ? draft.allowed_models : draft.blocked_models
                                            const isSelected = targetList.includes(m.id)
                                            return (
                                                <button key={m.id} type="button" onClick={() => togglePickerModel(m.id)}
                                                    className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                                                        isSelected ? 'bg-accent/15 text-accent ring-1 ring-accent/25' : 'hover:bg-muted/30 text-foreground'
                                                    }`}>
                                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-accent border-accent' : 'border-border'}`}>
                                                        {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                    </div>
                                                    <span className="font-mono truncate">{m.name || m.id}</span>
                                                    {'providerName' in m && <span className="text-[10px] text-muted-foreground ml-auto">{(m as any).providerName}</span>}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <label className="block text-xs font-medium text-muted-foreground">
                                Max tokens per request
                                <input type="number" className="input mt-1 text-sm" min={1} placeholder="No limit"
                                    value={draft.max_tokens_per_request}
                                    onChange={e => setDraft(prev => ({ ...prev, max_tokens_per_request: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Max tokens per day
                                <input type="number" className="input mt-1 text-sm" min={1} placeholder="No limit"
                                    value={draft.max_tokens_per_day}
                                    onChange={e => setDraft(prev => ({ ...prev, max_tokens_per_day: e.target.value }))}
                                />
                            </label>
                        </div>
                        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                    </div>
                )}
            </section>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────────────
   Memory Policies Section
   ──────────────────────────────────────────────────────────────────────────── */

function MemoryPoliciesSection() {
    const qc = useQueryClient()
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [search, setSearch] = useState('')
    const [draft, setDraft] = useState<MemoryPolicyDraft>({
        name: '', slug: '', description: '',
        history_limit: '50', history_strategy: 'sliding_window',
        attachment_support: true, auto_bookmark_urls: false, mention_support: true,
    })
    const [error, setError] = useState<string | null>(null)

    const { data, isLoading } = useQuery({
        queryKey: ['memory-policies'],
        queryFn: listMemoryPolicies,
    })
    const items: any[] = data?.memory_policies ?? data?.policies ?? []
    const filtered = items.filter(p => `${p.name} ${p.slug ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    const selected = creating ? null : (filtered.find(p => p.id === selectedId) ?? null)

    useEffect(() => {
        if (!selected) return
        setDraft({
            name: selected.name ?? '',
            slug: selected.slug ?? '',
            description: selected.description ?? '',
            history_limit: selected.history_limit != null ? String(selected.history_limit) : '50',
            history_strategy: selected.history_strategy ?? 'sliding_window',
            attachment_support: selected.attachment_support ?? true,
            auto_bookmark_urls: selected.auto_bookmark_urls ?? false,
            mention_support: selected.mention_support ?? true,
        })
        setError(null)
    }, [selected?.id])

    function startCreate() {
        setCreating(true)
        setSelectedId(null)
        setDraft({
            name: '', slug: '', description: '',
            history_limit: '50', history_strategy: 'sliding_window',
            attachment_support: true, auto_bookmark_urls: false, mention_support: true,
        })
        setError(null)
    }

    function buildPayload() {
        return {
            name: draft.name,
            slug: draft.slug,
            description: draft.description || null,
            history_limit: parseInt(draft.history_limit) || 50,
            history_strategy: draft.history_strategy,
            attachment_support: draft.attachment_support,
            auto_bookmark_urls: draft.auto_bookmark_urls,
            mention_support: draft.mention_support,
        }
    }

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = buildPayload()
            if (creating) return createMemoryPolicy(payload)
            if (selected) return updateMemoryPolicy(selected.id, payload)
        },
        onSuccess: async () => {
            setError(null)
            setCreating(false)
            await qc.invalidateQueries({ queryKey: ['memory-policies'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    const deleteMutation = useMutation({
        mutationFn: async () => { if (selected) return deleteMemoryPolicy(selected.id) },
        onSuccess: async () => {
            setSelectedId(null)
            await qc.invalidateQueries({ queryKey: ['memory-policies'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    const showEditor = creating || selected

    return (
        <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)] h-[calc(100vh-220px)]">
            <section className="glass-card rounded-2xl p-4 overflow-y-auto min-h-0">
                <div className="flex items-center gap-2 mb-3">
                    <Brain className="h-4 w-4 text-accent" />
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-foreground">Memory Policies</h4>
                        <p className="text-[11px] text-muted-foreground">Control conversation history, context assembly, and attachment handling.</p>
                    </div>
                </div>
                <button type="button" className="btn-primary w-full justify-center gap-2 text-xs mb-3" onClick={startCreate}>
                    <Plus className="h-3.5 w-3.5" /> New Memory Policy
                </button>
                <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input className="input pl-9 text-sm" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="space-y-2">
                    {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                    {!isLoading && filtered.length === 0 && (
                        <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground">No memory policies found.</div>
                    )}
                    {filtered.map(p => {
                        const active = !creating && p.id === selected?.id
                        return (
                            <button key={p.id} type="button"
                                onClick={() => { setCreating(false); setSelectedId(p.id) }}
                                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-accent/35 bg-accent/10' : 'border-border/40 bg-background/20 hover:border-border/70 hover:bg-background/35'}`}
                            >
                                <p className="text-sm font-medium text-foreground">{p.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground">{p.slug}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                                    {p.is_system && <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5">System</span>}
                                    <span className="rounded-full bg-muted/40 px-2 py-0.5">History: {p.history_limit ?? '?'}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </section>

            <section className="overflow-y-auto space-y-5 min-h-0">
                {!showEditor && (
                    <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
                        Select a memory policy to edit or create a new one.
                    </div>
                )}
                {showEditor && (
                    <div className="glass-card rounded-2xl p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-foreground">{creating ? 'New Memory Policy' : `Edit: ${selected?.name}`}</h4>
                            <div className="flex items-center gap-2">
                                {!creating && selected && (
                                    <button type="button" className="btn-ghost gap-2 text-xs text-red-400 hover:text-red-300" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                                        {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        Delete
                                    </button>
                                )}
                                <button type="button" className="btn-primary gap-2 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    {creating ? 'Create' : 'Save'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-xs font-medium text-muted-foreground">
                                Name
                                <input className="input mt-1 text-sm" value={draft.name}
                                    onChange={e => {
                                        const name = e.target.value
                                        setDraft(prev => ({ ...prev, name, ...(creating ? { slug: slugify(name) } : {}) }))
                                    }}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Slug
                                <input className="input mt-1 text-sm font-mono" value={draft.slug}
                                    onChange={e => setDraft(prev => ({ ...prev, slug: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Description
                                <textarea className="input mt-1 text-sm" rows={3} value={draft.description}
                                    onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                History limit
                                <input type="number" className="input mt-1 text-sm" min={1} max={1000} value={draft.history_limit}
                                    onChange={e => setDraft(prev => ({ ...prev, history_limit: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                History strategy
                                <select className="input mt-1 text-sm" value={draft.history_strategy}
                                    onChange={e => setDraft(prev => ({ ...prev, history_strategy: e.target.value }))}>
                                    <option value="sliding_window">sliding_window</option>
                                    <option value="summarize">summarize</option>
                                    <option value="truncate">truncate</option>
                                </select>
                            </label>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">Attachment support</span>
                                <button type="button"
                                    onClick={() => setDraft(prev => ({ ...prev, attachment_support: !prev.attachment_support }))}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                        draft.attachment_support
                                            ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                            : 'bg-muted/30 text-muted-foreground ring-1 ring-border/50'
                                    }`}
                                >
                                    {draft.attachment_support ? 'On' : 'Off'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">Auto-bookmark URLs</span>
                                <button type="button"
                                    onClick={() => setDraft(prev => ({ ...prev, auto_bookmark_urls: !prev.auto_bookmark_urls }))}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                        draft.auto_bookmark_urls
                                            ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                            : 'bg-muted/30 text-muted-foreground ring-1 ring-border/50'
                                    }`}
                                >
                                    {draft.auto_bookmark_urls ? 'On' : 'Off'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">Mention support</span>
                                <button type="button"
                                    onClick={() => setDraft(prev => ({ ...prev, mention_support: !prev.mention_support }))}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                        draft.mention_support
                                            ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                            : 'bg-muted/30 text-muted-foreground ring-1 ring-border/50'
                                    }`}
                                >
                                    {draft.mention_support ? 'On' : 'Off'}
                                </button>
                            </div>
                        </div>
                        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                    </div>
                )}
            </section>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────────────
   Output Contracts Section
   ──────────────────────────────────────────────────────────────────────────── */

function OutputContractsSection() {
    const qc = useQueryClient()
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [search, setSearch] = useState('')
    const [draft, setDraft] = useState<OutputContractDraft>({
        name: '', slug: '', description: '',
        execution_mode: 'streaming',
        require_structured_output: false,
        require_citations: false,
    })
    const [error, setError] = useState<string | null>(null)

    const { data, isLoading } = useQuery({
        queryKey: ['output-contracts'],
        queryFn: listOutputContracts,
    })
    const items: any[] = data?.output_contracts ?? data?.contracts ?? []
    const filtered = items.filter(p => `${p.name} ${p.slug ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    const selected = creating ? null : (filtered.find(p => p.id === selectedId) ?? null)

    useEffect(() => {
        if (!selected) return
        setDraft({
            name: selected.name ?? '',
            slug: selected.slug ?? '',
            description: selected.description ?? '',
            execution_mode: selected.execution_mode ?? 'streaming',
            require_structured_output: selected.require_structured_output ?? false,
            require_citations: selected.require_citations ?? false,
        })
        setError(null)
    }, [selected?.id])

    function startCreate() {
        setCreating(true)
        setSelectedId(null)
        setDraft({
            name: '', slug: '', description: '',
            execution_mode: 'streaming',
            require_structured_output: false,
            require_citations: false,
        })
        setError(null)
    }

    function buildPayload() {
        return {
            name: draft.name,
            slug: draft.slug,
            description: draft.description || null,
            execution_mode: draft.execution_mode,
            require_structured_output: draft.require_structured_output,
            require_citations: draft.require_citations,
        }
    }

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = buildPayload()
            if (creating) return createOutputContract(payload)
            if (selected) return updateOutputContract(selected.id, payload)
        },
        onSuccess: async () => {
            setError(null)
            setCreating(false)
            await qc.invalidateQueries({ queryKey: ['output-contracts'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    const deleteMutation = useMutation({
        mutationFn: async () => { if (selected) return deleteOutputContract(selected.id) },
        onSuccess: async () => {
            setSelectedId(null)
            await qc.invalidateQueries({ queryKey: ['output-contracts'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    const showEditor = creating || selected

    return (
        <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)] h-[calc(100vh-220px)]">
            <section className="glass-card rounded-2xl p-4 overflow-y-auto min-h-0">
                <div className="flex items-center gap-2 mb-3">
                    <FileOutput className="h-4 w-4 text-accent" />
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-foreground">Output Contracts</h4>
                        <p className="text-[11px] text-muted-foreground">Define output format, execution mode, and citation requirements.</p>
                    </div>
                </div>
                <button type="button" className="btn-primary w-full justify-center gap-2 text-xs mb-3" onClick={startCreate}>
                    <Plus className="h-3.5 w-3.5" /> New Output Contract
                </button>
                <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input className="input pl-9 text-sm" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="space-y-2">
                    {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                    {!isLoading && filtered.length === 0 && (
                        <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground">No output contracts found.</div>
                    )}
                    {filtered.map(p => {
                        const active = !creating && p.id === selected?.id
                        return (
                            <button key={p.id} type="button"
                                onClick={() => { setCreating(false); setSelectedId(p.id) }}
                                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-accent/35 bg-accent/10' : 'border-border/40 bg-background/20 hover:border-border/70 hover:bg-background/35'}`}
                            >
                                <p className="text-sm font-medium text-foreground">{p.name}</p>
                                <p className="text-[10px] font-mono text-muted-foreground">{p.slug}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                                    {p.is_system && <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5">System</span>}
                                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{p.execution_mode ?? 'streaming'}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </section>

            <section className="overflow-y-auto space-y-5 min-h-0">
                {!showEditor && (
                    <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
                        Select an output contract to edit or create a new one.
                    </div>
                )}
                {showEditor && (
                    <div className="glass-card rounded-2xl p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-foreground">{creating ? 'New Output Contract' : `Edit: ${selected?.name}`}</h4>
                            <div className="flex items-center gap-2">
                                {!creating && selected && (
                                    <button type="button" className="btn-ghost gap-2 text-xs text-red-400 hover:text-red-300" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                                        {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        Delete
                                    </button>
                                )}
                                <button type="button" className="btn-primary gap-2 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    {creating ? 'Create' : 'Save'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-xs font-medium text-muted-foreground">
                                Name
                                <input className="input mt-1 text-sm" value={draft.name}
                                    onChange={e => {
                                        const name = e.target.value
                                        setDraft(prev => ({ ...prev, name, ...(creating ? { slug: slugify(name) } : {}) }))
                                    }}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Slug
                                <input className="input mt-1 text-sm font-mono" value={draft.slug}
                                    onChange={e => setDraft(prev => ({ ...prev, slug: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Description
                                <textarea className="input mt-1 text-sm" rows={3} value={draft.description}
                                    onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Execution mode
                                <select className="input mt-1 text-sm" value={draft.execution_mode}
                                    onChange={e => setDraft(prev => ({ ...prev, execution_mode: e.target.value }))}>
                                    <option value="streaming">streaming</option>
                                    <option value="batch">batch</option>
                                    <option value="interactive">interactive</option>
                                </select>
                            </label>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">Require structured output</span>
                                <button type="button"
                                    onClick={() => setDraft(prev => ({ ...prev, require_structured_output: !prev.require_structured_output }))}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                        draft.require_structured_output
                                            ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                            : 'bg-muted/30 text-muted-foreground ring-1 ring-border/50'
                                    }`}
                                >
                                    {draft.require_structured_output ? 'On' : 'Off'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">Require citations</span>
                                <button type="button"
                                    onClick={() => setDraft(prev => ({ ...prev, require_citations: !prev.require_citations }))}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                        draft.require_citations
                                            ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                            : 'bg-muted/30 text-muted-foreground ring-1 ring-border/50'
                                    }`}
                                >
                                    {draft.require_citations ? 'On' : 'Off'}
                                </button>
                            </div>
                        </div>
                        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                    </div>
                )}
            </section>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────────────
   Safety Policies Section
   ──────────────────────────────────────────────────────────────────────────── */

function SafetyPoliciesSection() {
    const qc = useQueryClient()
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [search, setSearch] = useState('')
    const emptyDraft: SafetyPolicyDraft = {
        name: '', description: '', scope_type: 'system', scope_id: '', rules: [],
    }
    const [draft, setDraft] = useState<SafetyPolicyDraft>(emptyDraft)
    const [error, setError] = useState<string | null>(null)

    const { data, isLoading } = useQuery({
        queryKey: ['safety-policies'],
        queryFn: listSafetyPolicies,
    })
    const items: any[] = data?.policies ?? []
    const filtered = items.filter(p => `${p.name} ${p.scope_type ?? ''} ${p.scope_id ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    const selected = creating ? null : (filtered.find(p => p.id === selectedId) ?? null)

    useEffect(() => {
        if (!selected) return
        const rawRules = Array.isArray(selected.rules) ? selected.rules : []
        setDraft({
            name: selected.name ?? '',
            description: selected.description ?? '',
            scope_type: selected.scope_type ?? 'system',
            scope_id: selected.scope_id ?? '',
            rules: rawRules.map((r: any) => ({
                id: r.id ?? '',
                rule_type: r.rule_type ?? '',
                reason_text: r.reason_text ?? '',
            })),
        })
        setError(null)
    }, [selected?.id])

    function startCreate() {
        setCreating(true)
        setSelectedId(null)
        setDraft(emptyDraft)
        setError(null)
    }

    function addRule() {
        setDraft(prev => ({
            ...prev,
            rules: [...prev.rules, { id: '', rule_type: 'trust_boundary', reason_text: '' }],
        }))
    }

    function updateRule(index: number, field: keyof SafetyRuleDraft, value: string) {
        setDraft(prev => {
            const rules = [...prev.rules]
            rules[index] = { ...rules[index], [field]: value }
            // Auto-generate id from rule_type if id is empty or matches a known pattern
            if (field === 'rule_type' && (!rules[index].id || SAFETY_RULE_TYPES.some(t => t.value === rules[index].id || rules[index].id === t.value.replace(/_/g, '-')))) {
                rules[index].id = value.replace(/_/g, '-')
            }
            return { ...prev, rules }
        })
    }

    function removeRule(index: number) {
        setDraft(prev => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }))
    }

    function buildPayload() {
        return {
            name: draft.name,
            description: draft.description || null,
            scope_type: draft.scope_type,
            scope_id: draft.scope_id || null,
            rules: draft.rules.filter(r => r.rule_type),
            policy_kind: 'safety',
        }
    }

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = buildPayload()
            if (creating) return createSafetyPolicy(payload)
            if (selected) return updateSafetyPolicy(selected.id, payload)
        },
        onSuccess: async () => {
            setError(null)
            setCreating(false)
            await qc.invalidateQueries({ queryKey: ['safety-policies'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    const deleteMutation = useMutation({
        mutationFn: async () => { if (selected) return deleteSafetyPolicy(selected.id) },
        onSuccess: async () => {
            setSelectedId(null)
            await qc.invalidateQueries({ queryKey: ['safety-policies'] })
        },
        onError: (e: Error) => setError(e.message),
    })

    const showEditor = creating || selected

    return (
        <div className="space-y-4 h-[calc(100vh-220px)] flex flex-col">
            {/* Future-feature notice */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 shrink-0">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
                <p className="text-xs text-amber-300/90 leading-relaxed">
                    Safety policy rules are not yet enforced at runtime. This interface is available for defining safety constraints that will be enforced in a future release.
                </p>
            </div>

            <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)] flex-1 min-h-0">
            <section className="glass-card rounded-2xl p-4 overflow-y-auto min-h-0">
                <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert className="h-4 w-4 text-accent" />
                    <div className="flex-1">
                        <h4 className="text-sm font-semibold text-foreground">Safety Policies</h4>
                        <p className="text-[11px] text-muted-foreground">Define trust boundaries, safety rules, and compliance constraints.</p>
                    </div>
                </div>
                <button type="button" className="btn-primary w-full justify-center gap-2 text-xs mb-3" onClick={startCreate}>
                    <Plus className="h-3.5 w-3.5" /> New Safety Policy
                </button>
                <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input className="input pl-9 text-sm" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="space-y-2">
                    {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                    {!isLoading && filtered.length === 0 && (
                        <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground">No safety policies found.</div>
                    )}
                    {filtered.map(p => {
                        const active = !creating && p.id === selected?.id
                        const ruleCount = Array.isArray(p.rules) ? p.rules.length : (p.rule_count ?? 0)
                        return (
                            <button key={p.id} type="button"
                                onClick={() => { setCreating(false); setSelectedId(p.id) }}
                                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-accent/35 bg-accent/10' : 'border-border/40 bg-background/20 hover:border-border/70 hover:bg-background/35'}`}
                            >
                                <p className="text-sm font-medium text-foreground">{p.name}</p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                                    {p.is_system && <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5">System</span>}
                                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{p.scope_type ?? 'system'}</span>
                                    <span className="rounded-full bg-muted/40 px-2 py-0.5">{ruleCount} rules</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </section>

            <section className="overflow-y-auto space-y-5 min-h-0">
                {!showEditor && (
                    <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
                        Select a safety policy to edit or create a new one.
                    </div>
                )}
                {showEditor && (
                    <div className="glass-card rounded-2xl p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-semibold text-foreground">{creating ? 'New Safety Policy' : `Edit: ${selected?.name}`}</h4>
                            <div className="flex items-center gap-2">
                                {!creating && selected && (
                                    <button type="button" className="btn-ghost gap-2 text-xs text-red-400 hover:text-red-300" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                                        {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        Delete
                                    </button>
                                )}
                                <button type="button" className="btn-primary gap-2 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    {creating ? 'Create' : 'Save'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-xs font-medium text-muted-foreground">
                                Name
                                <input className="input mt-1 text-sm" value={draft.name}
                                    onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Description
                                <textarea className="input mt-1 text-sm" rows={3} value={draft.description}
                                    onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </label>
                            <label className="block text-xs font-medium text-muted-foreground">
                                Scope type
                                <select className="input mt-1 text-sm" value={draft.scope_type}
                                    onChange={e => setDraft(prev => ({ ...prev, scope_type: e.target.value }))}>
                                    <option value="system">system</option>
                                    <option value="workspace">workspace</option>
                                </select>
                            </label>
                            {draft.scope_type === 'workspace' && (
                                <label className="block text-xs font-medium text-muted-foreground">
                                    Scope ID
                                    <input className="input mt-1 text-sm font-mono" placeholder="Workspace UUID"
                                        value={draft.scope_id}
                                        onChange={e => setDraft(prev => ({ ...prev, scope_id: e.target.value }))}
                                    />
                                </label>
                            )}

                            {/* Structured Rules Builder */}
                            <div className="text-xs font-medium text-muted-foreground">
                                <div className="flex items-center justify-between mb-2">
                                    <span>Rules ({draft.rules.length})</span>
                                    <button type="button" className="btn-ghost text-[10px] py-0.5 px-2 gap-1" onClick={addRule}>
                                        <Plus className="w-3 h-3" /> Add rule
                                    </button>
                                </div>

                                {draft.rules.length === 0 && (
                                    <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-6 text-center text-sm text-muted-foreground">
                                        No rules defined. This policy has no safety constraints.
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {draft.rules.map((rule, idx) => (
                                        <div key={idx} className="rounded-xl border border-border/40 bg-background/20 p-3 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-semibold text-foreground">Rule {idx + 1}</span>
                                                <button type="button" onClick={() => removeRule(idx)}
                                                    className="btn-ghost text-[10px] py-0 px-1.5 text-red-400 hover:text-red-300">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="block text-[11px] text-muted-foreground">
                                                    Rule type
                                                    <select className="input mt-0.5 text-xs" value={rule.rule_type}
                                                        onChange={e => updateRule(idx, 'rule_type', e.target.value)}>
                                                        {SAFETY_RULE_TYPES.map(t => (
                                                            <option key={t.value} value={t.value}>{t.label}</option>
                                                        ))}
                                                        {!SAFETY_RULE_TYPES.some(t => t.value === rule.rule_type) && rule.rule_type && (
                                                            <option value={rule.rule_type}>{rule.rule_type} (custom)</option>
                                                        )}
                                                    </select>
                                                </label>
                                                <label className="block text-[11px] text-muted-foreground">
                                                    Rule ID
                                                    <input className="input mt-0.5 text-xs font-mono" value={rule.id}
                                                        placeholder="auto-generated"
                                                        onChange={e => updateRule(idx, 'id', e.target.value)}
                                                    />
                                                </label>
                                            </div>
                                            <label className="block text-[11px] text-muted-foreground">
                                                Description
                                                <input className="input mt-0.5 text-xs" value={rule.reason_text}
                                                    placeholder="What this rule enforces..."
                                                    onChange={e => updateRule(idx, 'reason_text', e.target.value)}
                                                />
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
                    </div>
                )}
            </section>
            </div>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────────────
   Main PolicyManagementPanel
   ──────────────────────────────────────────────────────────────────────────── */

export default function PolicyManagementPanel() {
    const [activeTab, setActiveTab] = useState<PolicyTab>('tool')

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="glass-card rounded-2xl border-accent/20 bg-accent/5 p-5">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                        <Shield className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-sm font-semibold text-foreground">Policy Controls</h2>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Manage tool permissions, model constraints, memory behavior, output contracts, and safety boundaries across all policy types.
                        </p>
                    </div>
                </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 flex-wrap mb-5">
                {POLICY_TABS.map(tab => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* ── Tool Policies Tab ─────────────────────────────────────────── */}
            {activeTab === 'tool' && <ToolPoliciesSection />}

            {/* ── Model Policies Tab ────────────────────────────────────────── */}
            {activeTab === 'model' && <ModelPoliciesSection />}

            {/* ── Memory Policies Tab ───────────────────────────────────────── */}
            {activeTab === 'memory' && <MemoryPoliciesSection />}

            {/* ── Output Contracts Tab ──────────────────────────────────────── */}
            {activeTab === 'output' && <OutputContractsSection />}

            {/* ── Safety Policies Tab ───────────────────────────────────────── */}
            {activeTab === 'safety' && <SafetyPoliciesSection />}
        </div>
    )
}
