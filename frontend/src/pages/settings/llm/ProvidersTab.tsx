import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, Trash2, CheckCircle2, XCircle, Plus,
    ChevronDown, ChevronUp, Eye, EyeOff, Globe2, Server,
    Save, Sliders,
} from 'lucide-react'
import { ProviderIcon } from '@/components/shared/ProviderIcon'
import { isLocalProvider, sanitizeProviderDisplayName } from '@/lib/provider-display'
import {
    listProviders, createProvider, updateProvider, deleteProvider,
    testConnection,
} from '@/lib/api'
import type { ProviderRow } from '../types'
import { PROVIDER_META, PROVIDER_NAMES } from '../constants'

// ── Providers Tab ─────────────────────────────────────────────────────────────
function ProvidersTab() {
    const qc = useQueryClient()
    const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: listProviders })
    const [expanded, setExpanded] = useState<string | null>(null)
    const [showAdd, setShowAdd] = useState(false)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-sm">AI Models</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Configure provider credentials and endpoints. After adding a provider, assign models to Reasoning, Vision, Embedding, or Audio tabs.
                    </p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowAdd(p => !p)}>
                    <Plus className="w-3.5 h-3.5" /> {showAdd ? 'Close' : 'Add Provider'}
                </button>
            </div>

            {showAdd && (
                <AddProviderPanel onAdded={() => { qc.invalidateQueries({ queryKey: ['providers'] }); setShowAdd(false) }} />
            )}

            {(providers as ProviderRow[]).map(p => (
                <ProviderCard
                    key={p.id}
                    provider={p}
                    expanded={expanded === p.id}
                    onToggle={() => setExpanded(prev => prev === p.id ? null : p.id)}
                    onDelete={() => deleteProvider(p.id).then(() => qc.invalidateQueries({ queryKey: ['providers'] }))}
                />
            ))}

            {(providers as unknown[]).length === 0 && !showAdd && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                    <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No AI providers configured yet.</p>
                    <p className="text-xs mt-1 opacity-70">Add your first provider to start configuring models.</p>
                </div>
            )}
        </div>
    )
}

