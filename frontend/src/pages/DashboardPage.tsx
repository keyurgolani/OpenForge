import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import MarkdownIt from 'markdown-it'
import {
  BookOpenText, Bot, Download, MessageSquare, Zap, Boxes,
  ArrowRight,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useSinksQuery } from '@/features/sinks'
import { type KnowledgeSummaryItem, useKnowledgeSummaryQuery } from '@/features/knowledge'
import { useAgentsQuery } from '@/features/agents'
import { useAutomationsQuery } from '@/features/automations'
import { useDeploymentsQuery } from '@/features/deployments'
import { listGlobalConversations } from '@/lib/api'
import PreviewDispatcher from '@/components/knowledge/preview/PreviewDispatcher'
import {
  agentsRoute,
  sinksRoute,
  automationsRoute,
  globalChatRoute,
  deploymentsRoute,
  knowledgeRoute,
} from '@/lib/routes'

const md = new MarkdownIt({ html: false, linkify: false, breaks: true })

/* ---------- Knowledge type colour map ---------- */

const TYPE_COLORS: Record<string, string> = {
  note: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  fleeting: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
  bookmark: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30',
  gist: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  image: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30',
  audio: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  pdf: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  document: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  sheet: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  slides: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  video: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  journal: 'bg-amber-400/15 text-amber-700 dark:text-amber-300 border-amber-400/30',
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
      className="flex items-center gap-3 rounded-xl border border-border/20 bg-background/30 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-background/45"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/15 text-accent">
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
      className="flex items-center justify-between gap-3 rounded-xl border border-border/20 bg-background/30 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-background/45 group"
    >
      <span className="text-sm text-foreground">{children}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  )
}

/* ---------- Main page ---------- */

export default function DashboardPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const [activeKnowledgeId, setActiveKnowledgeId] = useState<string | null>(null)

  const agentsQuery = useAgentsQuery({ limit: 6 })
  const automationsQuery = useAutomationsQuery({ limit: 6 })
  const deploymentsQuery = useDeploymentsQuery({ limit: 6 })
  const sinksQuery = useSinksQuery({ limit: 6 })
  // Fetch a larger page to compute per-type breakdowns client-side
  const knowledgeQuery = useKnowledgeSummaryQuery(workspaceId, 500)
  // Separate recent-only query for the list
  const recentKnowledgeQuery = useKnowledgeSummaryQuery(workspaceId, 6)
  // Fetch global conversation count
  const conversationsQuery = useQuery({
    queryKey: ['global-conversations-count'],
    queryFn: () => listGlobalConversations({ limit: 1 }),
  })

  const isLoading = [
    agentsQuery.isLoading,
    automationsQuery.isLoading,
    deploymentsQuery.isLoading,
    sinksQuery.isLoading,
    knowledgeQuery.isLoading,
  ].some(Boolean)

  const firstError = [
    agentsQuery.error,
    automationsQuery.error,
    deploymentsQuery.error,
    sinksQuery.error,
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
  const deploymentsTotal = deploymentsQuery.data?.total ?? 0
  const sinksTotal = sinksQuery.data?.total ?? 0
  const conversationsTotal = conversationsQuery.data?.total ?? (conversationsQuery.data?.conversations?.length ?? 0)

  return (
    <div className="space-y-8 p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- LEFT HALF: Workspace (knowledge-focused) ---- */}
        <div className="space-y-8">
          {/* Knowledge total */}
          <section>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
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
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${TYPE_COLORS[type] ?? 'bg-muted/30 text-muted-foreground border-border/20'}`}
                    >
                      {type}
                      <span className="font-bold">{count}</span>
                    </span>
                  ))}
              </div>
            )}
          </section>

          {/* Recent knowledge list */}
          <section>
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
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveKnowledgeId(item.id)}
                    className="block w-full text-left rounded-xl border border-border/20 bg-background/30 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-background/45"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {item.title || item.ai_title || 'Untitled knowledge'}
                          </p>
                          <span
                            className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${TYPE_COLORS[item.type] ?? 'bg-muted/30 text-muted-foreground border-border/20'}`}
                          >
                            {item.type}
                          </span>
                        </div>
                        <div
                          className="prose prose-sm mt-1 line-clamp-3 max-w-none text-xs text-muted-foreground/85 [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0 [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:m-0 [&_h2]:m-0 [&_h3]:m-0 [&_code]:text-[10px] [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:rounded [&_pre]:hidden [&_table]:hidden [&_img]:hidden [&_blockquote]:border-l-2 [&_blockquote]:border-accent/30 [&_blockquote]:pl-2 [&_blockquote]:m-0 [&_a]:text-accent [&_a]:no-underline"
                          dangerouslySetInnerHTML={{ __html: md.render(item.content_preview || '*No preview available yet.*') }}
                        />
                      </div>
                      {item.is_archived && <StatusBadge status="archived" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ---- RIGHT HALF: Platform (workspace-agnostic) ---- */}
        <div className="space-y-8">
          {/* 2x3 summary card grid */}
          <section>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Platform</h2>
            <div className="grid grid-cols-2 gap-3">
              <PlatformCard label="Agents" value={agentsTotal} icon={<Bot className="h-4 w-4" />} to={agentsRoute()} />
              <PlatformCard label="Automations" value={automationsTotal} icon={<Zap className="h-4 w-4" />} to={automationsRoute()} />
              <PlatformCard label="Deployments" value={deploymentsTotal} icon={<Boxes className="h-4 w-4" />} to={deploymentsRoute()} />
              <PlatformCard label="Sinks" value={sinksTotal} icon={<Download className="h-4 w-4" />} to={sinksRoute()} />
              <PlatformCard label="Conversations" value={conversationsTotal} icon={<MessageSquare className="h-4 w-4" />} to={globalChatRoute()} />
            </div>
          </section>

          {/* What to do next */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">What to do next</h2>
              <p className="text-sm text-muted-foreground/90">Quick actions to get started.</p>
            </div>
            <div className="space-y-2">
              <SuggestionLink to={agentsRoute()}>
                <span className="inline-flex items-center gap-2"><Bot className="h-4 w-4 text-accent" /> Create an agent</span>
              </SuggestionLink>
              <SuggestionLink to={globalChatRoute()}>
                <span className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4 text-accent" /> Start a conversation</span>
              </SuggestionLink>
              <SuggestionLink to={knowledgeRoute(workspaceId)}>
                <span className="inline-flex items-center gap-2"><BookOpenText className="h-4 w-4 text-accent" /> Add knowledge</span>
              </SuggestionLink>
            </div>
          </section>
        </div>
      </div>

      {/* Knowledge preview modal — opens when a recent-knowledge card is clicked.
          Mirrors the WorkspaceHome pattern so all 12 knowledge types render correctly,
          unlike the editor route which currently only handles note/gist. */}
      <PreviewDispatcher
        knowledgeId={activeKnowledgeId}
        workspaceId={workspaceId}
        isOpen={!!activeKnowledgeId}
        onClose={() => setActiveKnowledgeId(null)}
      />
    </div>
  )
}
