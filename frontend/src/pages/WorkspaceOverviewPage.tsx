import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookOpenText, Boxes, FileOutput, Rocket, Sparkles, Workflow } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import PageHeader from '@/components/shared/PageHeader'
import LoadingState from '@/components/shared/LoadingState'
import StatusBadge from '@/components/shared/StatusBadge'
import { useArtifactsQuery } from '@/features/artifacts'
import { useKnowledgeSummaryQuery } from '@/features/knowledge'
import { useMissionsQuery } from '@/features/missions'
import { useProfilesQuery } from '@/features/profiles'
import { useRunsQuery } from '@/features/runs'
import { useWorkflowsQuery } from '@/features/workflows'
import { artifactsRoute, chatRoute, knowledgeRoute, missionsRoute, profilesRoute, runsRoute, workflowsRoute } from '@/lib/routes'

function SummaryCard({
  label,
  value,
  description,
  icon,
  to,
}: {
  label: string
  value: number
  description: string
  icon: ReactNode
  to: string
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-border/60 bg-card/30 p-5 transition-colors hover:border-accent/35 hover:bg-card/45"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{label}</p>
          <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
          {icon}
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground/90">{description}</p>
    </Link>
  )
}

export default function WorkspaceOverviewPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()

  const profilesQuery = useProfilesQuery(6)
  const workflowsQuery = useWorkflowsQuery({ workspaceId, limit: 6 })
  const missionsQuery = useMissionsQuery({ workspaceId, limit: 6 })
  const runsQuery = useRunsQuery({ workspaceId, limit: 6 })
  const artifactsQuery = useArtifactsQuery({ workspaceId, limit: 6 })
  const knowledgeQuery = useKnowledgeSummaryQuery(workspaceId, 6)

  const isLoading = [
    profilesQuery.isLoading,
    workflowsQuery.isLoading,
    missionsQuery.isLoading,
    runsQuery.isLoading,
    artifactsQuery.isLoading,
    knowledgeQuery.isLoading,
  ].some(Boolean)

  const firstError = [
    profilesQuery.error,
    workflowsQuery.error,
    missionsQuery.error,
    runsQuery.error,
    artifactsQuery.error,
    knowledgeQuery.error,
  ].find(Boolean)

  if (isLoading) {
    return <LoadingState label="Loading workspace overview…" />
  }

  if (firstError) {
    return <ErrorState message="The workspace overview could not be assembled from the active domain APIs." />
  }

  const knowledgeItems = knowledgeQuery.data?.knowledge ?? []
  const profiles = profilesQuery.data?.profiles ?? []
  const workflows = workflowsQuery.data?.workflows ?? []
  const missions = missionsQuery.data?.missions ?? []
  const runs = runsQuery.data?.runs ?? []
  const artifacts = artifactsQuery.data?.artifacts ?? []

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Workspace"
        description="A quick operational view of the domain surfaces that shape this workspace: knowledge, chat, reusable profiles, orchestration, live runs, and persisted artifacts."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          label="Knowledge"
          value={knowledgeQuery.data?.total ?? 0}
          description="Documents, notes, bookmarks, and captured context available for retrieval."
          icon={<BookOpenText className="h-5 w-5" />}
          to={knowledgeRoute(workspaceId)}
        />
        <SummaryCard
          label="Profiles"
          value={profilesQuery.data?.total ?? 0}
          description="Reusable worker definitions that set model policy, prompts, and capabilities."
          icon={<Sparkles className="h-5 w-5" />}
          to={profilesRoute(workspaceId)}
        />
        <SummaryCard
          label="Workflows"
          value={workflowsQuery.data?.total ?? 0}
          description="Composable execution graphs that Missions and future runtime features can reuse."
          icon={<Workflow className="h-5 w-5" />}
          to={workflowsRoute(workspaceId)}
        />
        <SummaryCard
          label="Missions"
          value={missionsQuery.data?.total ?? 0}
          description="Packaged autonomous experiences that assemble workflows, profiles, and triggers."
          icon={<Rocket className="h-5 w-5" />}
          to={missionsRoute(workspaceId)}
        />
        <SummaryCard
          label="Runs"
          value={runsQuery.data?.total ?? 0}
          description="Durable execution records that surface current status, lineage, and failures."
          icon={<Boxes className="h-5 w-5" />}
          to={runsRoute(workspaceId)}
        />
        <SummaryCard
          label="Artifacts"
          value={artifactsQuery.data?.total ?? 0}
          description="Persistent outputs created by executions and ready to evolve into first-class objects."
          icon={<FileOutput className="h-5 w-5" />}
          to={artifactsRoute(workspaceId)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent knowledge</h2>
              <p className="text-sm text-muted-foreground/90">The latest context available to Chat and future workflows.</p>
            </div>
            <Link className="text-sm text-accent transition-colors hover:text-accent/80" to={knowledgeRoute(workspaceId)}>
              Open knowledge
            </Link>
          </div>
          {knowledgeItems.length === 0 ? (
            <EmptyState
              title="No knowledge captured yet"
              description="This workspace does not have any notes, documents, or imported sources yet."
              actionLabel="Add Knowledge"
              actionHint="Use the Knowledge board or the quick-create control."
            />
          ) : (
            <div className="space-y-3">
              {knowledgeItems.map((item) => (
                <Link
                  key={item.id}
                  to={knowledgeRoute(workspaceId, item.id)}
                  className="block rounded-xl border border-border/50 bg-background/30 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-background/45"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.title || item.ai_title || 'Untitled knowledge'}
                      </p>
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

        <section className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">What to do next</h2>
              <p className="text-sm text-muted-foreground/90">The Phase 1 and 2 surfaces now have clear destinations.</p>
            </div>
            <Link className="text-sm text-accent transition-colors hover:text-accent/80" to={chatRoute(workspaceId)}>
              Open chat
            </Link>
          </div>
          <div className="space-y-3">
            {[
              {
                title: 'Review profiles',
                description: `${profiles.length} profile${profiles.length === 1 ? '' : 's'} available for reuse.`,
                to: profilesRoute(workspaceId),
              },
              {
                title: 'Inspect workflow definitions',
                description: `${workflows.length} workflow${workflows.length === 1 ? '' : 's'} mounted under the canonical domain surface.`,
                to: workflowsRoute(workspaceId),
              },
              {
                title: 'Check active mission packaging',
                description: `${missions.length} mission${missions.length === 1 ? '' : 's'} currently defined.`,
                to: missionsRoute(workspaceId),
              },
              {
                title: 'Monitor run history',
                description: `${runs.length} recent run${runs.length === 1 ? '' : 's'} visible through the final runs API.`,
                to: runsRoute(workspaceId),
              },
              {
                title: 'Browse artifact outputs',
                description: `${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'} persisted for this workspace.`,
                to: artifactsRoute(workspaceId),
              },
            ].map((item) => (
              <Link
                key={item.title}
                to={item.to}
                className="block rounded-xl border border-border/50 bg-background/30 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-background/45"
              >
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground/85">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
