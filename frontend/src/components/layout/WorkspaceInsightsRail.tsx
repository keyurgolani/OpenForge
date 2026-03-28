import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MarkdownIt from 'markdown-it'
import { Brain, Calendar, CheckSquare, ChevronRight, FileText, Star } from 'lucide-react'

import Siderail from '@/components/shared/Siderail'

type InsightSectionKey = 'tasks' | 'timelines' | 'facts' | 'crucial_things'
type InsightItem = { knowledgeId: string; text: string }
type InsightSections = Record<InsightSectionKey, InsightItem[]>

const INSIGHT_SECTION_ORDER: InsightSectionKey[] = ['tasks', 'timelines', 'facts', 'crucial_things']
const INSIGHT_SECTION_META: Record<InsightSectionKey, {
  title: string
  icon: React.ComponentType<{ className?: string }>
  emptyLabel: string
  badgeClass: string
  dotClass: string
}> = {
  tasks: {
    title: 'Action Items',
    icon: CheckSquare,
    emptyLabel: 'No pending action items',
    badgeClass: 'text-accent bg-accent/15 border border-accent/20',
    dotClass: 'bg-accent/90',
  },
  timelines: {
    title: 'Timeline Updates',
    icon: Calendar,
    emptyLabel: 'No timeline updates',
    badgeClass: 'text-blue-300 bg-blue-400/10 border border-blue-300/30',
    dotClass: 'bg-blue-300',
  },
  facts: {
    title: 'Key Facts',
    icon: FileText,
    emptyLabel: 'No key facts found',
    badgeClass: 'text-foreground/90 bg-muted/70 border border-border/70',
    dotClass: 'bg-foreground/70',
  },
  crucial_things: {
    title: 'Crucial Information',
    icon: Star,
    emptyLabel: 'No crucial information yet',
    badgeClass: 'text-red-300 bg-red-400/10 border border-red-300/30',
    dotClass: 'bg-red-300',
  },
}

const insightsMd = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })
insightsMd.renderer.rules.link_open = () => ''
insightsMd.renderer.rules.link_close = () => ''

export interface WorkspaceInsightSource {
  id: string
  insights?: {
    tasks?: string[]
    timelines?: Array<string | { date?: string; event?: string }>
    facts?: string[]
    crucial_things?: string[]
  } | null
}

interface WorkspaceInsightsRailProps {
  workspaceId: string
  knowledgeItems: WorkspaceInsightSource[]
}

export function WorkspaceInsightsRail({ workspaceId, knowledgeItems }: WorkspaceInsightsRailProps) {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<InsightSectionKey | null>('tasks')

  const aggregatedInsights = useMemo<InsightSections>(() => {
    const sections: InsightSections = {
      tasks: [],
      timelines: [],
      facts: [],
      crucial_things: [],
    }

    knowledgeItems.forEach((item) => {
      if (!item.insights) return

      item.insights.tasks?.forEach((entry) => {
        sections.tasks.push({ knowledgeId: item.id, text: entry })
      })
      item.insights.timelines?.forEach((entry) => {
        if (typeof entry === 'string') {
          sections.timelines.push({ knowledgeId: item.id, text: entry })
          return
        }
        const date = typeof entry?.date === 'string' ? entry.date.trim() : ''
        const event = typeof entry?.event === 'string' ? entry.event.trim() : ''
        if (date && event) {
          sections.timelines.push({ knowledgeId: item.id, text: `**${date}**: ${event}` })
        } else if (date) {
          sections.timelines.push({ knowledgeId: item.id, text: `**${date}**` })
        } else if (event) {
          sections.timelines.push({ knowledgeId: item.id, text: event })
        }
      })
      item.insights.facts?.forEach((entry) => {
        sections.facts.push({ knowledgeId: item.id, text: entry })
      })
      item.insights.crucial_things?.forEach((entry) => {
        sections.crucial_things.push({ knowledgeId: item.id, text: entry })
      })
    })

    return sections
  }, [knowledgeItems])

  const totalCount = useMemo(
    () => INSIGHT_SECTION_ORDER.reduce((count, section) => count + aggregatedInsights[section].length, 0),
    [aggregatedInsights],
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
            {INSIGHT_SECTION_ORDER.map((section) => {
              const meta = INSIGHT_SECTION_META[section]
              const Icon = meta.icon
              const items = aggregatedInsights[section]
              const isExpanded = activeSection === section

              return (
                <section
                  key={section}
                  className={`rounded-xl border px-2.5 py-2 transition-colors ${isExpanded ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50' : 'flex-shrink-0 border-border/55 bg-card/22'}`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveSection(prev => (prev === section ? null : section))}
                    className="flex w-full items-center justify-between gap-3 py-0.5 text-left"
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${meta.title}`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <div className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.badgeClass}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{meta.title}</div>
                        <div className="text-xs leading-5 text-muted-foreground/90">
                          {items.length} knowledge excerpt{items.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-foreground/70">
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
                                <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${meta.dotClass}`} />
                                <span
                                  className="break-words text-[13px] leading-5 text-foreground/90"
                                  dangerouslySetInnerHTML={{
                                    __html: insightsMd.renderInline(item.text || meta.emptyLabel),
                                  }}
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-2 text-xs text-muted-foreground">{meta.emptyLabel}</p>
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
