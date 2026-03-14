import { getStatusColor, getStatusLabel } from '@/lib/status'

interface StatusBadgeProps {
  status: string
}

const STATUS_CLASSNAMES = {
  default: 'border-border/60 bg-muted/45 text-muted-foreground',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  error: 'border-red-500/25 bg-red-500/10 text-red-300',
  info: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
} as const

export default function StatusBadge({ status }: StatusBadgeProps) {
  const color = getStatusColor(status as never)
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${STATUS_CLASSNAMES[color]}`}
    >
      {getStatusLabel(status)}
    </span>
  )
}
