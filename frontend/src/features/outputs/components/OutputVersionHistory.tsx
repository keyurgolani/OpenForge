import { GitCompareArrows, Sparkles } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import MutationButton from '@/components/shared/MutationButton'
import StatusBadge from '@/components/shared/StatusBadge'
import type { OutputDiff, OutputVersion } from '@/types/outputs'

interface OutputVersionHistoryProps {
  versions: OutputVersion[]
  selectedVersionId?: string
  onSelectVersion: (versionId: string) => void
  onPromoteVersion: (versionId: string) => void
  promotingVersionId?: string | null
  diff?: OutputDiff | null
}

export function OutputVersionHistory({
  versions,
  selectedVersionId,
  onSelectVersion,
  onPromoteVersion,
  promotingVersionId,
  diff,
}: OutputVersionHistoryProps) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle as="h2">Version History</CardTitle>
        <CardDescription>Every material content change should stay inspectable over time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {versions.map((version) => {
            const selected = version.id === selectedVersionId
            return (
              <div
                key={version.id}
                role="button"
                tabIndex={0}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${selected ? 'border-accent/35 bg-accent/8' : 'border-border/50 bg-background/35 hover:border-border/75'} cursor-pointer`}
                onClick={() => onSelectVersion(version.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectVersion(version.id)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Version {version.version_number}</p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      {version.change_note || version.summary || 'No change note provided.'}
                    </p>
                  </div>
                  <StatusBadge status={version.status} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground/80">
                  <span>{version.created_at ? new Date(version.created_at).toLocaleString() : 'Unknown timestamp'}</span>
                  {selected ? (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Sparkles className="h-3.5 w-3.5" />
                      Selected
                    </span>
                  ) : (
                    <MutationButton
                      type="button"
                      size="sm"
                      variant="secondary"
                      isPending={promotingVersionId === version.id}
                      icon={<GitCompareArrows className="h-3.5 w-3.5" />}
                      onClick={(event) => {
                        event.stopPropagation()
                        onPromoteVersion(version.id)
                      }}
                    >
                      Promote
                    </MutationButton>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="rounded-xl border border-border/50 bg-background/35 p-4">
          <div className="mb-3 flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4 text-accent" />
            <p className="text-sm font-medium text-foreground">Version Diff</p>
          </div>
          {diff ? (
            <div className="space-y-3 text-sm text-muted-foreground/85">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border/50 px-2 py-1 text-xs">
                  v{diff.from_version_number} → v{diff.to_version_number}
                </span>
                {diff.content_changed ? <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">Content changed</span> : null}
                {diff.structured_payload_changed ? <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-xs text-sky-300">Payload changed</span> : null}
                {diff.summary_changed ? <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">Summary changed</span> : null}
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-card/50 p-3 text-xs text-foreground/85">
                {diff.content_preview || 'No text diff preview available.'}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/80">Select a version with a previous snapshot to inspect the change summary.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** @deprecated Use OutputVersionHistory instead */
export const ArtifactVersionHistory = OutputVersionHistory

export default OutputVersionHistory
