import { AlertTriangle } from 'lucide-react'

interface ErrorStateProps {
  title?: string
  message: string
}

export default function ErrorState({
  title = 'Unable to load this page',
  message,
}: ErrorStateProps) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.05] px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="max-w-xl text-sm text-red-300/80">{message}</p>
      </div>
    </div>
  )
}
