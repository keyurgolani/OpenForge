import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-sunken">
        <Icon className="h-8 w-8 text-fg-subtle" strokeWidth={1.5} />
      </div>

      <div className="max-w-sm space-y-1.5">
        <h3 className="font-display text-base font-semibold text-fg">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-fg-muted">
          {description}
        </p>
      </div>

      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
