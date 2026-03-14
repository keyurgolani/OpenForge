import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, CheckCircle2, Save, Sliders, RotateCcw,
} from 'lucide-react'
import { listPrompts, updatePrompt } from '@/lib/api'
import CodeMirrorPromptEditor from '@/components/shared/CodeMirrorPromptEditor'
import type { PromptEntry, PromptsSubTab } from './types'
import { PROMPTS_SUB_TABS } from './constants'

function PromptsTab() {
    const [activeSubTab, setActiveSubTab] = useState<PromptsSubTab>('agent')
    const qc = useQueryClient()
    const { data: prompts = [], isLoading } = useQuery<PromptEntry[]>({
        queryKey: ['prompts'],
        queryFn: listPrompts,
    })

    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState<Record<string, boolean>>({})
    const [saved, setSaved] = useState<Record<string, boolean>>({})

    useEffect(() => {
        const d: Record<string, string> = {}
        for (const p of (prompts as PromptEntry[])) {
            if (!(p.id in drafts)) d[p.id] = p.override ?? ''
        }
        if (Object.keys(d).length > 0) setDrafts(prev => ({ ...d, ...prev }))
    }, [prompts]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async (p: PromptEntry) => {
        setSaving(s => ({ ...s, [p.id]: true }))
        const val = drafts[p.id]?.trim() || null
        await updatePrompt(p.id, { override: val })
        qc.invalidateQueries({ queryKey: ['prompts'] })
        setSaving(s => ({ ...s, [p.id]: false }))
        setSaved(s => ({ ...s, [p.id]: true }))
        setTimeout(() => setSaved(s => ({ ...s, [p.id]: false })), 2000)
    }

    const handleReset = async (p: PromptEntry) => {
        setSaving(s => ({ ...s, [p.id]: true }))
        await updatePrompt(p.id, { override: null })
        qc.invalidateQueries({ queryKey: ['prompts'] })
        setDrafts(d => ({ ...d, [p.id]: '' }))
        setSaving(s => ({ ...s, [p.id]: false }))
    }

    const insertVariable = (promptId: string, variable: string) => {
        setDrafts(d => ({ ...d, [promptId]: (d[promptId] ?? '') + variable }))
    }

    // Map prompts to sub-tabs based on their role
    const promptsBySubTab = useMemo(() => {
        const result: Record<PromptsSubTab, PromptEntry[]> = {
            agent: [],
            knowledge: [],
            extraction: [],
        }
        for (const p of (prompts as PromptEntry[])) {
            // Categorize based on role field
            if (p.role === 'agent' || p.role === 'chat') {
                result.agent.push(p)
            } else if (p.role === 'knowledge' || p.role === 'intelligence') {
                result.knowledge.push(p)
            } else if (p.role === 'extraction' || p.role === 'content') {
                result.extraction.push(p)
            } else {
                // Fallback to category-based mapping
                if (p.category === 'chat') {
                    result.agent.push(p)
                } else if (p.category === 'knowledge') {
                    result.knowledge.push(p)
                } else {
                    result.extraction.push(p)
                }
            }
        }
        return result
    }, [prompts])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-5">
            <div className="flex shrink-0 gap-2 p-1.5 glass-card w-fit rounded-2xl overflow-x-auto min-h-[48px]">
                {PROMPTS_SUB_TABS.map(tab => {
                    const Icon = tab.icon
                    const count = promptsBySubTab[tab.id].length
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex min-h-8 items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeSubTab === tab.id
                                ? 'bg-accent/20 text-accent shadow-glass-inset ring-1 ring-accent/30'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeSubTab === tab.id ? 'bg-accent/20' : 'bg-muted/40'}`}>
                                {count}
                            </span>
                        </button>
                    )
                })}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
                <div className="glass-card p-4 border-accent/20 bg-accent/5">
                    <div className="flex items-start gap-3">
                        <Sliders className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                            <p className="font-medium text-foreground mb-1">Customise AI Prompts</p>
                            <p className="text-muted-foreground text-xs leading-relaxed">
                                Override the system prompts used for each AI task. Leave a prompt blank to use the default.
                                Click variable chips to insert them into your custom prompt.
                            </p>
                        </div>
                    </div>
                </div>

                <PromptsSubTabContent
                    prompts={promptsBySubTab[activeSubTab]}
                    drafts={drafts}
                    saving={saving}
                    saved={saved}
                    onSave={handleSave}
                    onReset={handleReset}
                    onInsertVariable={insertVariable}
                    setDrafts={setDrafts}
                />
            </div>
        </div>
    )
}

function PromptsSubTabContent({
    prompts,
    drafts,
    saving,
    saved,
    onSave,
    onReset,
    onInsertVariable,
    setDrafts,
}: {
    prompts: PromptEntry[]
    drafts: Record<string, string>
    saving: Record<string, boolean>
    saved: Record<string, boolean>
    onSave: (p: PromptEntry) => void
    onReset: (p: PromptEntry) => void
    onInsertVariable: (promptId: string, variable: string) => void
    setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
    if (prompts.length === 0) {
        return (
            <div className="text-center py-14 text-muted-foreground glass-card rounded-xl">
                <Sliders className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No prompts in this category.</p>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {prompts.map(p => {
                const draft = drafts[p.id] ?? ''
                const isModified = draft !== (p.override ?? '')
                const hasOverride = !!p.override
                return (
                    <div key={p.id} className="glass-card p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-medium text-sm">{p.label}</span>
                                    {hasOverride && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/15 text-accent font-medium">Custom</span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">{p.description}</p>
                            </div>
                        </div>

                        {p.variables.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="text-[10px] text-muted-foreground">Insert variable:</span>
                                {p.variables.map(v => (
                                    <button
                                        key={v}
                                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted/50 border border-border/50 hover:bg-accent/20 hover:text-accent hover:border-accent/30 transition-colors"
                                        onClick={() => onInsertVariable(p.id, v)}
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Default system prompt</p>
                            <div className="bg-muted/20 border border-border/40 rounded-lg p-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                                {p.default}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
                                Custom override {!hasOverride && '(leave blank to use default)'}
                            </p>
                            <CodeMirrorPromptEditor
                                value={draft}
                                placeholder={p.default}
                                onChange={(value) => setDrafts(d => ({ ...d, [p.id]: value }))}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                className="btn-primary text-xs py-1.5 px-3"
                                disabled={saving[p.id] || !isModified}
                                onClick={() => onSave(p)}
                            >
                                {saving[p.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved[p.id] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                {saved[p.id] ? 'Saved!' : 'Save override'}
                            </button>
                            {hasOverride && (
                                <button
                                    className="btn-ghost text-xs py-1.5 px-3 text-muted-foreground"
                                    disabled={saving[p.id]}
                                    onClick={() => onReset(p)}
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> Reset to default
                                </button>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

export default PromptsTab
