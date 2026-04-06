import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import MarkdownIt from 'markdown-it'
import { ArrowLeft, Archive, FileOutput, GitBranchPlus, Trash2, Upload } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import MutationButton from '@/components/shared/MutationButton'
import PageHeader from '@/components/shared/PageHeader'
import Section from '@/components/shared/Section'
import StatusBadge from '@/components/shared/StatusBadge'
import {
  OutputLineagePanel,
  OutputVersionHistory,
  getOutputOriginLabel,
  getOutputSourceChips,
  getOutputTypeAccent,
  getOutputTypeLabel,
  getOutputVisibilityLabel,
  stringifyStructuredPayload,
  useOutputLineageQuery,
  useOutputQuery,
  useOutputSinksQuery,
  useOutputVersionDiffQuery,
  useOutputVersionsQuery,
} from '@/features/outputs'
import { addOutputSink, createOutputVersion, deleteOutput, promoteOutputVersion, updateOutput } from '@/lib/api'
import { outputsRoute } from '@/lib/routes'
import type { OutputSinkType, OutputStatus, OutputVersion, OutputVisibility } from '@/types/outputs'

const md = new MarkdownIt({ html: false, linkify: false, breaks: true })

function renderMarkdown(text: string) {
  return { __html: md.render(text || '') }
}

type MetadataDraft = {
  title: string
  summary: string
  status: OutputStatus
  visibility: OutputVisibility
}

type VersionDraft = {
  body: string
  structuredPayload: string
  changeNote: string
}

