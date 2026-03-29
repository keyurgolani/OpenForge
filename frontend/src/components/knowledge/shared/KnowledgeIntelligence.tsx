import { useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    Brain, Sparkles, CheckSquare, FileText, Star, Calendar,
    ChevronRight, Loader2, Tag, Link, Hash, ToggleLeft,
} from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { generateKnowledgeIntelligence } from '@/lib/api'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

/** Shape of a workspace intelligence category from the API */
export interface IntelligenceCategory {
    key: string
    name: string
    description: string
    type: 'text' | 'timeline' | 'tag' | 'url' | 'number' | 'boolean' | 'summary'
    sort_order: number
}

/* ── Icon mapping ─────────────────────────────────────────────── */
const TYPE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    text: FileText,
    timeline: Calendar,
    tag: Tag,
    url: Link,
    number: Hash,
    boolean: ToggleLeft,
    summary: Sparkles,
}

const KEY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    tasks: CheckSquare,
    facts: FileText,
    crucial_things: Star,
    timelines: Calendar,
    summary: Sparkles,
}

function getIconForCategory(cat: IntelligenceCategory): React.ComponentType<{ className?: string }> {
    return KEY_ICON_MAP[cat.key] ?? TYPE_ICON_MAP[cat.type] ?? FileText
}

/* ── Default categories for backward compatibility ────────────── */
const DEFAULT_CATEGORIES: IntelligenceCategory[] = [
    { key: 'summary', name: 'Summary', description: 'AI-generated summary', type: 'summary', sort_order: 0 },
    { key: 'tasks', name: 'Tasks', description: 'Action items and todos', type: 'text', sort_order: 1 },
    { key: 'facts', name: 'Facts', description: 'Key facts', type: 'text', sort_order: 2 },
    { key: 'crucial_things', name: 'Crucial Things', description: 'Crucial information', type: 'text', sort_order: 3 },
    { key: 'timelines', name: 'Timelines', description: 'Date and event pairs', type: 'timeline', sort_order: 4 },
]

/* ── Helpers ──────────────────────────────────────────────────── */

function getItemsForCategory(knowledge: any, cat: IntelligenceCategory): unknown[] {
    if (cat.type === 'summary') return []
    const raw = knowledge?.insights?.[cat.key]
    return Array.isArray(raw) ? raw : []
}

function getCountForCategory(knowledge: any, cat: IntelligenceCategory): number {
    if (cat.type === 'summary') {
        const text = (knowledge?.ai_summary ?? knowledge?.insights?.[cat.key] ?? '').toString().trim()
        return text ? 1 : 0
    }
    return getItemsForCategory(knowledge, cat).length
}

/** Count total intelligence items extracted from a knowledge object */
export function getIntelligenceCount(knowledge: any, categories?: IntelligenceCategory[] | null): number {
    const cats = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES
    return cats.reduce((sum, cat) => sum + getCountForCategory(knowledge, cat), 0)
}

function getSummaryText(knowledge: any, key: string): string {
    return (knowledge?.ai_summary ?? knowledge?.insights?.[key] ?? '').toString().trim()
}

const formatTimelineItem = (item: unknown): string => {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const t = item as { date?: unknown; event?: unknown }
        const date = typeof t.date === 'string' ? t.date.trim() : ''
        const event = typeof t.event === 'string' ? t.event.trim() : ''
        if (date && event) return `${date}: ${event}`
        return date || event
    }
    if (typeof item === 'string') return item
    try { return JSON.stringify(item) } catch { return String(item ?? '') }
}

const formatGenericItem = (item: unknown): string => {
    if (typeof item === 'string') return item
    try { return JSON.stringify(item) } catch { return String(item ?? '') }
}

/* ── Render helpers per type ──────────────────────────────────── */

function renderSummaryContent(knowledge: any, key: string, emptyLabel: string) {
    const text = getSummaryText(knowledge, key)
    return text ? (
        <div
            className="markdown-content knowledge-intelligence-markdown pl-[1.2rem] text-sm text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: md.render(text) }}
        />
    ) : (
        <p className="px-2 text-xs text-muted-foreground">{emptyLabel}</p>
    )
}