// ── Add Provider Panel ────────────────────────────────────────────────────────
function AddProviderPanel({ onAdded }: { onAdded: () => void }) {
    const [providerName, setProviderName] = useState('openai')
    const [displayName, setDisplayName] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [baseUrl, setBaseUrl] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const meta = PROVIDER_META[providerName]

    const handleProviderChange = (id: string) => {
        setProviderName(id); setDisplayName(''); setApiKey(''); setBaseUrl('')
        setShowKey(false); setTestResult(null); setSaveError(null); setShowAdvanced(false)
    }

    const handleTest = async () => {
        setTesting(true); setTestResult(null)
        try {
            // Create a temporary provider to test
            const temp = await createProvider({
                provider_name: providerName,
                display_name: displayName || meta?.name || providerName,
                api_key: apiKey || undefined,
                base_url: baseUrl || undefined,
            })
            const result = await testConnection(temp.id)
            // Delete the temp provider after testing (will be recreated on save)
            await import('@/lib/api').then(a => a.deleteProvider(temp.id))
            setTestResult(result)
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setTestResult({ success: false, message: err?.response?.data?.detail ?? err?.message ?? 'Test failed' })
        } finally { setTesting(false) }
    }

    const handleSave = async () => {
        setSaving(true); setSaveError(null)
        try {
            await createProvider({
                provider_name: providerName,
                display_name: displayName || meta?.name || providerName,
                api_key: apiKey || undefined,
                base_url: baseUrl || undefined,
            })
            onAdded()
        } catch (e: unknown) {
            const err = e as { response?: { data?: { detail?: string } }; message?: string }
            setSaveError(err?.response?.data?.detail ?? err?.message ?? 'Save failed')
        } finally { setSaving(false) }
    }

    const canSave = meta?.needsUrl ? !!baseUrl : (!!apiKey || isLocalProvider(providerName))

    return (
        <div className="glass-card shadow-glass-lg p-5 space-y-4 border border-accent/30 animate-fade-in">
            <h4 className="text-sm font-semibold text-accent">Add Provider</h4>

            {/* Step 1 — Provider type */}
            <div>
                <label className="text-xs text-muted-foreground mb-2 block font-medium">1. Select provider type</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {PROVIDER_NAMES.map(id => {
                        const m = PROVIDER_META[id]
                        return (
                            <button key={id} onClick={() => handleProviderChange(id)}
                                className={`p-2 rounded-xl border text-center text-xs transition-all duration-300 ${providerName === id ? `${m.color} border-accent ring-2 ring-accent/30 scale-105 shadow-glass-md` : 'border-border/50 hover:bg-muted/30 hover:shadow-glass-sm'}`}
                            >
                                <div className="flex justify-center mb-1.5">
                                    <ProviderIcon providerId={id} className="w-4 h-4" />
                                </div>
                                <div className="text-[10px] leading-tight font-medium truncate">{m.name}</div>
                                {isLocalProvider(id) && <div className="mt-1 text-[9px] text-lime-300/90 font-medium">Local</div>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Step 2 — Credentials */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium block">2. Enter credentials</label>
                {isLocalProvider(providerName) && (
                    <p className="text-[10px] text-lime-300/90">Local provider — no API key required</p>
                )}
                <input className="input text-sm" placeholder={`Display name (default: ${meta?.name})`} value={displayName} onChange={e => setDisplayName(e.target.value)} />

                {meta?.needsUrl ? (
                    <>
                        <input className="input text-sm" placeholder={meta.urlPlaceholder ?? 'https://your-api.com'} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                        <div className="relative">
                            <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder={meta.placeholder} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="relative">
                            <input type={showKey ? 'text' : 'password'} className="input text-sm pr-10" placeholder={meta?.placeholder ?? 'API Key'} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors" onClick={() => setShowAdvanced(!showAdvanced)}>
                            <Sliders className="w-3 h-3" /> {showAdvanced ? 'Hide advanced' : 'Custom Base URL'}
                        </button>
                        {showAdvanced && (
                            <div className="animate-fade-in pt-1">
                                <label className="text-[10px] text-muted-foreground mb-1 block">Base URL Override</label>
                                <input className="input text-sm" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Step 3 — Test connection */}
            <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">3. Test connection</label>
                <button className="btn-ghost text-xs border border-border w-full justify-center py-2" onClick={handleTest} disabled={testing || !canSave}>
                    {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe2 className="w-3.5 h-3.5" />}
                    {testing ? 'Testing…' : 'Test Connection'}
                </button>
                {testResult && (
                    <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-red-300 border border-destructive/20'}`}>
                        {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                        {testResult.message}
                    </div>
                )}
            </div>

            {saveError && <div className="text-xs p-2.5 rounded-lg bg-destructive/10 text-red-300 border border-destructive/20">{saveError}</div>}

            <button className="btn-primary w-full justify-center py-2.5" onClick={handleSave} disabled={saving || !canSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Provider'}
            </button>
            <p className="text-[10px] text-muted-foreground text-center">After saving, add models in the Reasoning, Vision, Embedding, or Audio tabs</p>
        </div>
    )
}

// ── Provider Card ────────────────────────────────────────────────────────────
function ProviderCard({ provider, expanded, onToggle, onDelete }: {
    provider: ProviderRow; expanded: boolean
    onToggle: () => void; onDelete: () => void
}) {
    const qc = useQueryClient()
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
    const [editApiKey, setEditApiKey] = useState('')
    const [editBaseUrl, setEditBaseUrl] = useState(provider.base_url ?? '')
    const [editDisplayName, setEditDisplayName] = useState(provider.display_name ?? '')
    const [showKey, setShowKey] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const meta = PROVIDER_META[provider.provider_name]

    const handleTest = async () => {
        setTesting(true); setTestResult(null)
        try { setTestResult(await testConnection(provider.id)) }
        catch { setTestResult({ success: false, message: 'Request failed' }) }
        finally { setTesting(false) }
    }

    const handleSave = async () => {
        setSaving(true)
        await updateProvider(provider.id, {
            display_name: editDisplayName || undefined,
            api_key: editApiKey || undefined,
            base_url: editBaseUrl || undefined,
        })
        qc.invalidateQueries({ queryKey: ['providers'] })
        setSaving(false); setSaved(true); setEditApiKey('')
        setTimeout(() => setSaved(false), 2000)
    }

    return (
        <div className="glass-card-hover transition-all duration-300">
            <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={onToggle} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
            >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${meta?.color ?? 'bg-muted border-border'}`}>
                    <ProviderIcon providerId={provider.provider_name} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{sanitizeProviderDisplayName(provider.display_name) || provider.provider_name}</span>
                        <span className="chip-muted text-[10px]">{provider.provider_name}</span>
                        {isLocalProvider(provider.provider_name) && <span className="chip-muted text-[10px]">Local</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {provider.has_api_key ? 'Key configured' : provider.base_url ?? 'No credentials set'}
                    </p>
                </div>
                <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-ghost p-1.5 text-red-400" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></button>
                    <button className="btn-ghost p-1.5" onClick={onToggle}>
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/50 px-4 py-4 space-y-4 animate-fade-in">
                    {/* Edit credentials */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Edit Credentials</label>
                        <input className="input text-sm" placeholder="Display name" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} />
                        {meta?.needsUrl && (
                            <input className="input text-sm" placeholder={meta.urlPlaceholder ?? 'Base URL'} value={editBaseUrl} onChange={e => setEditBaseUrl(e.target.value)} />
                        )}
                        <div className="relative">
                            <input
                                type={showKey ? 'text' : 'password'}
                                className="input text-sm pr-10"
                                placeholder={provider.has_api_key ? '••••••• (leave blank to keep current)' : (meta?.placeholder ?? 'API Key')}
                                value={editApiKey}
                                onChange={e => setEditApiKey(e.target.value)}
                                autoComplete="off"
                            />
                            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKey(v => !v)}>
                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {!meta?.needsUrl && (
                            <input className="input text-sm" placeholder="Base URL override (optional)" value={editBaseUrl} onChange={e => setEditBaseUrl(e.target.value)} />
                        )}
                        <button className="btn-primary text-xs py-1.5 px-3" onClick={handleSave} disabled={saving}>
                            {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
                        </button>
                    </div>

                    {/* Test connection */}
                    <div className="space-y-2 pt-2 border-t border-border/30">
                        <button className="btn-ghost text-xs border border-border w-full justify-center py-2" onClick={handleTest} disabled={testing}>
                            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe2 className="w-3.5 h-3.5" />}
                            {testing ? 'Testing…' : 'Test Connection'}
                        </button>
                        {testResult && (
                            <div className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${testResult.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-destructive/10 text-red-300 border border-destructive/20'}`}>
                                {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                                {testResult.message}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default ProvidersTab
