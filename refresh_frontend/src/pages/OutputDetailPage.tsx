import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import {
  ArrowLeft,
  FileText,
  History,
  GitBranch,
  ExternalLink,
  Save,
  ArrowUpCircle,
  AlertTriangle,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  getOutput,
  updateOutput,
  listOutputVersions,
  getOutputVersion,
  promoteOutputVersion,
  getOutputLineage,
  listOutputSinks,
} from '@/lib/api'
import { outputsRoute } from '@/lib/routes'
import type { Output, OutputVersion, OutputLineage, OutputSink, OutputStatus } from '@/types/outputs'
import StatusBadge from '@/components/shared/StatusBadge'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import EmptyState from '@/components/shared/EmptyState'

/* -------------------------------------------------------------------------- */
/* Tab types                                                                  */
/* -------------------------------------------------------------------------- */

type Tab = 'content' | 'versions' | 'lineage' | 'sinks'

const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'content', label: 'Content', icon: FileText },
  { key: 'versions', label: 'Versions', icon: History },
  { key: 'lineage', label: 'Lineage', icon: GitBranch },
  { key: 'sinks', label: 'Sinks', icon: ExternalLink },
]

/* -------------------------------------------------------------------------- */
/* Status options                                                             */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS: OutputStatus[] = ['draft', 'active', 'superseded', 'archived']

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function OutputDetailPage() {
  const { outputId } = useParams<{ outputId: string }>()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('content')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const outputQuery = useQuery({
    queryKey: ['output', outputId],
    queryFn: () => getOutput(outputId!),
    enabled: !!outputId,
  })

  const versionsQuery = useQuery({
    queryKey: ['output-versions', outputId],
    queryFn: () => listOutputVersions(outputId!),
    enabled: !!outputId && activeTab === 'versions',
  })

  const lineageQuery = useQuery({
    queryKey: ['output-lineage', outputId],
    queryFn: () => getOutputLineage(outputId!),
    enabled: !!outputId && activeTab === 'lineage',
  })

  const sinksQuery = useQuery({
    queryKey: ['output-sinks', outputId],
    queryFn: () => listOutputSinks(outputId!),
    enabled: !!outputId && activeTab === 'sinks',
  })

  const updateMutation = useMutation({
    mutationFn: (data: { title?: string; status?: OutputStatus }) =>
      updateOutput(outputId!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['output', outputId] }),
  })

  const promoteMutation = useMutation({
    mutationFn: (versionId: string) => promoteOutputVersion(outputId!, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['output', outputId] })
      queryClient.invalidateQueries({ queryKey: ['output-versions', outputId] })
    },
  })

  const output: Output | null = outputQuery.data ?? null

  if (outputQuery.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!output) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={AlertTriangle}
          title="Output not found"
          description="The output you are looking for does not exist or has been removed."
        />
      </div>
    )
  }

  const handleTitleSave = () => {
    if (titleDraft.trim() && titleDraft !== output.title) {
      updateMutation.mutate({ title: titleDraft.trim() })
    }
    setEditingTitle(false)
  }

  const handleStatusChange = (status: OutputStatus) => {
    updateMutation.mutate({ status })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        to={outputsRoute()}
        className="inline-flex items-center gap-1.5 font-label text-sm text-fg-muted hover:text-fg transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Outputs
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          {/* Editable title */}
          <div className="flex items-center gap-2">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSave()
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                  className="rounded-md border border-border bg-bg-elevated px-3 py-1.5 font-display text-2xl font-bold text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  onClick={handleTitleSave}
                  className="rounded-md p-1.5 text-success hover:bg-success/10 transition-colors"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setEditingTitle(false)}
                  className="rounded-md p-1.5 text-fg-subtle hover:bg-bg-sunken transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
                  {output.title || 'Untitled'}
                </h1>
                <button
                  onClick={() => {
                    setTitleDraft(output.title)
                    setEditingTitle(true)
                  }}
                  className="rounded-md p-1 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-md bg-secondary/10 px-2 py-0.5 font-label text-xs font-medium text-secondary">
              {output.artifact_type.replace(/_/g, ' ')}
            </span>

            {/* Status dropdown */}
            <select
              value={output.status}
              onChange={(e) => handleStatusChange(e.target.value as OutputStatus)}
              className="rounded-md border border-border bg-bg-elevated px-2 py-0.5 font-label text-xs font-medium text-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>

            <span className="font-mono text-xs text-fg-muted">
              v{output.current_version_number}
            </span>
          </div>

          {output.summary && (
            <p className="text-sm text-fg-muted max-w-2xl">{output.summary}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/40">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 font-label text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-fg-muted hover:text-fg hover:border-border',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'content' && <ContentTab output={output} />}
      {activeTab === 'versions' && (
        <VersionsTab
          versions={versionsQuery.data?.versions ?? []}
          isLoading={versionsQuery.isLoading}
          onPromote={(versionId) => promoteMutation.mutate(versionId)}
          promotePending={promoteMutation.isPending}
          outputId={outputId!}
        />
      )}
      {activeTab === 'lineage' && (
        <LineageTab lineage={lineageQuery.data ?? null} isLoading={lineageQuery.isLoading} />
      )}
      {activeTab === 'sinks' && (
        <SinksTab sinks={sinksQuery.data?.sinks ?? []} isLoading={sinksQuery.isLoading} />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Content tab                                                                */
/* -------------------------------------------------------------------------- */

function ContentTab({ output }: { output: Output }) {
  const version = output.current_version
  const content = version?.content ?? ''
  const structuredPayload = version?.structured_payload ?? output.content ?? {}
  const hasContent = content || Object.keys(structuredPayload).length > 0

  if (!hasContent) {
    return (
      <EmptyState
        icon={FileText}
        title="No content"
        description="This output does not have any content yet."
      />
    )
  }

  return (
    <div className="space-y-6">
      {content && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated p-6">
          <div className="prose prose-sm max-w-none text-fg">
            <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed">
              {content}
            </pre>
          </div>
        </div>
      )}

      {Object.keys(structuredPayload).length > 0 && (
        <div className="rounded-lg border border-border/40 bg-bg-elevated">
          <div className="border-b border-border/30 px-5 py-3">
            <h3 className="font-display text-sm font-semibold text-fg">Structured Payload</h3>
          </div>
          <div className="p-5">
            <pre className="overflow-x-auto rounded-md bg-bg-sunken p-4 font-mono text-xs text-fg">
              {JSON.stringify(structuredPayload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Versions tab                                                               */
/* -------------------------------------------------------------------------- */

interface VersionsTabProps {
  versions: OutputVersion[]
  isLoading: boolean
  onPromote: (versionId: string) => void
  promotePending: boolean
  outputId: string
}

function VersionsTab({ versions, isLoading, onPromote, promotePending }: VersionsTabProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No versions"
        description="This output has no version history."
      />
    )
  }

  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number)

  return (
    <div className="space-y-3">
      {sorted.map((version) => (
        <div
          key={version.id}
          className="rounded-lg border border-border/40 bg-bg-elevated p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
                {version.version_number}
              </span>
              <div>
                <p className="font-label text-sm font-medium text-fg">
                  Version {version.version_number}
                </p>
                <div className="flex items-center gap-3 text-xs text-fg-muted">
                  {version.change_note && <span>{version.change_note}</span>}
                  {version.created_at && (
                    <span>
                      {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={version.status} />
              <button
                onClick={() => onPromote(version.id)}
                disabled={promotePending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-label text-xs font-medium text-fg hover:bg-bg-sunken disabled:opacity-40 transition-colors"
              >
                <ArrowUpCircle className="h-3.5 w-3.5" />
                Promote
              </button>
            </div>
          </div>

          {version.summary && (
            <p className="mt-2 text-sm text-fg-muted">{version.summary}</p>
          )}
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Lineage tab                                                                */
/* -------------------------------------------------------------------------- */

function LineageTab({ lineage, isLoading }: { lineage: OutputLineage | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!lineage) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No lineage data"
        description="Lineage information is not available for this output."
      />
    )
  }

  const sections = [
    { label: 'Sources', items: lineage.sources },
    { label: 'Derivations', items: lineage.derivations },
    { label: 'Related', items: lineage.related },
  ]

  const allEmpty = sections.every((s) => s.items.length === 0)

  if (allEmpty) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No linked items"
        description="This output has no source, derivation, or related links."
      />
    )
  }

  return (
    <div className="space-y-6">
      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <div key={section.label} className="rounded-lg border border-border/40 bg-bg-elevated">
              <div className="border-b border-border/30 px-5 py-4">
                <h3 className="font-display text-sm font-semibold text-fg">
                  {section.label} ({section.items.length})
                </h3>
              </div>
              <div className="divide-y divide-border/20">
                {section.items.map((link) => (
                  <div key={link.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="font-label text-sm text-fg">{link.link_type}</p>
                      <p className="font-mono text-xs text-fg-muted">
                        {link.target_type}: {link.target_id.slice(0, 12)}...
                      </p>
                    </div>
                    {link.label && (
                      <span className="text-xs text-fg-muted">{link.label}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ),
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sinks tab                                                                  */
/* -------------------------------------------------------------------------- */

function SinksTab({ sinks, isLoading }: { sinks: OutputSink[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (sinks.length === 0) {
    return (
      <EmptyState
        icon={ExternalLink}
        title="No sinks configured"
        description="This output does not have any output destinations configured."
      />
    )
  }

  return (
    <div className="space-y-3">
      {sinks.map((sink) => (
        <div
          key={sink.id}
          className="rounded-lg border border-border/40 bg-bg-elevated p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-label text-sm font-medium text-fg">
                {sink.sink_type.replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-fg-muted">
                State: {sink.sink_state}
                {sink.destination_ref && ` | Destination: ${sink.destination_ref}`}
              </p>
            </div>
            <StatusBadge
              status={sink.sync_status.replace(/_/g, ' ')}
              variant={
                sink.sync_status === 'synced'
                  ? 'success'
                  : sink.sync_status === 'failed_sync'
                    ? 'danger'
                    : sink.sync_status === 'pending_sync'
                      ? 'warning'
                      : 'default'
              }
            />
          </div>
          {sink.last_synced_at && (
            <p className="mt-2 text-xs text-fg-muted">
              Last synced: {format(new Date(sink.last_synced_at), 'PPpp')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
