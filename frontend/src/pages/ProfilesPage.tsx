import { Sparkles } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useProfilesQuery } from '@/features/profiles'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'

export default function ProfilesPage() {
  const { data, isLoading, error } = useProfilesQuery()

  if (isLoading) {
    return <LoadingState label="Loading profiles…" />
  }

  if (error) {
    return <ErrorState message="Profiles could not be loaded from the canonical domain API." />
  }

  const profiles = data?.profiles ?? []
  const emptyCopy = EMPTY_STATE_COPY.profile

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={getLabel('profile', true)} description={getDescription('profile')} />
      {profiles.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionLabel={emptyCopy.cta}
          actionHint="Creation flows can now target the canonical profiles API."
          icon={<Sparkles className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {profiles.map((profile) => (
            <article key={profile.id} className="rounded-2xl border border-border/60 bg-card/30 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">{profile.name}</h2>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/75">{profile.slug}</p>
                </div>
                <StatusBadge status={profile.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground/90">
                {profile.description || 'No profile description has been written yet.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground/85">
                <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                  Role: {profile.role}
                </span>
                <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                  Capabilities: {profile.capability_bundle_ids?.length ?? 0}
                </span>
                {profile.is_template ? (
                  <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">Template</span>
                ) : null}
                {profile.is_system ? (
                  <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">System</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
