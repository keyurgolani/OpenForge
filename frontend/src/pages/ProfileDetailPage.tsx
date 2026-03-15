import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, ShieldAlert, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import MutationButton from '@/components/shared/MutationButton'
import PageHeader from '@/components/shared/PageHeader'
import Section from '@/components/shared/Section'
import StatusBadge from '@/components/shared/StatusBadge'
import { useProfileQuery, useProfileValidationQuery, useResolvedProfileQuery } from '@/features/profiles'
import { deleteProfile, updateProfile } from '@/lib/api'
import { profilesRoute } from '@/lib/routes'

type DraftState = {
  name: string
  slug: string
  description: string
  role: string
  system_prompt_ref: string
  status: string
}

const EMPTY_DRAFT: DraftState = {
  name: '',
  slug: '',
  description: '',
  role: 'assistant',
  system_prompt_ref: '',
  status: 'draft',
}

export default function ProfileDetailPage() {
  const { workspaceId, profileId } = useParams<{ workspaceId: string; profileId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: profile, isLoading, error } = useProfileQuery(profileId)
  const { data: resolved } = useResolvedProfileQuery(profileId)
  const { data: validation } = useProfileValidationQuery(profileId)
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)

  useEffect(() => {
    if (!profile) {
      return
    }
    setDraft({
      name: profile.name,
      slug: profile.slug,
      description: profile.description ?? '',
      role: profile.role,
      system_prompt_ref: profile.system_prompt_ref ?? '',
      status: profile.status,
    })
  }, [profile])

  const saveMutation = useMutation({
    mutationFn: async () => updateProfile(profileId as string, {
      name: draft.name,
      slug: draft.slug,
      description: draft.description || null,
      role: draft.role,
      system_prompt_ref: draft.system_prompt_ref || null,
      status: draft.status,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['profile', profileId] }),
        queryClient.invalidateQueries({ queryKey: ['profile', profileId, 'resolve'] }),
        queryClient.invalidateQueries({ queryKey: ['profile', profileId, 'validate'] }),
      ])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => deleteProfile(profileId as string),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] })
      navigate(profilesRoute(workspaceId as string))
    },
  })

  if (isLoading) {
    return <LoadingState label="Loading profile builder…" />
  }

  if (error || !profile) {
    return <ErrorState message="Profile details could not be loaded from the canonical profiles API." />
  }

  const resolvedBundles = resolved?.capability_bundles ?? []

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={profile.name}
        description="Inspect, validate, and edit the modular profile configuration."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={profilesRoute(workspaceId as string)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Profiles
            </Link>
            <MutationButton
              isPending={deleteMutation.isPending}
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </MutationButton>
            <MutationButton
              isPending={saveMutation.isPending}
              isSuccess={saveMutation.isSuccess}
              isError={saveMutation.isError}
              icon={<Save className="h-4 w-4" />}
              onClick={() => saveMutation.mutate()}
            >
              Save Changes
            </MutationButton>
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
        <Section
          title="Profile Identity"
          description="Phase 7 profiles should stay focused on role, prompts, and modular references rather than workflow orchestration."
        >
          <Card glass padding="lg">
            <CardContent className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Name</span>
                <input
                  className="input w-full"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Slug</span>
                <input
                  className="input w-full"
                  value={draft.slug}
                  onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Role</span>
                <select
                  className="input w-full"
                  value={draft.role}
                  onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
                >
                  <option value="assistant">Assistant</option>
                  <option value="specialist">Specialist</option>
                  <option value="worker">Worker</option>
                  <option value="coordinator">Coordinator</option>
                  <option value="reviewer">Reviewer</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="input w-full"
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="deleted">Deleted</option>
                </select>
              </label>
              <label className="space-y-2 text-sm md:col-span-2">
                <span className="text-muted-foreground">System Prompt Reference</span>
                <input
                  className="input w-full"
                  value={draft.system_prompt_ref}
                  onChange={(event) => setDraft((current) => ({ ...current, system_prompt_ref: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm md:col-span-2">
                <span className="text-muted-foreground">Description</span>
                <textarea
                  className="input min-h-32 w-full py-3"
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
            </CardContent>
          </Card>

          <Section
            title="Resolved Composition"
            description="This surface shows the effective policy and capability bundle resolution that the runtime will consume."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Card glass>
                <CardHeader>
                  <CardTitle as="h2">Runtime Summary</CardTitle>
                  <CardDescription>Effective tools, retrieval, memory, and output defaults.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <StatusBadge status={profile.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tools enabled</span>
                    <span className="text-foreground">{resolved?.effective_tools_enabled ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Retrieval enabled</span>
                    <span className="text-foreground">{resolved?.effective_retrieval_enabled ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Retrieval limit</span>
                    <span className="text-foreground">{resolved?.effective_retrieval_limit ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>History limit</span>
                    <span className="text-foreground">{resolved?.effective_history_limit ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Default model</span>
                    <span className="text-foreground">{resolved?.effective_default_model ?? 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Output mode</span>
                    <span className="text-foreground">{resolved?.effective_execution_mode ?? 'streaming'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card glass>
                <CardHeader>
                  <CardTitle as="h2">Capability Bundles</CardTitle>
                  <CardDescription>Bundles stay modular and reusable instead of embedding runtime behavior into the profile.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resolvedBundles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No capability bundles are attached yet.</p>
                  ) : (
                    resolvedBundles.map((bundle) => (
                      <div key={bundle.id} className="rounded-xl border border-border/50 bg-background/35 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{bundle.name}</p>
                            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/80">{bundle.slug}</p>
                          </div>
                          <span className="rounded-full border border-border/50 px-2 py-1 text-xs text-muted-foreground">
                            {bundle.retrieval_enabled ? 'Retrieval On' : 'Retrieval Off'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{bundle.description || 'No bundle description yet.'}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </Section>
        </Section>

        <Section
          title="Validation"
          description="Phase 7 requires profiles to be complete reusable workers, not partial mega-configs."
        >
          <Card glass className={validation?.is_complete ? 'border-emerald-500/25' : 'border-amber-500/30'}>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Completeness Check
              </CardTitle>
              <CardDescription>
                {validation?.is_complete
                  ? 'All required modular building blocks are attached.'
                  : 'This profile still has missing or invalid architecture references.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-xl border border-border/50 bg-background/35 p-3">
                <p className="font-medium text-foreground">Missing fields</p>
                <p className="mt-2 text-muted-foreground">
                  {validation?.missing_fields.length ? validation.missing_fields.join(', ') : 'None'}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/35 p-3">
                <p className="font-medium text-foreground">Invalid references</p>
                <p className="mt-2 text-muted-foreground">
                  {validation?.invalid_references.length ? validation.invalid_references.join(', ') : 'None'}
                </p>
              </div>
              <div className="rounded-xl border border-border/50 bg-background/35 p-3">
                <p className="font-medium text-foreground">Warnings</p>
                <p className="mt-2 text-muted-foreground">
                  {validation?.warnings.length ? validation.warnings.join(' ') : 'None'}
                </p>
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}
