import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, ChevronDown, ChevronRight, Search, AlertCircle, Settings2, Wrench,
} from 'lucide-react'
import { getToolRegistry, listToolPermissions, setToolPermission } from '@/lib/api'
import type { ToolMeta, ToolParam } from './types'
import { RISK_STYLES, CATEGORY_ICONS, PERMISSION_OPTIONS } from './constants'
import { extractParams } from './components'

function ToolCard({ tool, permission, onPermissionChange }: {
    tool: ToolMeta
    permission: string
    onPermissionChange: (toolId: string, perm: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [showRaw, setShowRaw] = useState(false)
    const params = extractParams(tool)
    const action = tool.id.split('.').slice(1).join('.')

    return (
        <div className="glass-card rounded-xl border-border/50 overflow-hidden">
            <div className="flex items-start">
                <button
                    type="button"
                    className="flex-1 flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                    onClick={() => setExpanded(v => !v)}
                >
                    {expanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{tool.display_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${RISK_STYLES[tool.risk_level] ?? RISK_STYLES.low}`}>
                                {tool.risk_level}
                            </span>
                            {params.length > 0 && (
                                <span className="text-[10px] text-muted-foreground/60">{params.length} param{params.length !== 1 ? 's' : ''}</span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
                        <p className="text-[10px] font-mono text-accent/60 mt-0.5">
                            <span className="text-muted-foreground/70">{tool.category}</span>
                            <span className="text-muted-foreground/70">.</span>
                            {action}
                        </p>
                    </div>
                </button>

                {/* Permission selector */}
                <div className="flex items-center gap-0.5 px-3 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {PERMISSION_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onPermissionChange(tool.id, opt.value)}
                            className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                                permission === opt.value
                                    ? opt.active
                                    : `${opt.inactive} hover:text-muted-foreground/70 hover:bg-muted/20`
                            }`}
                            title={`Set permission to ${opt.label}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {expanded && (
                <div className="border-t border-border/60 px-4 py-3 space-y-3 animate-fade-in">
                    {/* Full description */}
                    <p className="text-xs text-foreground/70 leading-relaxed">{tool.description}</p>

                    {/* Parameters table */}
                    {params.length > 0 && (
                        <div>
                            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">Parameters</div>
                            <div className="overflow-x-auto rounded-lg border border-border/60">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="border-b border-border/60 bg-muted/20">
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Name</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Type</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Req</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {params.map(p => (
                                            <tr key={p.name} className="border-b border-border/50 last:border-0">
                                                <td className="px-3 py-1.5 font-mono text-accent/80">{p.name}</td>
                                                <td className="px-3 py-1.5 font-mono text-blue-400/80">{p.type}</td>
                                                <td className="px-3 py-1.5">
                                                    {p.required
                                                        ? <span className="text-amber-400">●</span>
                                                        : <span className="text-muted-foreground/60">○</span>}
                                                </td>
                                                <td className="px-3 py-1.5 text-muted-foreground">
                                                    {p.description ?? '—'}
                                                    {p.enumValues && (
                                                        <span className="ml-1 text-purple-400/80">
                                                            [{p.enumValues.join(', ')}]
                                                        </span>
                                                    )}
                                                    {p.default !== undefined && (
                                                        <span className="ml-1 text-muted-foreground/70">
                                                            (default: {String(p.default)})
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {params.length === 0 && (
                        <p className="text-xs text-muted-foreground/70 italic">No parameters — call with empty object.</p>
                    )}

                    {/* Raw schema toggle */}
                    <div>
                        <button
                            type="button"
                            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 transition-colors"
                            onClick={() => setShowRaw(v => !v)}
                        >
                            {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            Raw JSON schema
                        </button>
                        {showRaw && (
                            <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-foreground/60 bg-muted/30 rounded-lg p-3 border border-border/60 max-h-64">
                                {JSON.stringify(tool.input_schema, null, 2)}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function ToolsTab() {
    const qc = useQueryClient()
    const [query, setQuery] = useState('')
    const [activeCategory, setActiveCategory] = useState<string>('all')

    const { data, isLoading } = useQuery({
        queryKey: ['tool-registry'],
        queryFn: getToolRegistry,
        retry: false,
        staleTime: 60_000,
    })

    const { data: permData } = useQuery({
        queryKey: ['tool-permissions'],
        queryFn: listToolPermissions,
        retry: false,
        staleTime: 30_000,
    })

    // Build permission lookup map: tool_id → permission string
    const permMap = useMemo(() => {
        const m: Record<string, string> = {}
        if (Array.isArray(permData)) {
            for (const p of permData) m[p.tool_id] = p.permission
        }
        return m
    }, [permData])

    const handlePermissionChange = useCallback(async (toolId: string, perm: string) => {
        try {
            await setToolPermission(toolId, perm)
            qc.invalidateQueries({ queryKey: ['tool-permissions'] })
        } catch {
            // toast handled by axios interceptor
        }
    }, [qc])

    const tools: ToolMeta[] = data?.tools ?? []
    const available: boolean = data?.tool_server_available !== false

    const categories = ['all', ...Array.from(new Set(tools.map(t => t.category))).sort()]

    const filtered = tools.filter(t => {
        const matchCat = activeCategory === 'all' || t.category === activeCategory
        const q = query.toLowerCase()
        const matchQ = !q || t.id.includes(q) || t.display_name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
        return matchCat && matchQ
    })

    const grouped = filtered.reduce<Record<string, ToolMeta[]>>((acc, t) => {
        ;(acc[t.category] ??= []).push(t)
        return acc
    }, {})

    return (
        <div className="space-y-5">
            <div>
                <h3 className="font-semibold text-sm">Agent Tools</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    All tools available to the agent. Tools are provided by the <span className="font-mono text-accent">tool-server</span> and executed in the workspace container.
                </p>
            </div>

            {!available && !isLoading && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        <span className="font-medium">Tool server not running.</span>{' '}
                        Start the <span className="font-mono">tool-server</span> container to see registered tools.
                    </span>
                </div>
            )}

            {isLoading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {!isLoading && available && (
                <>
                    {/* Search + category filter */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                className="input text-sm pl-8"
                                placeholder="Search tools by name, ID, or description…"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-1 flex-wrap">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setActiveCategory(cat)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${activeCategory === cat
                                        ? 'bg-accent/25 text-accent ring-1 ring-accent/30'
                                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
                                >
                                    {cat !== 'all' && (CATEGORY_ICONS[cat] ?? <Wrench className="w-3.5 h-3.5" />)}
                                    {cat === 'all' ? `All (${tools.length})` : cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tool groups */}
                    {filtered.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground glass-card rounded-xl">
                            <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No tools match your search.</p>
                        </div>
                    )}

                    {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catTools]) => (
                        <div key={cat} className="space-y-2">
                            <div className="flex items-center gap-2 py-1">
                                <span className="text-muted-foreground/60">{CATEGORY_ICONS[cat] ?? <Wrench className="w-4 h-4" />}</span>
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground capitalize">{cat}</h4>
                                <span className="text-[10px] text-muted-foreground/70">{catTools.length} tool{catTools.length !== 1 ? 's' : ''}</span>
                                <div className="flex-1 h-px bg-border/40" />
                            </div>
                            {catTools.map(tool => (
                                <ToolCard
                                    key={tool.id}
                                    tool={tool}
                                    permission={permMap[tool.id] ?? 'default'}
                                    onPermissionChange={handlePermissionChange}
                                />
                            ))}
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}

export default ToolsTab
