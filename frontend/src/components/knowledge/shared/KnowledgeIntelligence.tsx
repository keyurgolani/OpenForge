import { useState, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    Brain, Sparkles, CheckSquare, FileText, Star, Calendar,
    ChevronRight, Loader2,
} from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { generateKnowledgeIntelligence } from '@/lib/api'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

type SectionKey = 'summary' | 'tasks' | 'facts' | 'crucial_things' | 'timelines'

/** Count total intelligence items extracted from a knowledge object */
export function getIntelligenceCount(knowledge: any): number {
    const summaryText = (knowledge?.ai_summary ?? '').trim()
    const t = Array.isArray(knowledge?.insights?.tasks) ? knowledge.insights.tasks.length : 0
    const f = Array.isArray(knowledge?.insights?.facts) ? knowledge.insights.facts.length : 0
    const c = Array.isArray(knowledge?.insights?.crucial_things) ? knowledge.insights.crucial_things.length : 0
    const tl = Array.isArray(knowledge?.insights?.timelines) ? knowledge.insights.timelines.length : 0
    return (summaryText ? 1 : 0) + t + f + c + tl
}

interface KnowledgeIntelligenceProps {
    knowledge: any
    workspaceId: string
}

const formatItem = (section: SectionKey, item: unknown): string => {
    if (section === 'timelines' && typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const t = item as { date?: unknown; event?: unknown }
        const date = typeof t.date === 'string' ? t.date.trim() : ''
        const event = typeof t.event === 'string' ? t.event.trim() : ''
        if (date && event) return `${date}: ${event}`
        return date || event
    }
    if (typeof item === 'string') return item
    try { return JSON.stringify(item) } catch { return String(item ?? '') }
}

/** Standalone generate/regenerate intelligence button for use in header action bars */
export function GenerateIntelligenceButton({ knowledge, workspaceId }: KnowledgeIntelligenceProps) {
    const qc = useQueryClient()
    const [generating, setGenerating] = useState(false)

    const totalCount = (() => {
        const summaryText = (knowledge?.ai_summary ?? '').trim()
        const t = Array.isArray(knowledge?.insights?.tasks) ? knowledge.insights.tasks.length : 0
        const f = Array.isArray(knowledge?.insights?.facts) ? knowledge.insights.facts.length : 0
        const c = Array.isArray(knowledge?.insights?.crucial_things) ? knowledge.insights.crucial_things.length : 0
        const tl = Array.isArray(knowledge?.insights?.timelines) ? knowledge.insights.timelines.length : 0
        return (summaryText ? 1 : 0) + t + f + c + tl
    })()

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

export default function KnowledgeIntelligence({ knowledge, workspaceId, headerExtra, onCollapse }: KnowledgeIntelligenceProps & { headerExtra?: React.ReactNode; onCollapse?: () => void }) {
    const [expanded, setExpanded] = useState<SectionKey | null>('summary')

    const summaryText = (knowledge?.ai_summary ?? '').trim()
    const tasksItems = Array.isArray(knowledge?.insights?.tasks) ? knowledge.insights.tasks : []
    const factsItems = Array.isArray(knowledge?.insights?.facts) ? knowledge.insights.facts : []
    const crucialItems = Array.isArray(knowledge?.insights?.crucial_things) ? knowledge.insights.crucial_things : []
    const timelineItems = Array.isArray(knowledge?.insights?.timelines) ? knowledge.insights.timelines : []

    const sections = useMemo(() => [
        { key: 'summary' as const, label: 'Summary', icon: Sparkles, items: [] as unknown[], count: summaryText ? 1 : 0, emptyLabel: 'No summary yet.' },
        { key: 'tasks' as const, label: 'Tasks', icon: CheckSquare, items: tasksItems, count: tasksItems.length, emptyLabel: 'No tasks extracted yet.' },
        { key: 'facts' as const, label: 'Facts', icon: FileText, items: factsItems, count: factsItems.length, emptyLabel: 'No facts extracted yet.' },
        { key: 'crucial_things' as const, label: 'Crucial Things', icon: Star, items: crucialItems, count: crucialItems.length, emptyLabel: 'No crucial things extracted yet.' },
        { key: 'timelines' as const, label: 'Timelines', icon: Calendar, items: timelineItems, count: timelineItems.length, emptyLabel: 'No timelines extracted yet.' },
    ], [summaryText, tasksItems, factsItems, crucialItems, timelineItems])

    const totalCount = sections.reduce((sum, s) => sum + s.count, 0)

    const toggle = (key: SectionKey) => setExpanded(prev => prev === key ? null : key)

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
                {sections.map(section => {
                    const SectionIcon = section.icon
                    const isExpanded = expanded === section.key
                    return (
                        <section
                            key={section.key}
                            className={`rounded-xl border px-2.5 py-2 transition-colors ${
                                isExpanded
                                    ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50'
                                    : 'flex-shrink-0 border-border/55 bg-card/22'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => toggle(section.key)}
                                className="w-full flex items-center justify-between gap-3 py-0.5 text-left"
                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${section.label}`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-accent bg-accent/15 border border-accent/20">
                                        <SectionIcon className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-foreground truncate">{section.label}</div>
                                        <div className="text-xs text-muted-foreground/90 leading-5">
                                            {section.count} item{section.count === 1 ? '' : 's'}
                                        </div>
                                    </div>
                                </div>
                                <span className="text-[11px] font-semibold text-foreground/70 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                                    {section.count}
                                </span>
                            </button>

                            {isExpanded && (
                                <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                                    {section.key === 'summary' ? (
                                        summaryText ? (
                                            <div
                                                className="markdown-content knowledge-intelligence-markdown pl-[1.2rem] text-sm text-muted-foreground"
                                                dangerouslySetInnerHTML={{ __html: md.render(summaryText) }}
                                            />
                                        ) : (
                                            <p className="px-2 text-xs text-muted-foreground">{section.emptyLabel}</p>
                                        )
                                    ) : section.items.length > 0 ? (
                                        <ul className="space-y-1.5 pl-[1.2rem]">
                                            {section.items.map((item, i) => (
                                                <li key={i} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-border flex-shrink-0" />
                                                    <span className="text-[13px] leading-5 text-foreground/90">
                                                        {formatItem(section.key, item)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="px-2 text-xs text-muted-foreground">{section.emptyLabel}</p>
                                    )}
                                </div>
                            )}
                        </section>
                    )
                })}
            </div>
        </div>
    )
}
