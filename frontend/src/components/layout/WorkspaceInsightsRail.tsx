import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MarkdownIt from 'markdown-it'
import {
  Brain, Calendar, CheckSquare, ChevronRight, FileText, Star,
  Tag, Link, Hash, ToggleLeft, Sparkles,
} from 'lucide-react'

import Siderail from '@/components/shared/Siderail'
import type { IntelligenceCategory } from '@/components/knowledge/shared/KnowledgeIntelligence'

/* ── Icon mapping (mirrors KnowledgeIntelligence) ─────────────── */
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

/* ── Color palette for section badges / dots ──────────────────── */
const COLOR_PALETTE: Array<{ badgeClass: string; dotClass: string }> = [
  { badgeClass: 'text-accent bg-accent/15 border border-accent/20', dotClass: 'bg-accent/90' },
  { badgeClass: 'text-blue-300 bg-blue-400/10 border border-blue-300/30', dotClass: 'bg-blue-300' },
  { badgeClass: 'text-foreground/90 bg-muted/70 border border-border/70', dotClass: 'bg-foreground/70' },
  { badgeClass: 'text-red-300 bg-red-400/10 border border-red-300/30', dotClass: 'bg-red-300' },
  { badgeClass: 'text-purple-300 bg-purple-400/10 border border-purple-300/30', dotClass: 'bg-purple-300' },
  { badgeClass: 'text-green-300 bg-green-400/10 border border-green-300/30', dotClass: 'bg-green-300' },
  { badgeClass: 'text-orange-300 bg-orange-400/10 border border-orange-300/30', dotClass: 'bg-orange-300' },
]

/* Well-known key → fixed color index for backward compatibility */
const KEY_COLOR_INDEX: Record<string, number> = {
  tasks: 0,
  timelines: 1,
  facts: 2,
  crucial_things: 3,
}

function getColorsForIndex(key: string, idx: number): { badgeClass: string; dotClass: string } {
  if (key in KEY_COLOR_INDEX) return COLOR_PALETTE[KEY_COLOR_INDEX[key]]
  return COLOR_PALETTE[idx % COLOR_PALETTE.length]
}

/* ── Default categories (backward compat — excludes summary) ── */
const DEFAULT_RAIL_CATEGORIES: IntelligenceCategory[] = [
  { key: 'tasks', name: 'Action Items', description: 'Action items and todos', type: 'text', sort_order: 1 },
  { key: 'timelines', name: 'Timeline Updates', description: 'Date and event pairs', type: 'timeline', sort_order: 2 },
  { key: 'facts', name: 'Key Facts', description: 'Key facts', type: 'text', sort_order: 3 },
  { key: 'crucial_things', name: 'Crucial Information', description: 'Crucial information', type: 'text', sort_order: 4 },
]

type InsightItem = { knowledgeId: string; text: string }

const insightsMd = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })
insightsMd.renderer.rules.link_open = () => ''
insightsMd.renderer.rules.link_close = () => ''

/* ── Format helpers per type ──────────────────────────────────── */

function formatTimelineEntry(entry: unknown): string | null {
  if (typeof entry === 'string') return entry
  if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
    const t = entry as { date?: string; event?: string }
    const date = typeof t.date === 'string' ? t.date.trim() : ''
    const event = typeof t.event === 'string' ? t.event.trim() : ''
    if (date && event) return `**${date}**: ${event}`
    if (date) return `**${date}**`
    if (event) return event
    return null
  }
  return String(entry ?? '')
}

function formatGenericEntry(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (typeof entry === 'boolean') return entry ? '\u2713 true' : '\u2717 false'
  try { return JSON.stringify(entry) } catch { return String(entry ?? '') }
}

export interface WorkspaceInsightSource {
  id: string
  insights?: Record<string, any> | null
}

interface WorkspaceInsightsRailProps {
  workspaceId: string
  knowledgeItems: WorkspaceInsightSource[]
  categories?: IntelligenceCategory[] | null
}

