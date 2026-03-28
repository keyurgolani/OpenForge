import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { formatDistanceToNow, format } from 'date-fns'
import {
  BookOpen,
  Bot,
  Workflow,
  Play,
  FileOutput,
  MessageSquare,
  Upload,
  ArrowRight,
  Activity,
  Clock,
  Inbox,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  listKnowledge,
  listAgents,
  listAutomations,
  listRuns,
  listOutputs,
  listConversations,
  getWorkspace,
} from '@/lib/api'
import {
  workspaceRoute,
  agentsRoute,
  automationsRoute,
  outputsRoute,
  chatRoute,
  knowledgeRoute,
  runsRoute,
  agentCreateRoute,
} from '@/lib/routes'
import StatusBadge from '@/components/shared/StatusBadge'
import { useWorkspaceId } from '@/hooks/useWorkspaceId'

/* -------------------------------------------------------------------------- */
/* Greeting helper                                                            */
/* -------------------------------------------------------------------------- */

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/* -------------------------------------------------------------------------- */
/* Stat card definition                                                       */
/* -------------------------------------------------------------------------- */

interface StatDefinition {
  key: string
  label: string
  icon: LucideIcon
}

const STATS: StatDefinition[] = [
  { key: 'knowledge', label: 'Knowledge Items', icon: BookOpen },
  { key: 'agents', label: 'Active Agents', icon: Bot },
  { key: 'automations', label: 'Automations', icon: Workflow },
  { key: 'runs', label: 'Active Runs', icon: Play },
  { key: 'outputs', label: 'Outputs', icon: FileOutput },
  { key: 'conversations', label: 'Conversations', icon: MessageSquare },
]

/* -------------------------------------------------------------------------- */
/* Quick action definition                                                    */
/* -------------------------------------------------------------------------- */

interface QuickAction {
  label: string
  icon: LucideIcon
  to: (workspaceId: string) => string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'New Chat',
    icon: MessageSquare,
    to: (wid) => chatRoute(wid),
  },
  {
    label: 'Create Agent',
    icon: Bot,
    to: () => agentCreateRoute(),
  },
  {
    label: 'Upload Knowledge',
    icon: Upload,
    to: (wid) => knowledgeRoute(wid),
  },
  {
    label: 'New Automation',
    icon: Workflow,
    to: () => automationsRoute(),
  },
]

/* -------------------------------------------------------------------------- */
/* Activity item types                                                        */
/* -------------------------------------------------------------------------- */

interface ActivityItem {
  id: string
  type: 'run' | 'conversation' | 'knowledge'
  title: string
  status: string
  timestamp: string
  icon: LucideIcon
}

/* -------------------------------------------------------------------------- */
/* Skeleton components                                                        */
/* -------------------------------------------------------------------------- */

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-border/40 bg-bg-elevated p-5">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 animate-pulse rounded-full bg-bg-sunken" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-16 animate-pulse rounded-md bg-bg-sunken" />
          <div className="h-4 w-24 animate-pulse rounded bg-bg-sunken" />
        </div>
      </div>
    </div>
  )
}

function ActivityItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-1 py-3">
      <div className="h-8 w-8 animate-pulse rounded-full bg-bg-sunken" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-48 animate-pulse rounded bg-bg-sunken" />
        <div className="h-3 w-24 animate-pulse rounded bg-bg-sunken" />
      </div>
      <div className="h-5 w-16 animate-pulse rounded-full bg-bg-sunken" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const workspaceId = useWorkspaceId()
  const wid = workspaceId ?? ''

  /* -- Data fetching -------------------------------------------------------- */

  const workspaceQuery = useQuery({
    queryKey: ['workspace', wid],
    queryFn: () => getWorkspace(wid),
    enabled: !!wid,
  })

  const knowledgeQuery = useQuery({
    queryKey: ['dashboard-knowledge', wid],
    queryFn: () => listKnowledge(wid, { limit: 1 }),
    enabled: !!wid,
  })

  const agentsQuery = useQuery({
    queryKey: ['dashboard-agents'],
    queryFn: () => listAgents({ limit: 1 }),
  })

  const automationsQuery = useQuery({
    queryKey: ['dashboard-automations'],
    queryFn: () => listAutomations({ limit: 1 }),
  })

  const runsQuery = useQuery({
    queryKey: ['dashboard-runs'],
    queryFn: () => listRuns({ limit: 10 }),
  })

  const outputsQuery = useQuery({
    queryKey: ['dashboard-outputs'],
    queryFn: () => listOutputs({ limit: 1 }),
  })

  const conversationsQuery = useQuery({
    queryKey: ['dashboard-conversations', wid],
    queryFn: () => listConversations(wid),
    enabled: !!wid,
  })

  /* -- Derived stats -------------------------------------------------------- */

  const isStatsLoading =
    knowledgeQuery.isLoading ||
    agentsQuery.isLoading ||
    automationsQuery.isLoading ||
    runsQuery.isLoading ||
    outputsQuery.isLoading ||
    conversationsQuery.isLoading

  const statValues: Record<string, number> = useMemo(
    () => ({
      knowledge: knowledgeQuery.data?.total ?? 0,
      agents: agentsQuery.data?.total ?? 0,
      automations: automationsQuery.data?.total ?? automationsQuery.data?.automations?.length ?? 0,
      runs:
        runsQuery.data?.runs?.filter(
          (r: { status: string }) => r.status === 'running' || r.status === 'pending' || r.status === 'queued',
        )?.length ?? 0,
      outputs: outputsQuery.data?.total ?? 0,
      conversations: conversationsQuery.data?.total ?? conversationsQuery.data?.conversations?.length ?? 0,
    }),
    [
      knowledgeQuery.data,
      agentsQuery.data,
      automationsQuery.data,
      runsQuery.data,
      outputsQuery.data,
      conversationsQuery.data,
    ],
  )

  /* -- Recent activity ------------------------------------------------------ */

  const activityItems: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = []

    // Recent runs
    const runs = runsQuery.data?.runs ?? []
    for (const run of runs.slice(0, 5)) {
      items.push({
        id: `run-${run.id}`,
        type: 'run',
        title: run.run_type
          ? `${run.run_type.charAt(0).toUpperCase() + run.run_type.slice(1)} run`
          : 'Run',
        status: run.status,
        timestamp: run.started_at ?? run.created_at ?? '',
        icon: Play,
      })
    }

    // Recent conversations
    const conversations = conversationsQuery.data?.conversations ?? []
    for (const conv of conversations.slice(0, 3)) {
      items.push({
        id: `conv-${conv.id}`,
        type: 'conversation',
        title: conv.title || 'Untitled conversation',
        status: conv.is_archived ? 'archived' : 'active',
        timestamp: conv.updated_at ?? conv.created_at ?? '',
        icon: MessageSquare,
      })
    }

    // Sort by timestamp descending
    items.sort((a, b) => {
      if (!a.timestamp) return 1
      if (!b.timestamp) return -1
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    })

    return items.slice(0, 8)
  }, [runsQuery.data, conversationsQuery.data])

  const isActivityLoading = runsQuery.isLoading || conversationsQuery.isLoading

  /* -- Workspace info ------------------------------------------------------- */

  const workspaceName = workspaceQuery.data?.name ?? 'your workspace'
  const todayFormatted = format(new Date(), 'EEEE, MMMM d, yyyy')

  /* -- Render --------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Greeting Section ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {getGreeting()}, {workspaceName}
        </h1>
        <p className="mt-1 font-body text-sm text-fg-muted">{todayFormatted}</p>
        <div className="mt-4 h-0.5 w-24 rounded-full bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
      </motion.section>

      {/* ── Stats Grid ── */}
      <section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STATS.map((stat, i) => {
            if (isStatsLoading) {
              return <StatCardSkeleton key={stat.key} />
            }
            return (
              <motion.div
                key={stat.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: i * 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <StatCard
                  icon={stat.icon}
                  value={statValues[stat.key] ?? 0}
                  label={stat.label}
                />
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── Two-column Section ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: Recent Activity (~60%) */}
        <motion.section
          className="lg:col-span-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="rounded-lg border border-border/40 bg-bg-elevated">
            <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="font-display text-base font-semibold text-fg">
                  Recent Activity
                </h2>
              </div>
              <Link
                to={runsRoute()}
                className="flex items-center gap-1 font-label text-xs font-medium text-primary transition-colors hover:text-primary-hover"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="divide-y divide-border/20 px-5">
              {isActivityLoading ? (
                <>
                  <ActivityItemSkeleton />
                  <ActivityItemSkeleton />
                  <ActivityItemSkeleton />
                  <ActivityItemSkeleton />
                </>
              ) : activityItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-sunken">
                    <Inbox className="h-6 w-6 text-fg-subtle" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-display text-sm font-medium text-fg">
                      No recent activity
                    </p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      Start a chat or run an automation to see activity here
                    </p>
                  </div>
                </div>
              ) : (
                activityItems.map((item, idx) => (
                  <div key={item.id} className="animate-slide-up" style={{ animationDelay: `${idx * 40}ms` }}>
                    <ActivityRow item={item} />
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.section>

        {/* Right: Quick Actions (~40%) */}
        <motion.section
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="rounded-lg border border-border/40 bg-bg-elevated">
            <div className="flex items-center gap-2.5 border-b border-border/30 px-5 py-4">
              <Play className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-semibold text-fg">
                Quick Actions
              </h2>
            </div>

            <div className="divide-y divide-border/20 px-2 py-1">
              {QUICK_ACTIONS.map((action) => (
                <QuickActionRow key={action.label} action={action} workspaceId={wid} />
              ))}
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Stat card                                                                  */
/* -------------------------------------------------------------------------- */

interface StatCardProps {
  icon: LucideIcon
  value: number
  label: string
}

function StatCard({ icon: Icon, value, label }: StatCardProps) {
  return (
    <div
      className={cn(
        'group rounded-lg border border-border/40 bg-bg-elevated p-5',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5',
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            'bg-primary/10 text-primary',
            'transition-colors duration-200 group-hover:bg-primary/15',
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold tracking-tight text-fg">
            {value.toLocaleString()}
          </p>
          <p className="mt-0.5 font-label text-xs font-medium text-fg-muted">
            {label}
          </p>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Activity row                                                               */
/* -------------------------------------------------------------------------- */

interface ActivityRowProps {
  item: ActivityItem
}

const activityIconColor: Record<ActivityItem['type'], string> = {
  run: 'bg-primary/10 text-primary',
  conversation: 'bg-secondary/10 text-secondary',
  knowledge: 'bg-success/10 text-success',
}

function ActivityRow({ item }: ActivityRowProps) {
  const Icon = item.icon

  const relativeTime = item.timestamp
    ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })
    : ''

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          activityIconColor[item.type] ?? 'bg-bg-sunken text-fg-subtle',
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{item.title}</p>
        {relativeTime && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
            <Clock className="h-3 w-3" />
            {relativeTime}
          </p>
        )}
      </div>
      <StatusBadge status={item.status} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Quick action row                                                           */
/* -------------------------------------------------------------------------- */

interface QuickActionRowProps {
  action: QuickAction
  workspaceId: string
}

function QuickActionRow({ action, workspaceId }: QuickActionRowProps) {
  const Icon = action.icon

  return (
    <Link
      to={action.to(workspaceId)}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-3',
        'transition-all duration-150',
        'hover:bg-primary/5 hover:text-primary',
        'cursor-pointer',
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          'bg-bg-sunken text-fg-muted',
          'transition-colors duration-150 group-hover:bg-primary/10 group-hover:text-primary',
        )}
      >
        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
      </div>
      <span className="font-label text-sm font-medium text-fg">{action.label}</span>
      <ArrowRight className="ml-auto h-3.5 w-3.5 text-fg-subtle opacity-0 transition-opacity duration-150 [*:hover>&]:opacity-100" />
    </Link>
  )
}
