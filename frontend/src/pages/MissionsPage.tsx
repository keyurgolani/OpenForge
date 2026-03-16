import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Activity, ArrowRight, Filter, Heart, Layers3, Pause, Play, Rocket, Shield, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import MutationButton from '@/components/shared/MutationButton'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useLaunchMission, useMissionsQuery, usePauseMission, useResumeMission } from '@/features/missions'
import { createMission } from '@/lib/api'
import { formatRelativeTime } from '@/lib/formatters'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'
import { missionsRoute } from '@/lib/routes'
import type { MissionStatus } from '@/types/missions'

type SystemFilter = 'all' | 'system' | 'workspace'
type TemplateFilter = 'all' | 'template' | 'custom'

type MissionComposerState = {
  name: string
  description: string
  autonomy_mode: 'manual' | 'supervised' | 'autonomous'
}

const EMPTY_COMPOSER: MissionComposerState = {
  name: '',
  description: '',
  autonomy_mode: 'manual',
}

export default function MissionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<'all' | MissionStatus>('all')
  const [modeFilter, setModeFilter] = useState<string>('all')
  const [systemFilter, setSystemFilter] = useState<SystemFilter>('all')
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all')
  const [composer, setComposer] = useState<MissionComposerState>(EMPTY_COMPOSER)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const { data, isLoading, error } = useMissionsQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
  })
  const launchMutation = useLaunchMission()
  const pauseMutation = usePauseMission()
  const resumeMutation = useResumeMission()

  const createMut = useMutation({
    mutationFn: async () => createMission({
      name: composer.name,
      description: composer.description || null,
      autonomy_mode: composer.autonomy_mode,
      status: 'draft',
    }),
    onSuccess: async (createdMission) => {
      setComposer(EMPTY_COMPOSER)
      setIsComposerOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['missions'] })
      navigate(missionsRoute(createdMission.id))
    },
  })

  if (isLoading) {
    return <LoadingState label="Loading missions..." />
  }

  if (error) {
    return <ErrorState message="Missions could not be loaded from the canonical domain API." />
  }

  const allMissions = data?.missions ?? []

  // Apply client-side filters for mode, system, and template
  const missions = allMissions.filter((mission) => {
    if (modeFilter !== 'all' && mission.autonomy_mode !== modeFilter) return false
    if (systemFilter === 'system' && !mission.is_system) return false
    if (systemFilter === 'workspace' && mission.is_system) return false
    if (templateFilter === 'template' && !mission.is_template) return false
    if (templateFilter === 'custom' && mission.is_template) return false
    return true
  })

  const emptyCopy = EMPTY_STATE_COPY.mission
  const activeCount = missions.filter((m) => m.status === 'active').length
  const systemCount = missions.filter((m) => m.is_system).length
  const templateCount = missions.filter((m) => m.is_template).length
  const healthyCount = missions.filter((m) => m.health_status === 'healthy').length

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={getLabel('mission', true)}
        description={getDescription('mission')}
        actions={(
          <MutationButton
            isPending={false}
            variant="secondary"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => setIsComposerOpen((current) => !current)}
          >
            {isComposerOpen ? 'Close Builder' : 'New Mission'}
          </MutationButton>
        )}
      />

      {isComposerOpen ? (
        <section className="rounded-3xl border border-border/60 bg-card/35 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Mission Builder</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a new mission definition. You can configure workflows, triggers, and policies on the detail page.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Name</span>
              <input
                className="input w-full"
                value={composer.name}
                onChange={(event) => setComposer((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Autonomy Mode</span>
              <select
                className="input w-full"
                value={composer.autonomy_mode}
                onChange={(event) => setComposer((current) => ({ ...current, autonomy_mode: event.target.value as MissionComposerState['autonomy_mode'] }))}
              >
                <option value="manual">Manual</option>
                <option value="supervised">Supervised</option>
                <option value="autonomous">Autonomous</option>
              </select>
            </label>
            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-muted-foreground">Description</span>
              <textarea
                className="input min-h-28 w-full py-3"
                value={composer.description}
                onChange={(event) => setComposer((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <MutationButton
              isPending={createMut.isPending}
              isSuccess={createMut.isSuccess}
              isError={createMut.isError}
              onClick={() => createMut.mutate()}
            >
              Create Draft Mission
            </MutationButton>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="h-4 w-4 text-accent" />
            Mission filters
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select className="input w-full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | MissionStatus)}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="disabled">Disabled</option>
                <option value="failed">Failed</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Autonomy mode</span>
              <select className="input w-full" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
                <option value="all">All modes</option>
                <option value="autonomous">Autonomous</option>
                <option value="supervised">Supervised</option>
                <option value="interactive">Interactive</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Ownership</span>
              <select className="input w-full" value={systemFilter} onChange={(e) => setSystemFilter(e.target.value as SystemFilter)}>
                <option value="all">System and workspace</option>
                <option value="system">System missions</option>
                <option value="workspace">Workspace missions</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Template mode</span>
              <select className="input w-full" value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value as TemplateFilter)}>
                <option value="all">Templates and custom</option>
                <option value="template">Templates only</option>
                <option value="custom">Custom only</option>
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          {[
            { label: 'Active', value: activeCount, icon: <Activity className="h-4 w-4" /> },
            { label: 'System', value: systemCount, icon: <Layers3 className="h-4 w-4" /> },
            { label: 'Templates', value: templateCount, icon: <Shield className="h-4 w-4" /> },
            { label: 'Healthy', value: healthyCount, icon: <Heart className="h-4 w-4" /> },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-border/60 bg-card/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">{item.label}</p>
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
                  {item.icon}
                </div>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {missions.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionLabel={emptyCopy.cta}
          actionHint="Missions package workflows for scheduled, event-driven, or continuous autonomous execution with safety policies."
          icon={<Rocket className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {missions.map((mission) => (
            <article key={mission.id} className="rounded-2xl border border-border/60 bg-card/30 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">{mission.name}</h2>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/75">{mission.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  {mission.health_status ? (
                    <StatusBadge status={mission.health_status} />
                  ) : null}
                  <StatusBadge status={mission.status} />
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground/90">
                {mission.description || 'No mission description has been written yet.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                <span className="rounded-full border border-border/60 px-2.5 py-1">
                  Mode: {mission.autonomy_mode}
                </span>
                {mission.is_system ? <span className="rounded-full border border-border/60 px-2.5 py-1">System</span> : null}
                {mission.is_template ? <span className="rounded-full border border-border/60 px-2.5 py-1">Template</span> : null}
              </div>
              <div className="mt-4 grid gap-3 text-xs text-muted-foreground/85 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Triggers</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{mission.default_trigger_ids?.length ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Outputs</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{mission.output_artifact_types?.length ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/35 px-3 py-2">
                  <p className="uppercase tracking-[0.12em] text-muted-foreground/70">Last run</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{mission.last_run_at ? formatRelativeTime(mission.last_run_at) : 'Never'}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/35 px-3 py-3 text-sm">
                <div className="flex items-center gap-2">
                  {mission.status === 'draft' || mission.status === 'disabled' ? (
                    <button
                      type="button"
                      onClick={() => launchMutation.mutate({ id: mission.id })}
                      disabled={launchMutation.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground transition hover:border-accent/35 hover:text-accent disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Launch
                    </button>
                  ) : null}
                  {mission.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => pauseMutation.mutate(mission.id)}
                      disabled={pauseMutation.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground transition hover:border-amber-500/35 hover:text-amber-400 disabled:opacity-50"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </button>
                  ) : null}
                  {mission.status === 'paused' ? (
                    <button
                      type="button"
                      onClick={() => resumeMutation.mutate(mission.id)}
                      disabled={resumeMutation.isPending}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 text-xs text-foreground transition hover:border-accent/35 hover:text-accent disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </button>
                  ) : null}
                </div>
                <Link
                  to={missionsRoute(mission.id)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3 text-sm text-foreground transition hover:border-accent/35 hover:text-accent"
                >
                  View Details
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