export function WorkspaceInsightsRail({ workspaceId, knowledgeItems, categories }: WorkspaceInsightsRailProps) {
  const navigate = useNavigate()

  /* Resolve effective categories: exclude summary types, sort by sort_order */
  const effectiveCategories = useMemo(() => {
    if (!categories || categories.length === 0) return DEFAULT_RAIL_CATEGORIES
    return [...categories]
      .filter(c => c.type !== 'summary')
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [categories])

  const [activeSection, setActiveSection] = useState<string | null>(() => {
    const first = effectiveCategories[0]
    return first ? first.key : null
  })

  /* Aggregate insights across all knowledge items, keyed by category key */
  const aggregatedInsights = useMemo<Record<string, InsightItem[]>>(() => {
    const sections: Record<string, InsightItem[]> = {}
    effectiveCategories.forEach(cat => { sections[cat.key] = [] })

    knowledgeItems.forEach((item) => {
      if (!item.insights) return

      effectiveCategories.forEach(cat => {
        const raw = item.insights?.[cat.key]
        if (!Array.isArray(raw)) return

        raw.forEach((entry: unknown) => {
          let text: string | null = null
          if (cat.type === 'timeline') {
            text = formatTimelineEntry(entry)
          } else {
            text = formatGenericEntry(entry)
          }
          if (text) {
            sections[cat.key].push({ knowledgeId: item.id, text })
          }
        })
      })
    })

    return sections
  }, [knowledgeItems, effectiveCategories])

  const totalCount = useMemo(
    () => effectiveCategories.reduce((count, cat) => count + (aggregatedInsights[cat.key]?.length ?? 0), 0),
    [aggregatedInsights, effectiveCategories],
  )

  return (
    <Siderail
      storageKey="openforge.shell.insights.pct"
      collapsedStorageKey="openforge.shell.insights.collapsed"
      icon={Brain}
      label="Insights"
      itemCount={totalCount}
      breakpoint="xl"
    >
      {(onCollapse) => (
        <div className="flex h-full min-h-0 flex-col px-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold tracking-tight">Workspace Insights</h3>
              </div>
              <p className="text-xs text-muted-foreground/90">
                Summarized intelligence from your workspace knowledge.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-shrink-0 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                {totalCount} item{totalCount === 1 ? '' : 's'}
              </div>
              <button
                type="button"
                onClick={onCollapse}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                aria-label="Collapse workspace insights"
                title="Collapse insights"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 pr-1">
            {effectiveCategories.map((cat, catIndex) => {
              const Icon = getIconForCategory(cat)
              const items = aggregatedInsights[cat.key] ?? []
              const isExpanded = activeSection === cat.key
              const colors = getColorsForIndex(cat.key, catIndex)
              const emptyLabel = `No ${cat.name.toLowerCase()} yet`

              return (
                <section
                  key={cat.key}
                  className={`rounded-xl border px-2.5 py-2 transition-colors ${isExpanded ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50' : 'flex-shrink-0 border-border/55 bg-card/22'}`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSection(prev => (prev === cat.key ? null : cat.key))}
                    className="flex w-full items-center justify-between gap-3 py-0.5 text-left"
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${cat.name}`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <div className={`flex h-6 w-6 items-center justify-center rounded-md ${colors.badgeClass}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{cat.name}</div>
                        <div className="text-xs leading-5 text-muted-foreground/90">
                          {items.length} knowledge excerpt{items.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full border border-border/25 bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-foreground/70">
                      {items.length}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                      {items.length > 0 ? (
                        <ul className="space-y-1.5 pl-[1.2rem]">
                          {items.map((item, index) => (
                            <li key={`${item.knowledgeId}-${index}`}>
                              <button
                                type="button"
                                onClick={() => navigate(`/w/${workspaceId}/knowledge/${item.knowledgeId}`)}
                                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                              >
                                <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${colors.dotClass}`} />
                                <span
                                  className="break-words text-[13px] leading-5 text-foreground/90"
                                  dangerouslySetInnerHTML={{
                                    __html: insightsMd.renderInline(item.text || emptyLabel),
                                  }}
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-2 text-xs text-muted-foreground">{emptyLabel}</p>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </Siderail>
  )
}

export default WorkspaceInsightsRail
