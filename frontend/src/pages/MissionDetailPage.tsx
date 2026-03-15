import { Activity, ArrowLeft, Clock, Heart, Pause, Play, Power, PowerOff, Rocket, Zap } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import Section from '@/components/shared/Section'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  useActivateMission,
  useDisableMission,
  useLaunchMission,
  useMissionArtifactsQuery,
  useMissionHealthQuery,
  useMissionQuery,
  useMissionRunsQuery,
  usePauseMission,
  useResumeMission,
} from '@/features/missions'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'
import { missionsRoute } from '@/lib/routes'

export default function MissionDetailPage() {
  const { workspaceId = '', missionId = '' } = useParams<{ workspaceId: string; missionId: string }>()
  const { data: mission, isLoading, error } = useMissionQuery(missionId)
  const { data: health } = useMissionHealthQuery(missionId)
  const { data: runsData } = useMissionRunsQuery(missionId, 10)
  const { data: artifactsData } = useMissionArtifactsQuery(missionId, 10)
  const launchMutation = useLaunchMission()
  const pauseMutation = usePauseMission()
  const resumeMutation = useResumeMission()
  const disableMutation = useDisableMission()
  const activateMutation = useActivateMission()

  if (isLoading) {
    return <LoadingState label="Loading mission detail..." />
  }

  if (error || !mission) {
    return <ErrorState message="Mission detail could not be loaded from the canonical missions API." />
  }

  const runs = runsData?.runs ?? []
  const artifacts = artifactsData?.artifacts ?? []
  const anyPending = launchMutation.isPending || pauseMutation.isPending || resumeMutation.isPending || disableMutation.isPending || activateMutation.isPending

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={mission.name}
        description="Inspect mission configuration, health, triggers, recent runs, and lifecycle controls."
        actions={(
          <Link
            to={missionsRoute(workspaceId)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Missions
          </Link>
        )}
      />

      {/* Header stats */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Status', value: <StatusBadge status={mission.status} />, icon: <Activity className="h-4 w-4" /> },
          { label: 'Health', value: <StatusBadge status={mission.health_status ?? 'unknown'} />, icon: <Heart className="h-4 w-4" /> },
          { label: 'Autonomy mode', value: <span className="text-foreground capitalize">{mission.autonomy_mode}</span>, icon: <Rocket className="h-4 w-4" /> },
          { label: 'Last run', value: <span className="text-foreground">{mission.last_run_at ? formatRelativeTime(mission.last_run_at) : 'Never'}</span>, icon: <Clock className="h-4 w-4" /> },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-card/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{item.label}</p>
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                {item.icon}
              </div>
            </div>
            <div className="mt-3 text-sm font-medium">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Lifecycle actions */}
      <Section title="Lifecycle actions" description="Control the mission lifecycle: launch, pause, resume, disable, or activate.">
        <div className="flex flex-wrap gap-3">
          {(mission.status === 'draft' || mission.status === 'disabled' || mission.status === 'failed') ? (
            <button
              type="button"
              onClick={() => launchMutation.mutate({ id: mission.id })}
              disabled={anyPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Launch
            </button>
          ) : null}
          {mission.status === 'active' ? (
            <button
              type="button"
              onClick={() => pauseMutation.mutate(mission.id)}
              disabled={anyPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 text-sm font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          ) : null}
          {mission.status === 'paused' ? (
            <button
              type="button"
              onClick={() => resumeMutation.mutate(mission.id)}
              disabled={anyPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
          ) : null}
          {mission.status === 'active' || mission.status === 'paused' ? (
            <button
              type="button"
              onClick={() => disableMutation.mutate(mission.id)}
              disabled={anyPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              <PowerOff className="h-4 w-4" />
              Disable
            </button>
          ) : null}
          {mission.status === 'disabled' ? (
            <button
              type="button"
              onClick={() => activateMutation.mutate(mission.id)}
              disabled={anyPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
            >
              <Power className="h-4 w-4" />
              Activate
            </button>
          ) : null}
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        {/* Left column: Definition + Health */}
        <div className="space-y-6">
          <Section title="Definition" description="The mission identity and configuration.">
            <Card glass padding="lg">
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Slug</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{mission.slug}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Autonomy mode</p>
                  <p className="mt-1 text-sm font-medium text-foreground capitalize">{mission.autonomy_mode}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Workflow</p>
                  <p className="mt-1 text-sm font-medium text-foreground font-mono">{mission.workflow_id}</p>
                </div>
                {mission.workflow_version_id ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Workflow version</p>
                    <p className="mt-1 text-sm font-medium text-foreground font-mono">{mission.workflow_version_id}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Mode flags</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {mission.is_system ? <span className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-foreground">System</span> : null}
                    {mission.is_template ? <span className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-foreground">Template</span> : null}
                    {!mission.is_system && !mission.is_template ? <span className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground/80">Custom workspace mission</span> : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Created</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{mission.created_at ? formatDateTime(mission.created_at) : 'Unknown'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Description</p>
                  <p className="mt-1 text-sm text-muted-foreground/90">
                    {mission.description || 'No mission description has been written yet.'}
                  </p>
                </div>
                {mission.recommended_use_case ? (
                  <div className="md:col-span-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Recommended use case</p>
                    <p className="mt-1 text-sm text-muted-foreground/90">{mission.recommended_use_case}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </Section>

          <Section title="Health summary" description="Real-time health and success rate for this mission.">
            {health ? (
              <Card glass padding="lg">
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Health status</p>
                    <div className="mt-1"><StatusBadge status={health.health_status ?? 'unknown'} /></div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Success rate</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{health.success_rate != null ? `${(health.success_rate * 100).toFixed(1)}%` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Total runs</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{health.recent_run_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Failed runs</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{health.recent_failure_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Last success</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{health.last_success_at ? formatRelativeTime(health.last_success_at) : 'Never'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Last failure</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{health.last_failure_at ? formatRelativeTime(health.last_failure_at) : 'Never'}</p>
                  </div>
                  {health.last_error_summary ? (
                    <div className="md:col-span-2">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Last error</p>
                      <p className="mt-1 text-sm text-red-400">{health.last_error_summary}</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
                Health data is not available yet.
              </div>
            )}
          </Section>

          <Section title="Budget and policies" description="Approval and budget policy references for this mission.">
            <Card glass padding="lg">
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Approval policy</p>
                  <p className="mt-1 text-sm font-medium text-foreground font-mono">{mission.approval_policy_id || 'None'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Budget policy</p>
                  <p className="mt-1 text-sm font-medium text-foreground font-mono">{mission.budget_policy_id || 'None'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Profiles</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{mission.default_profile_ids?.length ?? 0} assigned</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">Output types</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {mission.output_artifact_types?.length
                      ? mission.output_artifact_types.join(', ')
                      : 'None configured'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Section>
        </div>

        {/* Right column: Triggers + Runs + Artifacts */}
        <div className="space-y-6">
          <Section title="Triggers" description="Triggers linked to this mission for automated execution.">
            {(mission.default_trigger_ids?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
                No triggers are linked to this mission.
              </div>
            ) : (
              <div className="space-y-2">
                {mission.default_trigger_ids.map((triggerId) => (
                  <div key={triggerId} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-accent" />
                      <span className="font-mono text-foreground">{triggerId}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Recent runs" description="The last 10 execution runs for this mission.">
            {runs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
                No runs recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {runs.map((run: any) => (
                  <div key={run.id} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground font-mono text-xs">{run.id}</p>
                        <p className="mt-1 text-xs text-muted-foreground/80">
                          {run.created_at ? formatRelativeTime(run.created_at) : 'Unknown time'}
                        </p>
                      </div>
                      <StatusBadge status={run.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Recent artifacts" description="The last 10 artifacts produced by this mission.">
            {artifacts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
                No artifacts produced yet.
              </div>
            ) : (
              <div className="space-y-2">
                {artifacts.map((artifact: any) => (
                  <div key={artifact.id} className="rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{artifact.title ?? artifact.name ?? artifact.id}</p>
                        <p className="mt-1 text-xs text-muted-foreground/80">
                          {artifact.artifact_type ?? 'unknown'} -- {artifact.created_at ? formatRelativeTime(artifact.created_at) : ''}
                        </p>
                      </div>
                      {artifact.status ? <StatusBadge status={artifact.status} /> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
