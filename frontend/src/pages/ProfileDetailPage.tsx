import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  deleteProfile,
  updateProfile,
  listCapabilityBundles,
  listModelPolicies,
  listMemoryPolicies,
  listSafetyPolicies,
  listOutputContracts,
} from '@/lib/api'
import { profilesRoute } from '@/lib/routes'

type DraftState = {
  name: string
  slug: string
  description: string
  role: string
  system_prompt_ref: string
  status: string
  model_policy_id: string
  memory_policy_id: string
  safety_policy_id: string
  output_contract_id: string
  capability_bundle_ids: string[]
}

const EMPTY_DRAFT: DraftState = {
  name: '',
  slug: '',
  description: '',
  role: 'assistant',
  system_prompt_ref: '',
  status: 'draft',
  model_policy_id: '',
  memory_policy_id: '',
  safety_policy_id: '',
  output_contract_id: '',
  capability_bundle_ids: [],
}

export default function ProfileDetailPage() {
  const { profileId } = useParams<{ profileId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: profile, isLoading, error } = useProfileQuery(profileId)
  const { data: resolved } = useResolvedProfileQuery(profileId)
  const { data: validation } = useProfileValidationQuery(profileId)
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)

  // Fetch building-block options
  const { data: bundlesData } = useQuery({ queryKey: ['capability-bundles'], queryFn: listCapabilityBundles })
  const { data: modelPoliciesData } = useQuery({ queryKey: ['model-policies'], queryFn: listModelPolicies })
  const { data: memoryPoliciesData } = useQuery({ queryKey: ['memory-policies'], queryFn: listMemoryPolicies })
  const { data: safetyPoliciesData } = useQuery({ queryKey: ['safety-policies'], queryFn: listSafetyPolicies })
  const { data: outputContractsData } = useQuery({ queryKey: ['output-contracts'], queryFn: listOutputContracts })

  const bundles = bundlesData?.capability_bundles ?? bundlesData?.bundles ?? []
  const modelPolicies = modelPoliciesData?.model_policies ?? modelPoliciesData?.policies ?? []
  const memoryPolicies = memoryPoliciesData?.memory_policies ?? memoryPoliciesData?.policies ?? []
  const safetyPolicies = safetyPoliciesData?.policies ?? []
  const outputContracts = outputContractsData?.output_contracts ?? outputContractsData?.contracts ?? []

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
      model_policy_id: profile.model_policy_id ?? '',
      memory_policy_id: profile.memory_policy_id ?? '',
      safety_policy_id: profile.safety_policy_id ?? '',
      output_contract_id: profile.output_contract_id ?? '',
      capability_bundle_ids: profile.capability_bundle_ids ?? [],
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
      model_policy_id: draft.model_policy_id || null,
      memory_policy_id: draft.memory_policy_id || null,
      safety_policy_id: draft.safety_policy_id || null,
      output_contract_id: draft.output_contract_id || null,
      capability_bundle_ids: draft.capability_bundle_ids,
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
      navigate(profilesRoute())
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
              to={profilesRoute()}
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
          description="Profiles stay focused on role, prompts, and modular references rather than workflow orchestration."
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

          <Card glass padding="lg">
            <CardHeader>
              <CardTitle as="h2">Architecture References</CardTitle>
              <CardDescription>Attach modular building blocks to complete the profile.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Model Policy</span>
                <select
                  className="input w-full"
                  value={draft.model_policy_id}
                  onChange={(e) => setDraft((c) => ({ ...c, model_policy_id: e.target.value }))}
                >
                  <option value="">None</option>
                  {modelPolicies.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Memory Policy</span>
                <select
                  className="input w-full"
                  value={draft.memory_policy_id}
                  onChange={(e) => setDraft((c) => ({ ...c, memory_policy_id: e.target.value }))}
                >
                  <option value="">None</option>
                  {memoryPolicies.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Safety Policy</span>
                <select
                  className="input w-full"
                  value={draft.safety_policy_id}
                  onChange={(e) => setDraft((c) => ({ ...c, safety_policy_id: e.target.value }))}
                >
                  <option value="">None</option>
                  {safetyPolicies.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Output Contract</span>
                <select
                  className="input w-full"
                  value={draft.output_contract_id}
                  onChange={(e) => setDraft((c) => ({ ...c, output_contract_id: e.target.value }))}
                >
                  <option value="">None</option>
                  {outputContracts.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <div className="space-y-2 text-sm md:col-span-2">
                <span className="text-muted-foreground">Capability Bundles</span>
                <div className="space-y-1.5 rounded-xl border border-border/50 bg-background/35 p-3">
                  {bundles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No capability bundles available.</p>
                  ) : (
                    bundles.map((b: any) => (
                      <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={draft.capability_bundle_ids.includes(b.id)}
                          onChange={(e) => {
                            setDraft((c) => ({
                              ...c,
                              capability_bundle_ids: e.target.checked
                                ? [...c.capability_bundle_ids, b.id]
                                : c.capability_bundle_ids.filter((id) => id !== b.id),
                            }))
                          }}
                        />
                        <span className="text-foreground">{b.name}</span>
                        {b.description && (
                          <span className="text-xs text-muted-foreground/70 truncate">— {b.description}</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>
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
          description="Profiles should be complete reusable workers, not partial mega-configs."
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
