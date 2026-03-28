import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, Trash2, Plus, ChevronDown, RefreshCw, Layers, Check, Pencil, X,
} from 'lucide-react'
import {
    listMCPServers, createMCPServer, updateMCPServer, deleteMCPServer, discoverMCPServer, updateMCPToolOverride,
} from '@/lib/api'
import type { MCPServerRow, MCPToolDef } from './types'
import { RISK_LEVELS, RISK_BADGE, EMPTY_MCP_FORM } from './constants'

function MCPServerForm({
    initial, onSave, onCancel, saving,
}: {
    initial: typeof EMPTY_MCP_FORM
    onSave: (data: typeof EMPTY_MCP_FORM) => void
    onCancel: () => void
    saving: boolean
}) {
    const [form, setForm] = useState(initial)
    const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <input className="input text-sm" placeholder="My GitHub Tools" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Transport</label>
                    <select className="input text-sm" value={form.transport} onChange={e => set('transport', e.target.value)}>
                        <option value="http">HTTP Streamable (newer)</option>
                        <option value="sse">SSE (older)</option>
                    </select>
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Server URL</label>
                <input className="input text-sm font-mono" placeholder="https://mcp.example.com/sse" value={form.url} onChange={e => set('url', e.target.value)} />
            </div>
            <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Description <span className="opacity-50">(optional)</span></label>
                <input className="input text-sm" placeholder="GitHub repository and PR tools" value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Authentication</label>
                    <select className="input text-sm" value={form.auth_type} onChange={e => set('auth_type', e.target.value)}>
                        <option value="none">None</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="api_key">API Key (X-API-Key)</option>
                        <option value="header">Custom Header (Name: value)</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Default Risk Level</label>
                    <select className="input text-sm capitalize" value={form.default_risk_level} onChange={e => set('default_risk_level', e.target.value)}>
                        {RISK_LEVELS.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                    </select>
                </div>
            </div>
            {form.auth_type !== 'none' && (
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                        {form.auth_type === 'bearer' ? 'Bearer Token' : form.auth_type === 'api_key' ? 'API Key' : 'Header (Name: value)'}
                    </label>
                    <input
                        type="password"
                        className="input text-sm font-mono"
                        placeholder={form.auth_type === 'header' ? 'X-Custom-Header: my-secret' : 'sk-…'}
                        value={form.auth_value}
                        onChange={e => set('auth_value', e.target.value)}
                    />
                </div>
            )}
            <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" className="rounded" checked={form.is_enabled} onChange={e => set('is_enabled', e.target.checked)} />
                    <span>Enabled</span>
                </label>
                <div className="flex gap-2">
                    <button className="btn-ghost text-xs py-1.5 px-3" onClick={onCancel}>Cancel</button>
                    <button
                        className="btn-primary text-xs py-1.5 px-3 gap-1.5"
                        onClick={() => onSave(form)}
                        disabled={!form.name.trim() || !form.url.trim() || saving}
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save &amp; Discover
                    </button>
                </div>
            </div>
        </div>
    )
}

