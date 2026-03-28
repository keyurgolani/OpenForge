import { cn } from '@/lib/cn'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface StatusBadgeProps {
  status: string
  variant?: BadgeVariant
  className?: string
}

const autoVariantMap: Record<string, BadgeVariant> = {
  running: 'info',
  active: 'info',
  in_progress: 'info',
  processing: 'info',
  pending: 'warning',
  queued: 'warning',
  waiting: 'warning',
  paused: 'warning',
  completed: 'success',
  success: 'success',
  healthy: 'success',
  enabled: 'success',
  ready: 'success',
  deployed: 'success',
  failed: 'danger',
  error: 'danger',
  offline: 'danger',
  disabled: 'danger',
  cancelled: 'default',
  stopped: 'default',
  draft: 'default',
  idle: 'default',
  unknown: 'default',
}

const variantStyles: Record<BadgeVariant, { dot: string; bg: string; text: string }> = {
  default: {
    dot: 'bg-fg-subtle',
    bg: 'bg-bg-sunken',
    text: 'text-fg-muted',
  },
  success: {
    dot: 'bg-success',
    bg: 'bg-success/10',
    text: 'text-success',
  },
  warning: {
    dot: 'bg-warning',
    bg: 'bg-warning/10',
    text: 'text-warning',
  },
  danger: {
    dot: 'bg-danger',
    bg: 'bg-danger/10',
    text: 'text-danger',
  },
  info: {
    dot: 'bg-primary',
    bg: 'bg-primary/10',
    text: 'text-primary',
  },
}

function resolveVariant(status: string, explicit?: BadgeVariant): BadgeVariant {
  if (explicit) return explicit
  const normalized = status.toLowerCase().replace(/[\s-]+/g, '_')
  return autoVariantMap[normalized] ?? 'default'
}

function formatLabel(status: string): string {
  return status
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function StatusBadge({ status, variant, className }: StatusBadgeProps) {
  const resolved = resolveVariant(status, variant)
  const styles = variantStyles[resolved]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5',
        'font-label text-xs font-medium',
        styles.bg,
        styles.text,
        className,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)}
        aria-hidden="true"
      />
      {formatLabel(status)}
    </span>
  )
}
