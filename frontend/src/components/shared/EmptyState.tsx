import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  actionHint?: string
  onAction?: () => void
  icon?: ReactNode
}

export default function EmptyState({
  title,
  description,
  actionLabel,
  actionHint,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/15 text-accent">
        {icon ?? <Sparkles className="h-5 w-5" />}
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground/90">{description}</p>
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-flex flex-col items-center gap-1 rounded-xl border border-border/25 bg-muted/35 px-4 py-3 transition hover:bg-muted/55 cursor-pointer"
        >
          <span className="text-xs font-medium uppercase tracking-wide text-accent">{actionLabel}</span>
          {actionHint ? <span className="text-xs text-muted-foreground/80">{actionHint}</span> : null}
        </button>
      ) : null}
    </div>
  )
}