export default function OutputDetailPage() {
  const { outputId = '' } = useParams<{ outputId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: output, isLoading, error } = useOutputQuery(outputId)
  const { data: versionsData } = useOutputVersionsQuery(outputId)
  const { data: lineage } = useOutputLineageQuery(outputId)
  const { data: sinksData } = useOutputSinksQuery(outputId)

  const versions = useMemo(() => versionsData?.versions ?? [], [versionsData?.versions])
  const sinks = sinksData?.sinks ?? []

  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>({
    title: '',
    summary: '',
    status: 'draft',
    visibility: 'workspace',
  })
  const [versionDraft, setVersionDraft] = useState<VersionDraft>({
    body: '',
    structuredPayload: '{}',
    changeNote: '',
  })
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(undefined)
  const [versionFormError, setVersionFormError] = useState<string | null>(null)
  const [sinkDraft, setSinkDraft] = useState<{ sink_type: OutputSinkType; destination_ref: string }>({
    sink_type: 'file_export',
    destination_ref: '',
  })

  useEffect(() => {
    if (!output) return
    setMetadataDraft({
      title: output.title,
      summary: output.summary ?? '',
      status: output.status,
      visibility: output.visibility,
    })
    setVersionDraft({
      body: output.current_version?.content ?? String(output.content?.body ?? ''),
      structuredPayload: stringifyStructuredPayload(output.current_version?.structured_payload),
      changeNote: '',
    })
  }, [output])

  useEffect(() => {
    if (!output) return
    if (!selectedVersionId) {
      setSelectedVersionId(output.current_version?.id ?? versions[0]?.id)
      return
    }
    if (!versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(output.current_version?.id ?? versions[0]?.id)
    }
  }, [output, selectedVersionId, versions])

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? output?.current_version ?? null,
    [output?.current_version, selectedVersionId, versions],
  )
  const compareVersion = useMemo(() => {
    if (!selectedVersion) return null
    const selectedIndex = versions.findIndex((version) => version.id === selectedVersion.id)
    if (selectedIndex < 0) return null
    return versions[selectedIndex + 1] ?? null
  }, [selectedVersion, versions])

  const diffQuery = useOutputVersionDiffQuery(outputId, selectedVersion?.id, compareVersion?.id)

  const invalidateOutputQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['outputs'] }),
      queryClient.invalidateQueries({ queryKey: ['output', outputId] }),
      queryClient.invalidateQueries({ queryKey: ['output', outputId, 'versions'] }),
      queryClient.invalidateQueries({ queryKey: ['output', outputId, 'lineage'] }),
      queryClient.invalidateQueries({ queryKey: ['output', outputId, 'sinks'] }),
      queryClient.invalidateQueries({ queryKey: ['output', outputId, 'diff'] }),
    ])
  }

  const saveMetadataMutation = useMutation({
    mutationFn: async () => updateOutput(outputId, {
      title: metadataDraft.title,
      summary: metadataDraft.summary || undefined,
      status: metadataDraft.status,
      visibility: metadataDraft.visibility,
    }),
    onSuccess: invalidateOutputQueries,
  })

  const archiveMutation = useMutation({
    mutationFn: async () => updateOutput(outputId, { status: 'archived' }),
    onSuccess: invalidateOutputQueries,
  })

  const deleteMutation = useMutation({
    mutationFn: async () => deleteOutput(outputId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['outputs'] })
      navigate(outputsRoute())
    },
  })

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      let parsedPayload: Record<string, unknown> = {}
      if (versionDraft.structuredPayload.trim()) {
        try {
          parsedPayload = JSON.parse(versionDraft.structuredPayload)
        } catch {
          throw new Error('Structured payload must be valid JSON.')
        }
      }
      return createOutputVersion(outputId, {
        body: versionDraft.body,
        structured_payload: parsedPayload,
        content_type: 'markdown',
        summary: metadataDraft.summary || undefined,
        change_note: versionDraft.changeNote || 'New output version',
        status: metadataDraft.status,
      })
    },
    onSuccess: async (updated) => {
      setVersionFormError(null)
      setSelectedVersionId(updated.current_version?.id ?? undefined)
      setVersionDraft((current) => ({ ...current, changeNote: '' }))
      await invalidateOutputQueries()
    },
    onError: (error: Error) => {
      setVersionFormError(error.message)
    },
  })

  const promoteVersionMutation = useMutation({
    mutationFn: async (versionId: string) => promoteOutputVersion(outputId, versionId),
    onSuccess: async (updated) => {
      setSelectedVersionId(updated.current_version?.id ?? undefined)
      await invalidateOutputQueries()
    },
  })

  const addSinkMutation = useMutation({
    mutationFn: async () => addOutputSink(outputId, {
      sink_type: sinkDraft.sink_type,
      sink_state: 'configured',
      destination_ref: sinkDraft.destination_ref || undefined,
      sync_status: 'pending_sync',
      metadata: { added_from: 'output_detail_page' },
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['output', outputId, 'sinks'] })
      setSinkDraft({ sink_type: 'file_export', destination_ref: '' })
    },
  })

  if (isLoading) {
    return <LoadingState label="Loading output detail…" />
  }

  if (error || !output) {
    return <ErrorState message="Output detail could not be loaded from the canonical output API." />
  }

  const sourceChips = getOutputSourceChips(output)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={output.title}
        description="Inspect the current version, trace where it came from, and make explicit changes through metadata updates or new versions."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={outputsRoute()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/25 bg-background/40 px-3 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Outputs
            </Link>
            <MutationButton
              type="button"
              isPending={archiveMutation.isPending}
              variant="secondary"
              icon={<Archive className="h-4 w-4" />}
              onClick={() => archiveMutation.mutate()}
            >
              Archive
            </MutationButton>
            <MutationButton
              type="button"
              isPending={deleteMutation.isPending}
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </MutationButton>
            <MutationButton
              type="button"
              isPending={saveMetadataMutation.isPending}
              isSuccess={saveMetadataMutation.isSuccess}
              isError={saveMetadataMutation.isError}
              icon={<Upload className="h-4 w-4" />}
              onClick={() => saveMetadataMutation.mutate()}
            >
              Save Metadata
            </MutationButton>
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.85fr)]">
        <div className="space-y-6">
          <Section title="Output Identity" description="Output metadata can change in place; material body changes should create versions below.">
            <Card glass>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Title</span>
                  <input
                    className="input w-full"
                    value={metadataDraft.title}
                    onChange={(event) => setMetadataDraft((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <select
                    className="input w-full"
                    value={metadataDraft.status}
                    onChange={(event) => setMetadataDraft((current) => ({ ...current, status: event.target.value as OutputStatus }))}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="superseded">Superseded</option>
                    <option value="archived">Archived</option>
                    <option value="failed">Failed</option>
                    <option value="deleted">Deleted</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Visibility</span>
                  <select
                    className="input w-full"
                    value={metadataDraft.visibility}
                    onChange={(event) => setMetadataDraft((current) => ({ ...current, visibility: event.target.value as OutputVisibility }))}
                  >
                    <option value="workspace">Workspace</option>
                    <option value="private">Private</option>
                    <option value="export_ready">Export Ready</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </label>
                <div className="rounded-2xl border border-border/20 bg-background/35 p-4 text-sm text-muted-foreground/85">
                  <p className="font-medium text-foreground">{getOutputOriginLabel(output.creation_mode)}</p>
                  <p className="mt-1">Visibility is separate from sink/export state so identity and destination don't get conflated.</p>
                </div>
                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="text-muted-foreground">Summary</span>
                  <textarea
                    className="input min-h-28 w-full py-3"
                    value={metadataDraft.summary}
                    onChange={(event) => setMetadataDraft((current) => ({ ...current, summary: event.target.value }))}
                  />
                </label>
              </CardContent>
            </Card>
          </Section>

          <Section title="Current View" description="The selected version preview stays separate from the metadata form so version state is visible and inspectable.">
            <Card glass>
              <CardHeader>
                <CardTitle as="h2">Version {selectedVersion?.version_number ?? output.current_version_number}</CardTitle>
                <CardDescription>{selectedVersion?.change_note || selectedVersion?.summary || 'No change note recorded for this version.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getOutputTypeAccent(output.artifact_type)}`}>
                    {getOutputTypeLabel(output.artifact_type)}
                  </span>
                  <StatusBadge status={output.status} />
                  <span className="rounded-full border border-border/25 bg-background/35 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {getOutputVisibilityLabel(output.visibility)}
                  </span>
                  {sourceChips.map((chip) => (
                    <span key={chip} className="rounded-full border border-border/25 bg-background/35 px-2.5 py-1 text-[11px] text-muted-foreground">
                      {chip}
                    </span>
                  ))}
                </div>
                <div
                  className="rounded-2xl border border-border/20 bg-background/45 p-4 text-sm text-foreground/90 markdown-content"
                  dangerouslySetInnerHTML={renderMarkdown(selectedVersion?.content ?? String(output.content?.body ?? ''))}
                />
                <div className="rounded-2xl border border-border/20 bg-card/45 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">Structured Payload</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-foreground/85">
                    {stringifyStructuredPayload(selectedVersion?.structured_payload)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </Section>

          <Section title="Create New Version" description="Use this form when the output body or structured payload materially changes.">
            <Card glass>
              <CardContent className="grid gap-4">
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Body</span>
                  <textarea
                    className="input min-h-56 w-full py-3 font-mono text-sm"
                    value={versionDraft.body}
                    onChange={(event) => setVersionDraft((current) => ({ ...current, body: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Structured Payload JSON</span>
                  <textarea
                    className="input min-h-40 w-full py-3 font-mono text-sm"
                    value={versionDraft.structuredPayload}
                    onChange={(event) => setVersionDraft((current) => ({ ...current, structuredPayload: event.target.value }))}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Change Note</span>
                  <input
                    className="input w-full"
                    value={versionDraft.changeNote}
                    onChange={(event) => setVersionDraft((current) => ({ ...current, changeNote: event.target.value }))}
                    placeholder="Explain what changed in this version…"
                  />
                </label>
                {versionFormError ? (
                  <p className="text-sm text-red-300">{versionFormError}</p>
                ) : null}
                <MutationButton
                  type="button"
                  size="lg"
                  variant="primary"
                  isPending={createVersionMutation.isPending}
                  icon={<GitBranchPlus className="h-4 w-4" />}
                  onClick={() => createVersionMutation.mutate()}
                >
                  Create Version
                </MutationButton>
              </CardContent>
            </Card>
          </Section>
        </div>

        <div className="space-y-6">
          <Card glass>
            <CardHeader>
              <CardTitle as="h2">Output Snapshot</CardTitle>
              <CardDescription>Current product-level status, lineage source tags, and sink summary.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground/85">
              <div className="flex items-center justify-between">
                <span>Current version</span>
                <span className="text-foreground">v{output.current_version_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Origin</span>
                <span className="text-foreground">{getOutputOriginLabel(output.creation_mode)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Visibility</span>
                <span className="text-foreground">{getOutputVisibilityLabel(output.visibility)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Sinks</span>
                <span className="text-foreground">{sinks.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last updated</span>
                <span className="text-foreground">{output.updated_at ? new Date(output.updated_at).toLocaleString() : 'Unknown'}</span>
              </div>
              {output.tags.length > 0 ? (
                <div className="pt-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {output.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border/20 px-2 py-1 text-xs text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <OutputVersionHistory
            versions={versions}
            selectedVersionId={selectedVersion?.id}
            onSelectVersion={setSelectedVersionId}
            onPromoteVersion={(versionId) => promoteVersionMutation.mutate(versionId)}
            promotingVersionId={promoteVersionMutation.isPending ? promoteVersionMutation.variables ?? null : null}
            diff={diffQuery.data ?? null}
          />

          <Card glass>
            <CardHeader>
              <CardTitle as="h2">Sinks</CardTitle>
              <CardDescription>Destination state stays explicit instead of being implied by storage paths.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {sinks.length === 0 ? (
                  <p className="text-sm text-muted-foreground/80">No sinks are attached yet.</p>
                ) : (
                  sinks.map((sink) => (
                    <div key={sink.id} className="rounded-xl border border-border/20 bg-background/35 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{sink.sink_type.replace(/_/g, ' ')}</p>
                          <p className="mt-1 text-xs text-muted-foreground/80">{sink.destination_ref || 'No destination reference'}</p>
                        </div>
                        <StatusBadge status={sink.sync_status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="grid gap-3 rounded-xl border border-border/20 bg-card/40 p-4">
                <p className="text-sm font-medium text-foreground">Attach Sink</p>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Sink Type</span>
                  <select
                    className="input w-full"
                    value={sinkDraft.sink_type}
                    onChange={(event) => setSinkDraft((current) => ({ ...current, sink_type: event.target.value as OutputSinkType }))}
                  >
                    <option value="file_export">File Export</option>
                    <option value="knowledge_linked">Knowledge Linked</option>
                    <option value="external_placeholder">External Placeholder</option>
                    <option value="internal_workspace">Internal Workspace</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Destination Reference</span>
                  <input
                    className="input w-full"
                    value={sinkDraft.destination_ref}
                    onChange={(event) => setSinkDraft((current) => ({ ...current, destination_ref: event.target.value }))}
                    placeholder="export://output.md or external://placeholder"
                  />
                </label>
                <MutationButton
                  type="button"
                  size="md"
                  variant="secondary"
                  isPending={addSinkMutation.isPending}
                  icon={<FileOutput className="h-4 w-4" />}
                  onClick={() => addSinkMutation.mutate()}
                >
                  Attach Sink
                </MutationButton>
              </div>
            </CardContent>
          </Card>

          <OutputLineagePanel lineage={lineage} />
        </div>
      </div>
    </div>
  )
}
