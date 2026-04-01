import { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Loader2, ChevronDown, ChevronRight, Search, AlertCircle, Settings2,
    Wrench, Blocks, Plug, Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getToolRegistry, listToolPermissions, setToolPermission } from '@/lib/api'
import type { ToolMeta } from './types'
import { RISK_STYLES, CATEGORY_ICONS, CATEGORY_LABELS_TOOLS, PERMISSION_OPTIONS } from './constants'
import { extractParams } from './components'
import SkillsTab from './SkillsTab'
import MCPTab from './MCPTab'

// ── Tool Card (same as ToolsTab) ──────────────────────────────────────────

function ToolCard({ tool, permission, onPermissionChange }: {
    tool: ToolMeta
    permission: string
    onPermissionChange: (toolId: string, perm: string) => void
}) {
    const [expanded, setExpanded] = useState(false)
    const [showRaw, setShowRaw] = useState(false)
    const params = extractParams(tool)
    const action = tool.id.startsWith(tool.category + '.') ? tool.id.slice(tool.category.length + 1) : tool.id.split('.').pop() ?? tool.id

    return (
        <div className="glass-card rounded-xl border-border/20 overflow-hidden">
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
                <div className="border-t border-border/25 px-4 py-3 space-y-3 animate-fade-in">
                    <p className="text-xs text-foreground/70 leading-relaxed">{tool.description}</p>

                    {params.length > 0 && (
                        <div>
                            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">Parameters</div>
                            <div className="overflow-x-auto rounded-lg border border-border/25">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="border-b border-border/25 bg-muted/20">
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Name</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Type</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Req</th>
                                            <th className="px-3 py-1.5 text-left font-medium text-muted-foreground/80">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {params.map(p => (
                                            <tr key={p.name} className="border-b border-border/20 last:border-0">
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
                            <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-foreground/60 bg-muted/30 rounded-lg p-3 border border-border/25 max-h-64">
                                {JSON.stringify(tool.input_schema, null, 2)}
                            </pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function categoryLabel(cat: string): string {
    if (CATEGORY_LABELS_TOOLS[cat]) return CATEGORY_LABELS_TOOLS[cat]
    if (cat.startsWith('mcp:')) return cat.slice(4)
    return cat.charAt(0).toUpperCase() + cat.slice(1)
}

function isPlatformCategory(cat: string): boolean {
    return cat.startsWith('platform.')
}

function isMcpCategory(cat: string): boolean {
    return cat.startsWith('mcp:')
}

// ── Tool Category Detail Panel ────────────────────────────────────────────

function ToolCategoryPanel({
    category,
    tools,
    permMap,
    onPermissionChange,
}: {
    category: string
    tools: ToolMeta[]
    permMap: Record<string, string>
    onPermissionChange: (toolId: string, perm: string) => void
}) {
    return (
        <div className="space-y-5">
            <div>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground/60">{CATEGORY_ICONS[category] ?? <Wrench className="w-4 h-4" />}</span>
                    <h3 className="font-semibold text-sm">{categoryLabel(category)} Tools</h3>
                    <span className="text-[10px] text-muted-foreground/70">{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                    Tools in the <span className="font-mono text-accent">{category}</span> category.
                    Set permissions per tool: Default, Allowed, Approval (HITL), or Blocked.
                </p>
            </div>
            <div className="space-y-2">
                {tools.map(tool => (
                    <ToolCard
                        key={tool.id}
                        tool={tool}
                        permission={permMap[tool.id] ?? 'default'}
                        onPermissionChange={onPermissionChange}
                    />
                ))}
            </div>
        </div>
    )
}

// ── Selection types ───────────────────────────────────────────────────────

type Selection =
    | { kind: 'category'; category: string }
    | { kind: 'skills' }
    | { kind: 'mcp' }

// ── Main Page ─────────────────────────────────────────────────────────────

export function CapabilitiesPage() {
    const qc = useQueryClient()
    const [query, setQuery] = useState('')
    const [selected, setSelected] = useState<Selection | null>(null)

    // Fetch tools
    const { data, isLoading: toolsLoading } = useQuery({
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
            // handled by interceptor
        }
    }, [qc])

    const tools: ToolMeta[] = data?.tools ?? []
    const toolServerAvailable: boolean = data?.tool_server_available !== false

    // Group tools by category
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const t of tools) {
            counts[t.category] = (counts[t.category] ?? 0) + 1
        }
        return counts
    }, [tools])

    const allCategories = Object.keys(categoryCounts).sort()
    const coreCategories = allCategories.filter(c => !isPlatformCategory(c) && !isMcpCategory(c))
    const platformCategories = allCategories.filter(c => isPlatformCategory(c))
    const mcpToolCategories = allCategories.filter(c => isMcpCategory(c))

    // Tools grouped by category for the right panel
    const toolsByCategory = useMemo(() => {
        const map: Record<string, ToolMeta[]> = {}
        for (const t of tools) {
            ;(map[t.category] ??= []).push(t)
        }
        return map
    }, [tools])

    // Filter sidebar items by search query
    const q = query.toLowerCase().trim()

    const filteredCoreCategories = useMemo(() => {
        if (!q) return coreCategories
        return coreCategories.filter(cat => {
            if (categoryLabel(cat).toLowerCase().includes(q)) return true
            return (toolsByCategory[cat] ?? []).some(t =>
                t.display_name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
            )
        })
    }, [q, coreCategories, toolsByCategory])

    const filteredPlatformCategories = useMemo(() => {
        if (!q) return platformCategories
        return platformCategories.filter(cat => {
            if (categoryLabel(cat).toLowerCase().includes(q)) return true
            return (toolsByCategory[cat] ?? []).some(t =>
                t.display_name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
            )
        })
    }, [q, platformCategories, toolsByCategory])

    const filteredMcpToolCategories = useMemo(() => {
        if (!q) return mcpToolCategories
        return mcpToolCategories.filter(cat => {
            if (categoryLabel(cat).toLowerCase().includes(q)) return true
            return (toolsByCategory[cat] ?? []).some(t =>
                t.display_name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
            )
        })
    }, [q, mcpToolCategories, toolsByCategory])

    const showSkills = !q || 'skills'.includes(q) || 'manage skills'.includes(q)
    const showMcp = !q || 'mcp'.includes(q) || 'servers'.includes(q) || 'manage servers'.includes(q)

    // Auto-select first item if nothing is selected yet
    const effectiveSelection = useMemo(() => {
        if (selected) return selected
        if (filteredCoreCategories.length > 0) return { kind: 'category' as const, category: filteredCoreCategories[0] }
        if (filteredPlatformCategories.length > 0) return { kind: 'category' as const, category: filteredPlatformCategories[0] }
        if (filteredMcpToolCategories.length > 0) return { kind: 'category' as const, category: filteredMcpToolCategories[0] }
        if (showSkills) return { kind: 'skills' as const }
        if (showMcp) return { kind: 'mcp' as const }
        return null
    }, [selected, filteredCoreCategories, filteredPlatformCategories, filteredMcpToolCategories, showSkills, showMcp])

    const isSelected = (sel: Selection): boolean => {
        if (!effectiveSelection) return false
        if (sel.kind !== effectiveSelection.kind) return false
        if (sel.kind === 'category' && effectiveSelection.kind === 'category') return sel.category === effectiveSelection.category
        return true
    }

    // Determine what tools to show for the selected category (filtered by search if needed)
    const selectedCategoryTools = useMemo(() => {
        if (!effectiveSelection || effectiveSelection.kind !== 'category') return []
        const catTools = toolsByCategory[effectiveSelection.category] ?? []
        if (!q) return catTools
        return catTools.filter(t =>
            t.display_name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
        )
    }, [effectiveSelection, toolsByCategory, q])

    const hasAnyToolCategories = filteredCoreCategories.length > 0 || filteredPlatformCategories.length > 0 || filteredMcpToolCategories.length > 0

    return (
        <div className="flex h-full">
            {/* Left sidebar */}
            <div className="w-72 flex-shrink-0 border-r border-border/25 overflow-y-auto p-4 space-y-1">
                {/* Search */}
                <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        className="input text-xs pl-8 w-full"
                        placeholder="Search tools, skills, servers..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                </div>

                {/* Loading state */}
                {toolsLoading && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                )}

                {/* Tool server warning */}
                {!toolsLoading && !toolServerAvailable && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-300 mb-3">
                        <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>Tool server offline</span>
                    </div>
                )}

                {/* TOOLS — Core */}
                {!toolsLoading && filteredCoreCategories.length > 0 && (
                    <>
                        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1">
                            Tools
                        </div>
                        {filteredCoreCategories.map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setSelected({ kind: 'category', category: cat })}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                                    isSelected({ kind: 'category', category: cat })
                                        ? 'bg-accent/15 text-accent'
                                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                )}
                            >
                                <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                                    {CATEGORY_ICONS[cat] ?? <Wrench className="w-3.5 h-3.5" />}
                                </span>
                                <span className="text-xs font-medium truncate">{categoryLabel(cat)}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground/50">{categoryCounts[cat]}</span>
                            </button>
                        ))}
                    </>
                )}

                {/* TOOLS — Platform */}
                {!toolsLoading && filteredPlatformCategories.length > 0 && (
                    <>
                        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1 flex items-center gap-1">
                            <Blocks className="w-3 h-3" />
                            Platform
                        </div>
                        {filteredPlatformCategories.map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setSelected({ kind: 'category', category: cat })}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                                    isSelected({ kind: 'category', category: cat })
                                        ? 'bg-accent/15 text-accent'
                                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                )}
                            >
                                <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                                    {CATEGORY_ICONS[cat] ?? <Wrench className="w-3.5 h-3.5" />}
                                </span>
                                <span className="text-xs font-medium truncate">{categoryLabel(cat)}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground/50">{categoryCounts[cat]}</span>
                            </button>
                        ))}
                    </>
                )}

                {/* TOOLS — MCP tool categories */}
                {!toolsLoading && filteredMcpToolCategories.length > 0 && (
                    <>
                        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1 flex items-center gap-1">
                            <Plug className="w-3 h-3" />
                            MCP Tools
                        </div>
                        {filteredMcpToolCategories.map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setSelected({ kind: 'category', category: cat })}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                                    isSelected({ kind: 'category', category: cat })
                                        ? 'bg-accent/15 text-accent'
                                        : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                                )}
                            >
                                <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                                    <Plug className="w-3.5 h-3.5" />
                                </span>
                                <span className="text-xs font-medium truncate">{categoryLabel(cat)}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground/50">{categoryCounts[cat]}</span>
                            </button>
                        ))}
                    </>
                )}

                {/* SKILLS */}
                {showSkills && (
                    <>
                        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1">
                            Skills
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelected({ kind: 'skills' })}
                            className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                                isSelected({ kind: 'skills' })
                                    ? 'bg-accent/15 text-accent'
                                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            )}
                        >
                            <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                                <Package className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-medium">Manage Skills</span>
                        </button>
                    </>
                )}

                {/* MCP SERVERS */}
                {showMcp && (
                    <>
                        <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1">
                            MCP Servers
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelected({ kind: 'mcp' })}
                            className={cn(
                                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                                isSelected({ kind: 'mcp' })
                                    ? 'bg-accent/15 text-accent'
                                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            )}
                        >
                            <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                                <Plug className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-medium">Manage Servers</span>
                        </button>
                    </>
                )}

                {/* Empty state when search yields nothing */}
                {!toolsLoading && !hasAnyToolCategories && !showSkills && !showMcp && (
                    <div className="text-center py-8 text-muted-foreground">
                        <Settings2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No results for "{query}"</p>
                    </div>
                )}
            </div>

            {/* Right panel */}
            <div className="flex-1 min-w-0 overflow-y-auto p-6">
                {!effectiveSelection && !toolsLoading && (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                        Select a category from the sidebar.
                    </div>
                )}

                {effectiveSelection?.kind === 'category' && (
                    <>
                        {selectedCategoryTools.length > 0 ? (
                            <ToolCategoryPanel
                                category={effectiveSelection.category}
                                tools={selectedCategoryTools}
                                permMap={permMap}
                                onPermissionChange={handlePermissionChange}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                                <div className="text-center">
                                    <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p>No tools match your search in this category.</p>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {effectiveSelection?.kind === 'skills' && <SkillsTab />}
                {effectiveSelection?.kind === 'mcp' && <MCPTab />}
            </div>
        </div>
    )
}

export default CapabilitiesPage
