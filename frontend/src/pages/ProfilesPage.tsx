import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import MutationButton from '@/components/shared/MutationButton'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useProfilesQuery } from '@/features/profiles'
import { createProfile } from '@/lib/api'
import { profilesRoute } from '@/lib/routes'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'

type ProfileComposerState = {
  name: string
  slug: string
  description: string
  role: string
  system_prompt_ref: string
}

const EMPTY_COMPOSER: ProfileComposerState = {
  name: '',
  slug: '',
  description: '',
  role: 'assistant',
  system_prompt_ref: '',
}

export default function ProfilesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useProfilesQuery()
  const [composer, setComposer] = useState<ProfileComposerState>(EMPTY_COMPOSER)
  const [isComposerOpen, setIsComposerOpen] = useState(false)

  const createMutation = useMutation({
    mutationFn: async () => createProfile({
      name: composer.name,
      slug: composer.slug,
      description: composer.description || null,
      role: composer.role,
      system_prompt_ref: composer.system_prompt_ref || null,
      status: 'draft',
    }),
    onSuccess: async (createdProfile) => {
      setComposer(EMPTY_COMPOSER)
      setIsComposerOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['profiles'] })
      navigate(profilesRoute(workspaceId as string, createdProfile.id))
    },
  })

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
      <PageHeader
        title={getLabel('profile', true)}
        description={getDescription('profile')}
        actions={(
          <MutationButton
            isPending={false}
            variant="secondary"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => setIsComposerOpen((current) => !current)}
          >
            {isComposerOpen ? 'Close Builder' : 'New Profile'}
          </MutationButton>
        )}
      />

      {isComposerOpen ? (
        <section className="rounded-3xl border border-border/60 bg-card/35 p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Profile Builder</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a reusable worker profile with a prompt reference and the modular policies you will attach on the detail page.
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
              <span className="text-muted-foreground">Slug</span>
              <input
                className="input w-full"
                value={composer.slug}
                onChange={(event) => setComposer((current) => ({ ...current, slug: event.target.value }))}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Role</span>
              <select
                className="input w-full"
                value={composer.role}
                onChange={(event) => setComposer((current) => ({ ...current, role: event.target.value }))}
              >
                <option value="assistant">Assistant</option>
                <option value="specialist">Specialist</option>
                <option value="worker">Worker</option>
                <option value="coordinator">Coordinator</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">System Prompt Reference</span>
              <input
                className="input w-full"
                value={composer.system_prompt_ref}
                onChange={(event) => setComposer((current) => ({ ...current, system_prompt_ref: event.target.value }))}
              />
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
              isPending={createMutation.isPending}
              isSuccess={createMutation.isSuccess}
              isError={createMutation.isError}
              onClick={() => createMutation.mutate()}
            >
              Create Draft Profile
            </MutationButton>
          </div>
        </section>
      ) : null}

      {profiles.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionLabel={emptyCopy.cta}
          actionHint="Creation flows now target the canonical profiles API and detail builder."
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
              <div className="mt-5 flex justify-end">
                <Link
                  to={profilesRoute(workspaceId as string, profile.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  Inspect Builder
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
