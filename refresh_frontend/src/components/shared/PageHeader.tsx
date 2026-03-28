import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PageHeaderProps {
  title: string
  description?: string
  children?: ReactNode
  className?: string
}

export default function PageHeader({
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-fg-muted leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {children && (
        <div className="flex shrink-0 items-center gap-3">
          {children}
        </div>
      )}
    </div>
  )
}