function renderTimelineItems(items: unknown[], emptyLabel: string) {
    if (items.length === 0) return <p className="px-2 text-xs text-muted-foreground">{emptyLabel}</p>
    return (
        <ul className="space-y-1.5 pl-[1.2rem]">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-border flex-shrink-0" />
                    <span className="text-[13px] leading-5 text-foreground/90">{formatTimelineItem(item)}</span>
                </li>
            ))}
        </ul>
    )
}

function renderTextItems(items: unknown[], emptyLabel: string) {
    if (items.length === 0) return <p className="px-2 text-xs text-muted-foreground">{emptyLabel}</p>
    return (
        <ul className="space-y-1.5 pl-[1.2rem]">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-border flex-shrink-0" />
                    <span className="text-[13px] leading-5 text-foreground/90">{formatGenericItem(item)}</span>
                </li>
            ))}
        </ul>
    )
}

function renderTagItems(items: unknown[], emptyLabel: string) {
    if (items.length === 0) return <p className="px-2 text-xs text-muted-foreground">{emptyLabel}</p>
    return (
        <div className="flex flex-wrap gap-1.5 pl-[1.2rem] px-2 py-1">
            {items.map((item, i) => (
                <span
                    key={i}
                    className="inline-flex items-center rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground/80"
                >
                    {formatGenericItem(item)}
                </span>
            ))}
        </div>
    )
}

function renderUrlItems(items: unknown[], emptyLabel: string) {
    if (items.length === 0) return <p className="px-2 text-xs text-muted-foreground">{emptyLabel}</p>
    return (
        <ul className="space-y-1.5 pl-[1.2rem]">
            {items.map((item, i) => {
                const url = formatGenericItem(item)
                return (
                    <li key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-border flex-shrink-0" />
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] leading-5 text-accent hover:underline break-all"
                        >
                            {url}
                        </a>
                    </li>
                )
            })}
        </ul>
    )
}

function renderNumberItems(items: unknown[], emptyLabel: string) {
    if (items.length === 0) return <p className="px-2 text-xs text-muted-foreground">{emptyLabel}</p>
    return (
        <ul className="space-y-1.5 pl-[1.2rem]">
            {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-border flex-shrink-0" />
                    <span className="text-[13px] leading-5 text-foreground/90 tabular-nums">{formatGenericItem(item)}</span>
                </li>
            ))}
        </ul>
    )
}

function renderBooleanItems(items: unknown[], emptyLabel: string) {
    if (items.length === 0) return <p className="px-2 text-xs text-muted-foreground">{emptyLabel}</p>
    return (
        <ul className="space-y-1.5 pl-[1.2rem]">
            {items.map((item, i) => {
                const val = typeof item === 'boolean' ? item : typeof item === 'string' ? item.toLowerCase() === 'true' : Boolean(item)
                return (
                    <li key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                        <span className={`mt-0.5 text-sm ${val ? 'text-green-400' : 'text-red-400'}`}>
                            {val ? '\u2713' : '\u2717'}
                        </span>
                        <span className="text-[13px] leading-5 text-foreground/90">{formatGenericItem(item)}</span>
                    </li>
                )
            })}
        </ul>
    )
}

function renderSectionContent(knowledge: any, cat: IntelligenceCategory, items: unknown[]) {
    const emptyLabel = `No ${cat.name.toLowerCase()} extracted yet.`
    switch (cat.type) {
        case 'summary': return renderSummaryContent(knowledge, cat.key, emptyLabel)
        case 'timeline': return renderTimelineItems(items, emptyLabel)
        case 'tag': return renderTagItems(items, emptyLabel)
        case 'url': return renderUrlItems(items, emptyLabel)
        case 'number': return renderNumberItems(items, emptyLabel)
        case 'boolean': return renderBooleanItems(items, emptyLabel)
        case 'text':
        default: return renderTextItems(items, emptyLabel)
    }
}

/* ── Components ───────────────────────────────────────────────── */

