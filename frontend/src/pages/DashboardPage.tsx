import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BookOpenText, Bot, FileOutput, MessageSquare, Zap, Boxes,
  ArrowRight,
} from 'lucide-react'

import ErrorState from '@/components/shared/ErrorState'
import PageHeader from '@/components/shared/PageHeader'
import LoadingState from '@/components/shared/LoadingState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useOutputsQuery } from '@/features/outputs'
import { type KnowledgeSummaryItem, useKnowledgeSummaryQuery } from '@/features/knowledge'
import { useAgentsQuery } from '@/features/agents'
import { useAutomationsQuery } from '@/features/automations'
import { useRunsQuery } from '@/features/runs'
import {
  agentsRoute,
  outputsRoute,
  automationsRoute,
  chatRoute,
  knowledgeRoute,
  runsRoute,
} from '@/lib/routes'

/* ---------- Knowledge type colour map ---------- */

const TYPE_COLORS: Record<string, string> = {
  note: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  fleeting: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25',
  bookmark: 'bg-green-500/10 text-green-400 border-green-500/25',
  gist: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
  image: 'bg-pink-500/10 text-pink-400 border-pink-500/25',
  audio: 'bg-red-500/10 text-red-400 border-red-500/25',
  pdf: 'bg-orange-500/10 text-orange-400 border-orange-500/25',
  document: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
  sheet: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  slides: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
}

/* ---------- Sub-components ---------- */

function PlatformCard({
  label,
  value,
  icon,
  to,
}: {
  label: string
  value: number
  icon: ReactNode
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-background/45"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{label}</p>
      </div>
    </Link>
  )
}

function SuggestionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/30 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-background/45 group"
    >
      <span className="text-sm text-foreground">{children}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  )
}

/* ---------- Main page ---------- */

export default function DashboardPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()

  const agentsQuery = useAgentsQuery({ limit: 6 })
  const automationsQuery = useAutomationsQuery({ limit: 6 })
  const runsQuery = useRunsQuery({ limit: 6 })
  const outputsQuery = useOutputsQuery({ limit: 6 })
  // Fetch a larger page to compute per-type breakdowns client-side
  const knowledgeQuery = useKnowledgeSummaryQuery(workspaceId, 500)
  // Separate recent-only query for the list
  const recentKnowledgeQuery = useKnowledgeSummaryQuery(workspaceId, 6)

  const isLoading = [
    agentsQuery.isLoading,
    automationsQuery.isLoading,
    runsQuery.isLoading,
    outputsQuery.isLoading,
    knowledgeQuery.isLoading,
  ].some(Boolean)

  const firstError = [
    agentsQuery.error,
    automationsQuery.error,
    runsQuery.error,
    outputsQuery.error,
    knowledgeQuery.error,
  ].find(Boolean)

  /* Compute per-type counts from the larger knowledge set */
  const typeCounts = useMemo(() => {
    const items = knowledgeQuery.data?.knowledge ?? []
    return items.reduce<Record<string, number>>((acc, item) => {
      const t = item.type || 'unknown'
      acc[t] = (acc[t] ?? 0) + 1
      return acc
    }, {})
  }, [knowledgeQuery.data])

  if (isLoading) {
    return <LoadingState label="Loading dashboard..." />
  }

  if (firstError) {
    return <ErrorState message="The dashboard could not be assembled from the active domain APIs." />
  }

  const knowledgeTotal = knowledgeQuery.data?.total ?? 0
  const recentItems: KnowledgeSummaryItem[] = recentKnowledgeQuery.data?.knowledge ?? knowledgeQuery.data?.knowledge?.slice(0, 6) ?? []
  const agentsTotal = agentsQuery.data?.total ?? 0
  const automationsTotal = automationsQuery.data?.total ?? 0
  const runsTotal = runsQuery.data?.total ?? 0
  const outputsTotal = outputsQuery.data?.total ?? 0

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Dashboard"
        description="Your workspace at a glance"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- LEFT HALF: Workspace (knowledge-focused) ---- */}
        <div className="space-y-5">
          {/* Knowledge total */}
          <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                <BookOpenText className="h-6 w-6" />
              </div>
              <div>
                <p className="text-3xl font-semibold tracking-tight text-foreground">{knowledgeTotal}</p>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">Knowledge items</p>
              </div>
            </div>

            {/* Per-type breakdown badges */}
            {Object.keys(typeCounts).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(typeCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <span
                      key={type}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${TYPE_COLORS[type] ?? 'bg-muted/30 text-muted-foreground border-border/50'}`}
                    >
                      {type}
                      <span className="font-bold">{count}</span>
                    </span>
                  ))}
              </div>
            )}
          </section>

          {/* Recent knowledge list */}
          <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Recent knowledge</h2>
                <p className="text-sm text-muted-foreground/90">The latest context available to Chat and agents.</p>
              </div>
              <Link className="text-sm text-accent transition-colors hover:text-accent/80" to={knowledgeRoute(workspaceId)}>
                Open knowledge
              </Link>
            </div>

            {recentItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground/75">No knowledge captured yet.</p>
            ) : (
              <div className="space-y-3">
                {recentItems.map((item) => (
                  <Link
                    key={item.id}
                    to={knowledgeRoute(workspaceId, item.id)}
                    className="block rounded-xl border border-border/50 bg-background/30 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-background/45"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.title || item.ai_title || 'Untitled knowledge'}
                          </p>
                          <span
                            className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${TYPE_COLORS[item.type] ?? 'bg-muted/30 text-muted-foreground border-border/50'}`}
                          >
                            {item.type}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/85">
                          {item.content_preview || 'No preview available yet.'}
                        </p>
                      </div>
                      {item.is_archived ? <StatusBadge status="archived" /> : <StatusBadge status="ready" />}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ---- RIGHT HALF: Platform (workspace-agnostic) ---- */}
        <div className="space-y-5">
          {/* 2x3 summary card grid */}
          <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Platform</h2>
            <div className="grid grid-cols-2 gap-3">
              <PlatformCard label="Agents" value={agentsTotal} icon={<Bot className="h-4 w-4" />} to={agentsRoute()} />
              <PlatformCard label="Automations" value={automationsTotal} icon={<Zap className="h-4 w-4" />} to={automationsRoute()} />
              <PlatformCard label="Runs" value={runsTotal} icon={<Boxes className="h-4 w-4" />} to={runsRoute()} />
              <PlatformCard label="Outputs" value={outputsTotal} icon={<FileOutput className="h-4 w-4" />} to={outputsRoute()} />
              <PlatformCard label="Conversations" value={0} icon={<MessageSquare className="h-4 w-4" />} to={chatRoute(workspaceId)} />
            </div>
          </section>

          {/* What to do next */}
          <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">What to do next</h2>
              <p className="text-sm text-muted-foreground/90">Quick actions to get started.</p>
            </div>
            <div className="space-y-2">
              <SuggestionLink to={agentsRoute()}>
                <span className="inline-flex items-center gap-2"><Bot className="h-4 w-4 text-accent" /> Create an agent</span>
              </SuggestionLink>
              <SuggestionLink to={chatRoute(workspaceId)}>
                <span className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4 text-accent" /> Start a conversation</span>
              </SuggestionLink>
              <SuggestionLink to={knowledgeRoute(workspaceId)}>
                <span className="inline-flex items-center gap-2"><BookOpenText className="h-4 w-4 text-accent" /> Add knowledge</span>
              </SuggestionLink>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
