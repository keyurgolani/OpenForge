import { Link } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card'
import { getOutputLinkHref, getOutputLinkTargetLabel } from '@/features/outputs/meta'
import type { OutputLineage, OutputLink } from '@/types/outputs'

interface OutputLineagePanelProps {
  lineage?: OutputLineage | null
}

function LineageGroup({
  title,
  emptyLabel,
  items,
}: {
  title: string
  emptyLabel: string
  items: OutputLink[]
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">{title}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground/80">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const href = getOutputLinkHref(item)
            const content = (
              <div className="rounded-xl border border-border/50 bg-background/35 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label || getOutputLinkTargetLabel(item.target_type)}</p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      {getOutputLinkTargetLabel(item.target_type)} · {item.target_id}
                    </p>
                  </div>
                    <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {item.link_type.replace(/_/g, ' ')}
                    </span>
                </div>
              </div>
            )
            return href ? (
              <Link key={item.id} to={href} className="block">
                {content}
              </Link>
            ) : (
              <div key={item.id}>
                {content}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function OutputLineagePanel({ lineage }: OutputLineagePanelProps) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle as="h2">Lineage</CardTitle>
        <CardDescription>Make the output's origin visible instead of hiding it in metadata blobs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <LineageGroup
          title="Sources"
          emptyLabel="No source links were attached."
          items={lineage?.sources ?? []}
        />
        <LineageGroup
          title="Derivations"
          emptyLabel="No derivation links were attached."
          items={lineage?.derivations ?? []}
        />
        <LineageGroup
          title="Related Objects"
          emptyLabel="No related objects were attached."
          items={lineage?.related ?? []}
        />
      </CardContent>
    </Card>
  )
}

/** @deprecated Use OutputLineagePanel instead */
export const ArtifactLineagePanel = OutputLineagePanel

export default OutputLineagePanel