interface KnowledgeIntelligenceProps {
    knowledge: any
    workspaceId: string
    categories?: IntelligenceCategory[] | null
}

/** Standalone generate/regenerate intelligence button for use in header action bars */
export function GenerateIntelligenceButton({ knowledge, workspaceId, categories }: KnowledgeIntelligenceProps) {
    const qc = useQueryClient()
    const [generating, setGenerating] = useState(false)

    const totalCount = getIntelligenceCount(knowledge, categories)

    const handleGenerate = useCallback(async () => {
        setGenerating(true)
        try {
            await generateKnowledgeIntelligence(workspaceId, knowledge.id)
            qc.invalidateQueries({ queryKey: ['knowledge-detail', workspaceId, knowledge.id] })
            qc.invalidateQueries({ queryKey: ['knowledge-item', knowledge.id] })
            qc.invalidateQueries({ queryKey: ['knowledge'] })
        } finally {
            setGenerating(false)
        }
    }, [workspaceId, knowledge.id, qc])

    return (
        <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            aria-label={totalCount > 0 ? 'Regenerate intelligence' : 'Generate intelligence'}
            title={totalCount > 0 ? 'Regenerate intelligence' : 'Generate intelligence'}
        >
            {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <Sparkles className="w-4 h-4" />
            )}
        </button>
    )
}

export default function KnowledgeIntelligence({ knowledge, workspaceId, categories, headerExtra, onCollapse }: KnowledgeIntelligenceProps & { headerExtra?: React.ReactNode; onCollapse?: () => void }) {
    const cats = useMemo(
        () => (categories && categories.length > 0 ? [...categories].sort((a, b) => a.sort_order - b.sort_order) : DEFAULT_CATEGORIES),
        [categories],
    )

    const [expanded, setExpanded] = useState<string | null>(() => {
        const first = cats[0]
        return first ? first.key : null
    })

    const sections = useMemo(() =>
        cats.map(cat => ({
            cat,
            icon: getIconForCategory(cat),
            items: getItemsForCategory(knowledge, cat),
            count: getCountForCategory(knowledge, cat),
        })),
        [cats, knowledge],
    )

    const totalCount = sections.reduce((sum, s) => sum + s.count, 0)

    const toggle = (key: string) => setExpanded(prev => prev === key ? null : key)

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-4 pb-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Brain className="w-4 h-4 text-accent flex-shrink-0" />
                        <h3 className="font-semibold text-sm tracking-tight truncate">Intelligence</h3>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {headerExtra}
                        <span className="rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80 tabular-nums">
                            {totalCount}
                        </span>
                        {onCollapse && (
                            <button
                                type="button"
                                onClick={onCollapse}
                                className="w-5 h-8 rounded-full border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                                aria-label="Collapse intelligence sidebar"
                                title="Collapse intelligence"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-xs text-muted-foreground/90 pl-6">Summary and extracted insights.</p>
            </div>

            {/* Sections */}
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-2">
                {sections.map(({ cat, icon: SectionIcon, items, count }) => {
                    const isExpanded = expanded === cat.key
                    return (
                        <section
                            key={cat.key}
                            className={`rounded-xl border px-2.5 py-2 transition-colors ${
                                isExpanded
                                    ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50'
                                    : 'flex-shrink-0 border-border/55 bg-card/22'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => toggle(cat.key)}
                                className="w-full flex items-center justify-between gap-3 py-0.5 text-left"
                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${cat.name}`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-accent bg-accent/15 border border-accent/20">
                                        <SectionIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-foreground truncate">{cat.name}</div>
                                        <div className="text-xs text-muted-foreground/90 leading-5">
                                            {count} item{count === 1 ? '' : 's'}
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[11px] font-semibold text-foreground/70 rounded-full border border-border/25 bg-muted/60 px-2 py-0.5">
                                    {count}
                                </span>
                            </button>

                            {isExpanded && (
                                <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                                    {renderSectionContent(knowledge, cat, items)}
                                </div>
                            )}
                        </section>
                    )
                })}
            </div>
        </div>
    )
}
