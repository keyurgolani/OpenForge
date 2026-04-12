import { Calendar, Lock } from 'lucide-react'

interface JournalDayHeaderProps {
  label: string       // "Today" | "Yesterday" | "April 9, 2026"
  entryCount: number
  wordCount: number
  readonly: boolean
}

export function JournalDayHeader({ label, entryCount, wordCount, readonly }: JournalDayHeaderProps) {
  return (
    <div className="chat-workflow-step chat-workflow-step--iconic chat-workflow-step--journal">
      <div className="chat-timeline-dot">
        <Calendar className="w-3.5 h-3.5 text-amber-400/80" />
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {entryCount} {entryCount === 1 ? 'entry' : 'entries'} · {wordCount} words
        </span>
        {readonly && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}
      </div>
    </div>
  )
}
