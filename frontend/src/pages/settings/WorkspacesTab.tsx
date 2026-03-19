import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    listWorkspaces, listProviders, createWorkspace, updateWorkspace, deleteWorkspace,
    mergeWorkspaces, listSettings,
} from '@/lib/api'
import {
    Loader2, Trash2, CheckCircle2, Plus, Merge,
    ChevronDown, ChevronUp, Eye, Save,
    Bot, Brain, AlertCircle,
} from 'lucide-react'
import { ConfirmModal } from '@/components/ui/confirm-modal'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import type { WorkspaceRow, ProviderRow } from './types'
import { WORKSPACE_ICONS, WORKSPACE_ICON_NAMES, getWorkspaceIcon } from './constants'

function WorkspaceCard({ workspace: ws, providers, onDeleted, onSaved }: {
    workspace: WorkspaceRow
    providers: ProviderRow[]
    onDeleted: () => void
    onSaved: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [name, setName] = useState(ws.name)
    const [description, setDescription] = useState(ws.description ?? '')
    const [icon, setIcon] = useState(ws.icon ?? 'folder')
    const [showIcons, setShowIcons] = useState(false)
    const [providerId, setProviderId] = useState(ws.llm_provider_id ?? '')
    const [model, setModel] = useState(ws.llm_model ?? '')
    const [kiProviderId, setKiProviderId] = useState(ws.knowledge_intelligence_provider_id ?? '')
    const [kiModel, setKiModel] = useState(ws.knowledge_intelligence_model ?? '')
    const [visionProviderId, setVisionProviderId] = useState(ws.vision_provider_id ?? '')
    const [visionModel, setVisionModel] = useState(ws.vision_model ?? '')
    const [saving, setSaving] = useState(false)

    const { data: settings = [] } = useQuery({ queryKey: ['settings'], queryFn: listSettings })

    // Build combined model lists from per-type system configs
    const chatModels = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'system_chat_models')?.value
        if (!Array.isArray(raw)) return []
        return (raw as { provider_id: string; model_id: string; model_name: string }[]).map(m => {
            const p = providers.find(pr => pr.id === m.provider_id)
            return { value: `${m.provider_id}:${m.model_id}`, label: `${p ? sanitizeProviderDisplayName(p.display_name) : 'Unknown'} / ${m.model_name}`, provider_id: m.provider_id, model_id: m.model_id }
        })
    }, [settings, providers])

    const visionModels = useMemo(() => {
        const raw = (settings as { key: string; value: unknown }[]).find(s => s.key === 'system_vision_models')?.value
        if (!Array.isArray(raw)) return []
        return (raw as { provider_id: string; model_id: string; model_name: string }[]).map(m => {
            const p = providers.find(pr => pr.id === m.provider_id)
            return { value: `${m.provider_id}:${m.model_id}`, label: `${p ? sanitizeProviderDisplayName(p.display_name) : 'Unknown'} / ${m.model_name}`, provider_id: m.provider_id, model_id: m.model_id }
        })
    }, [settings, providers])

    // Combined chat value for select
    const chatSelectValue = providerId && model ? `${providerId}:${model}` : ''
    const kiSelectValue = kiProviderId && kiModel ? `${kiProviderId}:${kiModel}` : ''
    const visionSelectValue = visionProviderId && visionModel ? `${visionProviderId}:${visionModel}` : ''

    const handleChatModelSelect = (val: string) => {
        if (!val) { setProviderId(''); setModel(''); return }
        const [pid, ...rest] = val.split(':')
        setProviderId(pid); setModel(rest.join(':'))
    }
    const handleKiModelSelect = (val: string) => {
        if (!val) { setKiProviderId(''); setKiModel(''); return }
        const [pid, ...rest] = val.split(':')
        setKiProviderId(pid); setKiModel(rest.join(':'))
    }
    const handleVisionModelSelect = (val: string) => {
        if (!val) { setVisionProviderId(''); setVisionModel(''); return }
        const [pid, ...rest] = val.split(':')
        setVisionProviderId(pid); setVisionModel(rest.join(':'))
    }

    const [saved, setSaved] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

    // (provider lookups now happen via per-type model config in chatModels/visionModels)

    const handleSave = async () => {
        setSaving(true)
        await updateWorkspace(ws.id, {
            name: name.trim(),
            description: description || null,
            icon: icon || null,
            llm_provider_id: providerId || null,
            llm_model: model || null,
            knowledge_intelligence_provider_id: kiProviderId || null,
            knowledge_intelligence_model: kiModel || null,
            vision_provider_id: visionProviderId || null,
            vision_model: visionModel || null,
        })
        setSaving(false); setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSaved()
    }

    const handleDelete = () => setDeleteConfirmOpen(true)

    const confirmDelete = async () => {
        setDeleteConfirmOpen(false)
        setDeleting(true)
        await deleteWorkspace(ws.id)
        onDeleted()
    }

    return (
        <div className="glass-card-hover transition-all duration-300">
            <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3"
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(p => !p)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setExpanded(p => !p)
                    }
                }}
            >
                <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                    {getWorkspaceIcon(ws.icon)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{ws.name}</span>
                        <span className="text-xs text-muted-foreground">{ws.knowledge_count} knowledge · {ws.conversation_count} chats</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ws.description || (ws.llm_provider_id ? `Provider override set` : 'Using global default provider')}
                    </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                    <button
                        className="btn-ghost p-1.5"
                        onClick={(e) => {
                            e.stopPropagation()
                            setExpanded(p => !p)
                        }}
                    >
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        className="btn-ghost p-1.5 text-red-400 hover:bg-destructive/10"
                        onClick={(e) => {
                            e.stopPropagation()
                            void handleDelete()
                        }}
                        disabled={deleting}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/50 px-4 py-4 space-y-3 animate-fade-in">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowIcons(v => !v)}
                                    className="input h-10 w-11 px-0 flex items-center justify-center"
                                    aria-label="Select workspace icon"
                                >
                                    {getWorkspaceIcon(icon)}
                                </button>
                                {showIcons && (
                                    <div className="absolute left-0 z-[140] mt-1 p-2 rounded-lg border border-border bg-popover shadow-xl grid grid-cols-5 gap-1 w-max min-w-44">
                                        {WORKSPACE_ICON_NAMES.map(ic => {
                                            const IconComp = WORKSPACE_ICONS[ic]
                                            return (
                                                <button
                                                    key={ic}
                                                    type="button"
                                                    onClick={() => { setIcon(ic); setShowIcons(false) }}
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors ${icon === ic ? 'bg-accent/20 ring-1 ring-accent' : ''}`}
                                                >
                                                    <IconComp className="w-4 h-4" />
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                            <input
                                className="input h-10 flex-1 text-sm"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                        <textarea className="input text-sm resize-none" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    <div className="border-t border-border/40 pt-3 space-y-3">
                        <p className="text-xs font-medium text-muted-foreground">AI Models <span className="text-xs font-normal opacity-60">(override global defaults per category for this workspace)</span></p>

                        {chatModels.length === 0 && visionModels.length === 0 && (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                <span>No models configured yet. Go to <strong>AI Models</strong> → <strong>Chat</strong> / <strong>Vision</strong> tabs to add models first.</span>
                            </div>
                        )}

                        {/* Workspace Agent */}
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                                <Bot className="w-3 h-3 text-accent" />
                                <p className="text-xs font-medium">Chat Model</p>
                                <span className="text-[10px] text-muted-foreground opacity-70">Used for chat and agent tool calls</span>
                            </div>
                            <select className="input text-sm" value={chatSelectValue} onChange={e => handleChatModelSelect(e.target.value)}>
                                <option value="">Use system default</option>
                                {chatModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Knowledge Intelligence */}
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                                <Brain className="w-3 h-3 text-violet-400" />
                                <p className="text-xs font-medium">Knowledge Intelligence</p>
                                <span className="text-[10px] text-muted-foreground opacity-70">Used for knowledge extraction and processing</span>
                            </div>
                            <select className="input text-sm" value={kiSelectValue} onChange={e => handleKiModelSelect(e.target.value)}>
                                <option value="">Use system default</option>
                                {chatModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Visual Model */}
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                                <Eye className="w-3 h-3 text-sky-400" />
                                <p className="text-xs font-medium">Vision Model</p>
                                <span className="text-[10px] text-muted-foreground opacity-70">Used for image and visual content extraction</span>
                            </div>
                            <select className="input text-sm" value={visionSelectValue} onChange={e => handleVisionModelSelect(e.target.value)}>
                                <option value="">Use system default</option>
                                {visionModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <button className="btn-primary text-xs py-1.5 px-3" onClick={handleSave} disabled={saving}>
                        {saved
                            ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
                            : saving
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <><Save className="w-3.5 h-3.5" /> Save</>}
                    </button>
                </div>
            )}
            <ConfirmModal
                open={deleteConfirmOpen}
                title={`Delete "${ws.name}"?`}
                message="This will permanently delete the workspace, all its knowledge, and all chat history. This action cannot be undone."
                confirmLabel="Delete Workspace"
                variant="danger"
                loading={deleting}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirmOpen(false)}
            />
        </div>
    )
}

function WorkspacesSettings({
    openCreateRequested,
    onCreateRequestConsumed,
}: {
    openCreateRequested?: boolean
    onCreateRequestConsumed?: () => void
}) {
    const qc = useQueryClient()
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces })
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })

    const [showAdd, setShowAdd] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [adding, setAdding] = useState(false)

    useEffect(() => {
        if (!openCreateRequested) return
        setShowAdd(true)
        onCreateRequestConsumed?.()
    }, [openCreateRequested, onCreateRequestConsumed])

    const handleAdd = async () => {
        if (!newName.trim()) return
        setAdding(true)
        await createWorkspace({ name: newName.trim(), description: newDesc || undefined })
        qc.invalidateQueries({ queryKey: ['workspaces'] })
        setNewName(''); setNewDesc(''); setShowAdd(false); setAdding(false)
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h3 className="font-semibold text-sm">Workspaces</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Configure each workspace's details, AI provider override, and model.
                    </p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> New Workspace
                </button>
            </div>

            {showAdd && (
                <div className="glass-card p-4 space-y-3 border border-accent/20 animate-fade-in">
                    <h4 className="text-sm font-semibold text-accent">New Workspace</h4>
                    <input className="input text-sm" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
                    <input className="input text-sm" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                    <div className="flex gap-2">
                        <button className="btn-primary text-xs py-1.5 px-3" onClick={handleAdd} disabled={!newName.trim() || adding}>
                            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Create
                        </button>
                        <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => setShowAdd(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {(workspaces as WorkspaceRow[]).map(ws => (
                <WorkspaceCard
                    key={ws.id}
                    workspace={ws}
                    providers={providers as ProviderRow[]}
                    onDeleted={() => qc.invalidateQueries({ queryKey: ['workspaces'] })}
                    onSaved={() => qc.invalidateQueries({ queryKey: ['workspaces'] })}
                />
            ))}

            {(workspaces as WorkspaceRow[]).length >= 2 && (
                <MergeWorkspacesSection workspaces={workspaces as WorkspaceRow[]} onMerged={() => qc.invalidateQueries({ queryKey: ['workspaces'] })} />
            )}
        </div>
    )
}

function MergeWorkspacesSection({ workspaces, onMerged }: { workspaces: WorkspaceRow[]; onMerged: () => void }) {
    const [open, setOpen] = useState(false)
    const [sourceId, setSourceId] = useState('')
    const [targetId, setTargetId] = useState('')
    const [deleteSource, setDeleteSource] = useState(true)
    const [merging, setMerging] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

    const handleMerge = async () => {
        if (!sourceId || !targetId || sourceId === targetId) return
        setMerging(true)
        setResult(null)
        try {
            const data = await mergeWorkspaces(targetId, sourceId, deleteSource)
            const msg = `Merged ${data.tables_updated} entity groups into target workspace.${data.source_deleted ? ' Source workspace deleted.' : ''}`
            setResult({ ok: true, message: msg })
            setSourceId('')
            setTargetId('')
            onMerged()
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(err)
            setResult({ ok: false, message: msg })
        } finally {
            setMerging(false)
        }
    }

    const sourceName = workspaces.find(w => w.id === sourceId)?.name
    const targetName = workspaces.find(w => w.id === targetId)?.name

    return (
        <div className="glass-card rounded-xl border border-border/60">
            <button
                type="button"
                onClick={() => setOpen(p => !p)}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                <Merge className="w-4 h-4" />
                <span>Merge Workspaces</span>
                <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
                    <p className="text-xs text-muted-foreground">
                        Move all knowledge, conversations, runs, outputs, and other entities from the source workspace into the target workspace.
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-xs">
                            <span className="text-muted-foreground font-medium">Source (merge from)</span>
                            <select className="input text-xs w-full" value={sourceId} onChange={e => setSourceId(e.target.value)}>
                                <option value="">Select source...</option>
                                {workspaces.filter(w => w.id !== targetId).map(w => (
                                    <option key={w.id} value={w.id}>{getWorkspaceIcon(w.icon)} {w.name}</option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-1.5 text-xs">
                            <span className="text-muted-foreground font-medium">Target (merge into)</span>
                            <select className="input text-xs w-full" value={targetId} onChange={e => setTargetId(e.target.value)}>
                                <option value="">Select target...</option>
                                {workspaces.filter(w => w.id !== sourceId).map(w => (
                                    <option key={w.id} value={w.id}>{getWorkspaceIcon(w.icon)} {w.name}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input type="checkbox" className="accent-accent" checked={deleteSource} onChange={e => setDeleteSource(e.target.checked)} />
                        Delete source workspace after merge
                    </label>

                    {sourceId && targetId && sourceId !== targetId && (
                        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                            <AlertCircle className="w-3.5 h-3.5 inline mr-1.5" />
                            All entities from <strong>{sourceName}</strong> will be moved into <strong>{targetName}</strong>.
                            {deleteSource ? ' The source workspace will be deleted.' : ''} This cannot be undone.
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            className="btn-primary text-xs py-1.5 px-4 gap-1.5"
                            onClick={handleMerge}
                            disabled={!sourceId || !targetId || sourceId === targetId || merging}
                        >
                            {merging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
                            Merge
                        </button>
                    </div>

                    {result && (
                        <div className={`rounded-lg border px-3 py-2 text-xs ${result.ok
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-red-500/30 bg-red-500/10 text-red-300'
                        }`}>
                            {result.ok ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" /> : <AlertCircle className="w-3.5 h-3.5 inline mr-1.5" />}
                            {result.message}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default WorkspacesSettings
