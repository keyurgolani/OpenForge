import { useParams } from 'react-router-dom'
import { FileOutput } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useArtifactsQuery } from '@/features/artifacts'
import { EMPTY_STATE_COPY, getDescription, getLabel } from '@/lib/productVocabulary'

export default function ArtifactsPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const { data, isLoading, error } = useArtifactsQuery({ workspaceId })

  if (isLoading) {
    return <LoadingState label="Loading artifacts…" />
  }

  if (error) {
    return <ErrorState message="Artifacts could not be loaded from the canonical domain API." />
  }

  const artifacts = data?.artifacts ?? []
  const emptyCopy = EMPTY_STATE_COPY.artifact

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={getLabel('artifact', true)} description={getDescription('artifact')} />
      {artifacts.length === 0 ? (
        <EmptyState
          title={emptyCopy.title}
          description={emptyCopy.description}
          actionLabel={emptyCopy.cta}
          actionHint="Artifact behaviors can mature here without resurrecting target-oriented UI."
          icon={<FileOutput className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {artifacts.map((artifact) => (
            <article key={artifact.id} className="rounded-2xl border border-border/60 bg-card/30 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">{artifact.title}</h2>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground/75">{artifact.artifact_type}</p>
                </div>
                <StatusBadge status={artifact.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground/90">
                {artifact.summary || 'This artifact does not have a summary yet.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground/85">
                <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                  Version: {artifact.version}
                </span>
                {artifact.source_mission_id ? (
                  <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                    Mission-linked
                  </span>
                ) : null}
                {artifact.source_run_id ? (
                  <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
                    Run-linked
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
