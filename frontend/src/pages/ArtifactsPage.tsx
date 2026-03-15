import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileOutput, Plus, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import MutationButton from '@/components/shared/MutationButton'
import PageHeader from '@/components/shared/PageHeader'
import Section from '@/components/shared/Section'
import { ArtifactCard, ArtifactFilters, useArtifactsQuery } from '@/features/artifacts'
import { createArtifact } from '@/lib/api'
import { artifactsRoute } from '@/lib/routes'
import type { ArtifactStatus, ArtifactVisibility } from '@/types/artifacts'
import type { ArtifactType } from '@/types/common'

type CreateDraft = {
  artifact_type: ArtifactType
  title: string
  summary: string
  status: ArtifactStatus
  visibility: ArtifactVisibility
  body: string
}

const CREATE_DEFAULTS: CreateDraft = {
  artifact_type: 'note',
  title: '',
  summary: '',
  status: 'draft',
  visibility: 'workspace',
  body: '',
}

export default function ArtifactsPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [artifactType, setArtifactType] = useState<ArtifactType | 'all'>('all')
  const [status, setStatus] = useState<ArtifactStatus | 'all'>('all')
  const [visibility, setVisibility] = useState<ArtifactVisibility | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState<CreateDraft>(CREATE_DEFAULTS)

  const { data, isLoading, error } = useArtifactsQuery({
    workspaceId,
    q: search.trim() || undefined,
    artifactType: artifactType === 'all' ? undefined : artifactType,
    status: status === 'all' ? undefined : status,
    visibility: visibility === 'all' ? undefined : visibility,
  })

  const createMutation = useMutation({
    mutationFn: async () => createArtifact({
      workspace_id: workspaceId,
      artifact_type: draft.artifact_type,
      title: draft.title,
      summary: draft.summary || undefined,
      status: draft.status,
      visibility: draft.visibility,
      content_type: 'markdown',
      body: draft.body || undefined,
      structured_payload: { ui_created: true },
      creation_mode: 'user_created',
      tags: ['artifact-browser'],
      metadata: { created_from: 'artifacts_page' },
    }),
    onSuccess: async (artifact) => {
      await queryClient.invalidateQueries({ queryKey: ['artifacts'] })
      setCreateOpen(false)
      setDraft(CREATE_DEFAULTS)
      navigate(artifactsRoute(workspaceId, artifact.id))
    },
  })

  if (isLoading) {
    return <LoadingState label="Loading artifacts…" />
  }

  if (error) {
    return <ErrorState message="Artifacts could not be loaded from the canonical domain API." />
  }

  const artifacts = data?.artifacts ?? []
  const hasFilters = Boolean(search.trim()) || artifactType !== 'all' || status !== 'all' || visibility !== 'all'

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Artifacts"
        description="Browse durable outputs as first-class product objects: versioned, linkable, and ready for future publishing flows."
        actions={(
          <MutationButton
            type="button"
            size="md"
            variant={createOpen ? 'secondary' : 'primary'}
            isPending={false}
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setCreateOpen((current) => !current)}
          >
            {createOpen ? 'Close Composer' : 'New Artifact'}
          </MutationButton>
        )}
      />

      <Section
        title="Artifact Browser"
        description="Phase 8 keeps outputs unified on the existing artifact surface instead of reviving target-specific UI."
      >
        <ArtifactFilters
          search={search}
          artifactType={artifactType}
          status={status}
          visibility={visibility}
          onSearchChange={setSearch}
          onArtifactTypeChange={setArtifactType}
          onStatusChange={setStatus}
          onVisibilityChange={setVisibility}
        />
      </Section>

      {createOpen ? (
        <Card glass padding="lg">
          <CardHeader>
            <CardTitle as="h2">Create Artifact</CardTitle>
            <CardDescription>Seed a durable output manually so the artifact area is useful even before full mission/runtime emission matures.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="grid gap-4">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Title</span>
                <input
                  className="input w-full"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Summary</span>
                <textarea
                  className="input min-h-24 w-full py-3"
                  value={draft.summary}
                  onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Body</span>
                <textarea
                  className="input min-h-56 w-full py-3 font-mono text-sm"
                  value={draft.body}
                  onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                />
              </label>
            </div>
            <div className="grid gap-4">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Type</span>
                <select
                  className="input w-full"
                  value={draft.artifact_type}
                  onChange={(event) => setDraft((current) => ({ ...current, artifact_type: event.target.value as ArtifactType }))}
                >
                  <option value="note">Note</option>
                  <option value="summary">Summary</option>
                  <option value="report">Report</option>
                  <option value="plan">Plan</option>
                  <option value="target">Target</option>
                  <option value="research_brief">Research Brief</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="input w-full"
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ArtifactStatus }))}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Visibility</span>
                <select
                  className="input w-full"
                  value={draft.visibility}
                  onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as ArtifactVisibility }))}
                >
                  <option value="workspace">Workspace</option>
                  <option value="private">Private</option>
                  <option value="export_ready">Export Ready</option>
                  <option value="hidden">Hidden</option>
                </select>
              </label>
              <div className="rounded-2xl border border-accent/20 bg-accent/8 p-4 text-sm text-muted-foreground/90">
                <div className="mb-2 flex items-center gap-2 text-accent">
                  <Sparkles className="h-4 w-4" />
                  <span className="font-medium">Phase 8 intent</span>
                </div>
                Manual creation is lightweight on purpose. Material edits happen later through explicit versions on the detail page.
              </div>
              <MutationButton
                type="button"
                size="lg"
                variant="primary"
                isPending={createMutation.isPending}
                icon={<FileOutput className="h-4 w-4" />}
                disabled={!draft.title.trim()}
                onClick={() => createMutation.mutate()}
              >
                Create Artifact
              </MutationButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {artifacts.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No artifacts match these filters' : 'No artifacts yet'}
          description={hasFilters
            ? 'Try broadening the search or reset one of the filters.'
            : 'Artifacts produced by runs, missions, or manual drafting will appear here.'}
          actionLabel={hasFilters ? 'Clear Filters' : 'New Artifact'}
          actionHint={hasFilters ? 'Phase 8 filtering is active on type, status, visibility, and text search.' : 'Start with a note, plan, or target artifact and evolve it through versions.'}
          icon={<FileOutput className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} workspaceId={workspaceId} artifact={artifact} />
          ))}
        </div>
      )}
    </div>
  )
}