function MCPServerCard({ server, onUpdated, onDeleted }: {
    server: MCPServerRow
    onUpdated: (s: MCPServerRow) => void
    onDeleted: (id: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [editing, setEditing] = useState(false)
    const [discovering, setDiscovering] = useState(false)
    const [savingEdit, setSavingEdit] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [overrideSaving, setOverrideSaving] = useState<string | null>(null)

    const handleDiscover = async () => {
        setDiscovering(true)
        try {
            const updated = await discoverMCPServer(server.id)
            onUpdated(updated)
        } catch {
            /* error shown via toast or ignored */
        } finally {
            setDiscovering(false)
        }
    }

    const handleToggleEnabled = async () => {
        try {
            const updated = await updateMCPServer(server.id, { is_enabled: !server.is_enabled })
            onUpdated(updated)
        } catch { /* ignore */ }
    }

    const handleSaveEdit = async (data: typeof EMPTY_MCP_FORM) => {
        setSavingEdit(true)
        try {
            const payload: Record<string, unknown> = { ...data }
            if (!payload.auth_value) delete payload.auth_value
            const updated = await updateMCPServer(server.id, payload)
            onUpdated(updated)
            setEditing(false)
        } finally {
            setSavingEdit(false)
        }
    }

    const handleDelete = async () => {
        await deleteMCPServer(server.id)
        onDeleted(server.id)
    }

    const handleToolToggle = async (toolName: string, enabled: boolean) => {
        setOverrideSaving(toolName)
        try {
            await updateMCPToolOverride(server.id, toolName, { is_enabled: enabled })
        } finally {
            setOverrideSaving(null)
        }
    }

    const handleRiskChange = async (toolName: string, risk: string) => {
        setOverrideSaving(toolName)
        try {
            await updateMCPToolOverride(server.id, toolName, { risk_level: risk })
        } finally {
            setOverrideSaving(null)
        }
    }

    return (
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
            {/* Header row */}
            <div className="flex items-start gap-3 p-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{server.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${RISK_BADGE[server.default_risk_level] ?? RISK_BADGE.high}`}>
                            {server.default_risk_level}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground uppercase tracking-wide">
                            {server.transport}
                        </span>
                        {server.tool_count > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 border border-accent/20 text-accent">
                                {server.tool_count} tool{server.tool_count !== 1 ? 's' : ''}
                            </span>
                        )}
                        {!server.is_enabled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/40 border border-border/60 text-muted-foreground">disabled</span>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{server.url}</p>
                    {server.description && <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{server.description}</p>}
                    {server.last_discovered_at && (
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                            Last discovered {new Date(server.last_discovered_at).toLocaleString()}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {/* enabled toggle */}
                    <button
                        onClick={handleToggleEnabled}
                        className={`w-8 h-4.5 relative rounded-full transition-colors ${server.is_enabled ? 'bg-accent/70' : 'bg-muted/60'}`}
                        title={server.is_enabled ? 'Disable' : 'Enable'}
                    >
                        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${server.is_enabled ? 'left-4' : 'left-0.5'}`} />
                    </button>
                    <button
                        className="btn-ghost p-1.5"
                        onClick={handleDiscover}
                        disabled={discovering}
                        title="Refresh tools"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${discovering ? 'animate-spin' : ''}`} />
                    </button>
                    <button className="btn-ghost p-1.5" onClick={() => setEditing(e => !e)} title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {confirmDelete ? (
                        <div className="flex items-center gap-1">
                            <button className="btn-ghost text-[10px] py-1 px-2 text-red-400 hover:bg-red-900/20" onClick={handleDelete}>Delete</button>
                            <button className="btn-ghost text-[10px] py-1 px-2" onClick={() => setConfirmDelete(false)}>Cancel</button>
                        </div>
                    ) : (
                        <button className="btn-ghost p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={() => setConfirmDelete(true)} title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {server.tool_count > 0 && (
                        <button className="btn-ghost p-1.5" onClick={() => setExpanded(e => !e)}>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Edit form */}
            {editing && (
                <div className="px-4 pb-4 border-t border-border/50 pt-4">
                    <MCPServerForm
                        initial={{
                            name: server.name, url: server.url,
                            description: server.description ?? '',
                            transport: server.transport, auth_type: server.auth_type,
                            auth_value: '', is_enabled: server.is_enabled,
                            default_risk_level: server.default_risk_level,
                        }}
                        onSave={handleSaveEdit}
                        onCancel={() => setEditing(false)}
                        saving={savingEdit}
                    />
                </div>
            )}

            {/* Tool list */}
            {expanded && !editing && server.discovered_tools.length > 0 && (
                <div className="border-t border-border/50">
                    <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                        Discovered Tools
                    </div>
                    <div className="divide-y divide-border/20">
                        {server.discovered_tools.map(tool => (
                            <div key={tool.name} className="px-4 py-2.5 flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-mono font-medium">{tool.name}</p>
                                    {tool.description && (
                                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <select
                                        className="text-[10px] bg-muted/30 border border-border/60 rounded px-1.5 py-0.5 capitalize cursor-pointer"
                                        defaultValue={server.default_risk_level}
                                        disabled={overrideSaving === tool.name}
                                        onChange={e => handleRiskChange(tool.name, e.target.value)}
                                    >
                                        {RISK_LEVELS.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                                    </select>
                                    <button
                                        className={`w-7 h-4 relative rounded-full transition-colors ${overrideSaving === tool.name ? 'opacity-50' : 'bg-accent/70'}`}
                                        onClick={() => handleToolToggle(tool.name, false)}
                                        title="Disable this tool"
                                        disabled={overrideSaving === tool.name}
                                    >
                                        <span className="absolute top-0.5 left-3.5 w-3 h-3 rounded-full bg-white shadow" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function MCPTab() {
    const qc = useQueryClient()
    const { data, isLoading } = useQuery({
        queryKey: ['mcp-servers'],
        queryFn: listMCPServers,
        staleTime: 30_000,
    })
    const servers: MCPServerRow[] = data?.servers ?? []

    const [showAdd, setShowAdd] = useState(false)
    const [addSaving, setAddSaving] = useState(false)

    const handleAdd = async (form: typeof EMPTY_MCP_FORM) => {
        setAddSaving(true)
        try {
            const payload: Record<string, unknown> = { ...form }
            if (!payload.auth_value) delete payload.auth_value
            await createMCPServer(payload)
            qc.invalidateQueries({ queryKey: ['mcp-servers'] })
            setShowAdd(false)
        } finally {
            setAddSaving(false)
        }
    }

    const handleUpdated = (updated: MCPServerRow) => {
        qc.setQueryData(['mcp-servers'], (old: { servers: MCPServerRow[] } | undefined) => ({
            servers: (old?.servers ?? []).map(s => s.id === updated.id ? updated : s),
        }))
    }

    const handleDeleted = (id: string) => {
        qc.setQueryData(['mcp-servers'], (old: { servers: MCPServerRow[] } | undefined) => ({
            servers: (old?.servers ?? []).filter(s => s.id !== id),
        }))
    }

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="font-semibold text-sm">MCP Servers</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Connect external MCP (Model Context Protocol) servers to extend the agent with additional tools.
                        Discovered tools appear alongside built-in tools during agent execution.
                    </p>
                </div>
                <button
                    className="btn-primary text-xs py-1.5 px-3 gap-1.5 shrink-0"
                    onClick={() => setShowAdd(s => !s)}
                >
                    {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {showAdd ? 'Cancel' : 'Add Server'}
                </button>
            </div>

            {showAdd && (
                <div className="glass-card rounded-xl border border-accent/20 p-4 space-y-1">
                    <p className="text-xs font-semibold text-accent mb-3">New MCP Server</p>
                    <MCPServerForm
                        initial={EMPTY_MCP_FORM}
                        onSave={handleAdd}
                        onCancel={() => setShowAdd(false)}
                        saving={addSaving}
                    />
                </div>
            )}

            {isLoading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && servers.length === 0 && !showAdd && (
                <div className="text-center py-16 glass-card rounded-xl text-muted-foreground">
                    <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No MCP servers configured.</p>
                    <p className="text-xs mt-1 opacity-60">Add a server to extend the agent with external tools.</p>
                </div>
            )}

            <div className="space-y-3">
                {servers.map(server => (
                    <MCPServerCard
                        key={server.id}
                        server={server}
                        onUpdated={handleUpdated}
                        onDeleted={handleDeleted}
                    />
                ))}
            </div>
        </div>
    )
}

export default MCPTab
