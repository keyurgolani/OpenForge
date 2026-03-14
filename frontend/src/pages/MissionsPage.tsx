import { Rocket } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useMissionsQuery } from '@/features/missions'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'

export default function MissionsPage() {
  const { data, isLoading, error } = useMissionsQuery()

  if (isLoading) {
    return <LoadingState label="Loading missions…" />
  }

  if (error) {
    return <ErrorState message="Missions could not be loaded from the canonical domain API." />
  }

  const missions = data?.missions ?? []
  const emptyCopy = EMPTY_STATE_COPY.mission

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={getLabel('mission', true)} description={getDescription('mission')} />
      {missions.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionLabel={emptyCopy.cta}
          actionHint="Mission packaging now has a destination even before the full runtime arrives."
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
                <StatusBadge status={mission.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground/90">
                {mission.description || 'No mission description has been written yet.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground/85">
                <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                  Mode: {mission.autonomy_mode}
                </span>
                <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                  Profiles: {mission.default_profile_ids?.length ?? 0}
                </span>
                <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                  Triggers: {mission.default_trigger_ids?.length ?? 0}
                </span>
                <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                  Outputs: {mission.output_artifact_types?.length ?? 0}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
