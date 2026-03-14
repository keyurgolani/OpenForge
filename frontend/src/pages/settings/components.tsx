import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listWorkspaces } from '@/lib/api'
import {
    Loader2, CheckCircle, AlertCircle, Circle,
} from 'lucide-react'
import type { ToolMeta, ToolParam, LocalModel } from './types'
import { QUALITY_COLORS, VRAM_TIER_COLORS } from './constants'

export function WorkspaceFilterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const { data: workspaces = [] } = useQuery({ queryKey: ['workspaces'], queryFn: listWorkspaces, staleTime: 60_000 })
    const wsList = workspaces as { id: string; name: string; icon: string }[]
    return (
        <select className="input text-xs py-1.5 pr-7 w-auto" value={value} onChange={e => onChange(e.target.value)}>
            <option value="">All workspaces</option>
            {wsList.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
        </select>
    )
}

export function parseBoolSetting(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true
        if (['false', '0', 'no', 'off'].includes(normalized)) return false
    }
    return fallback
}

export function TogglePill({ checked }: { checked: boolean }) {
    return (
        <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-muted/70'}`}
            aria-hidden
        >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </span>
    )
}

export function StatusIcon({ status }: { status: string }) {
    if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
    if (status === 'done') return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
    if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    return <Circle className="w-3.5 h-3.5 text-muted-foreground" />
}

export function extractParams(tool: ToolMeta): ToolParam[] {
    const props = tool.input_schema?.properties ?? {}
    const required = new Set(tool.input_schema?.required ?? [])
    return Object.entries(props).map(([name, schema]) => ({
        name,
        type: schema.type === 'array' && schema.items?.type ? `${schema.type}<${schema.items.type}>` : (schema.type ?? 'any'),
        description: schema.description,
        required: required.has(name),
        enumValues: schema.enum,
        default: schema.default,
    }))
}

export function LocalModelPicker({ models, selected, onSelect }: {
    models: LocalModel[]
    selected: string
    onSelect: (id: string) => void
}) {
    return (
        <div className="grid grid-cols-1 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {models.map(m => {
                const isSelected = selected === m.id
                return (
                    <button
                        key={m.id}
                        onClick={() => onSelect(m.id)}
                        className={`text-left p-3 rounded-xl border transition-all duration-200 ${isSelected
                            ? 'border-accent bg-accent/10 shadow-glass-sm'
                            : 'border-border/50 hover:border-border hover:bg-muted/20'
                        }`}
                    >
                        <div className="flex items-start gap-2">
                            <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex-shrink-0 transition-colors ${isSelected ? 'bg-accent border-accent' : 'border-border'}`} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                    <span className={`text-xs font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>{m.name}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${QUALITY_COLORS[m.quality]}`}>{m.quality}</span>
                                    <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.diskSize} disk</span>
                                    <span className="text-[9px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{m.vramReq} VRAM</span>
                                    {m.dims && <span className="text-[9px] text-muted-foreground">{m.dims}d</span>}
                                </div>
                                {m.recommendedFor && m.recommendedFor.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                        <span className="text-[9px] text-muted-foreground">Recommended for:</span>
                                        {m.recommendedFor.map(tier => (
                                            <span key={tier} className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${VRAM_TIER_COLORS[tier]}`}>{tier} VRAM</span>
                                        ))}
                                    </div>
                                )}
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                            </div>
                        </div>
                    </button>
                )
            })}
        </div>
    )
}
