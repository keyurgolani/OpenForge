import { ArrowRight, Clock3, GitBranch } from 'lucide-react'
import { Link } from 'react-router-dom'

import StatusBadge from '@/components/shared/StatusBadge'
import { getArtifactSourceChips, getArtifactTypeAccent, getArtifactTypeLabel, getArtifactVisibilityLabel } from '@/features/artifacts/meta'
import { artifactsRoute } from '@/lib/routes'
import type { Artifact } from '@/types/artifacts'

interface ArtifactCardProps {
  artifact: Artifact
}

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  const sourceChips = getArtifactSourceChips(artifact)

  return (
    <Link
      to={artifactsRoute(artifact.id)}
      className="group block rounded-2xl border border-border/60 bg-card/30 p-5 transition-all hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card/45"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getArtifactTypeAccent(artifact.artifact_type)}`}>
            {getArtifactTypeLabel(artifact.artifact_type)}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{artifact.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground/90">
              {artifact.summary || 'No artifact summary has been written yet.'}
            </p>
          </div>
        </div>
        <StatusBadge status={artifact.status} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground/85">
        <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
          v{artifact.version}
        </span>
        <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
          {getArtifactVisibilityLabel(artifact.visibility)}
        </span>
        {sourceChips.map((chip) => (
          <span key={chip} className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/40 pt-4 text-xs text-muted-foreground/80">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Current version {artifact.current_version_number}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {artifact.updated_at ? new Date(artifact.updated_at).toLocaleString() : 'Recently updated'}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-accent transition-transform group-hover:translate-x-0.5">
          Inspect
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  )
}

export default ArtifactCard
