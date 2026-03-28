import { ArrowRight, Clock3, GitBranch } from 'lucide-react'
import { Link } from 'react-router-dom'

import StatusBadge from '@/components/shared/StatusBadge'
import { getOutputSourceChips, getOutputTypeAccent, getOutputTypeLabel, getOutputVisibilityLabel } from '@/features/outputs/meta'
import { outputsRoute } from '@/lib/routes'
import type { Output } from '@/types/outputs'

interface OutputCardProps {
  output: Output
}

export function OutputCard({ output }: OutputCardProps) {
  const sourceChips = getOutputSourceChips(output)

  return (
    <Link
      to={outputsRoute(output.id)}
      className="group block rounded-2xl border border-border/60 bg-card/30 p-5 transition-all hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card/45"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getOutputTypeAccent(output.artifact_type)}`}>
            {getOutputTypeLabel(output.artifact_type)}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{output.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground/90">
              {output.summary || 'No output summary has been written yet.'}
            </p>
          </div>
        </div>
        <StatusBadge status={output.status} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground/85">
        <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
          v{output.version}
        </span>
        <span className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
          {getOutputVisibilityLabel(output.visibility)}
        </span>
        {sourceChips.map((chip) => (
          <span key={chip} className="rounded-full border border-border/60 bg-background/35 px-2.5 py-1">
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground/80">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Current version {output.current_version_number}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {output.updated_at ? new Date(output.updated_at).toLocaleString() : 'Recently updated'}
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

/** @deprecated Use OutputCard instead */
export const ArtifactCard = OutputCard

export default OutputCard
