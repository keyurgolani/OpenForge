import LoadingSpinner from '@/components/shared/LoadingSpinner'

interface LoadingStateProps {
  label?: string
}

export default function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/20">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-muted-foreground/90">{label}</p>
    </div>
  )
}
