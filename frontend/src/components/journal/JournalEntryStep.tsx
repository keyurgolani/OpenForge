import { useMemo } from 'react'
import { Clock, Edit3 } from 'lucide-react'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

interface JournalEntryStepProps {
  timestamp: string
  body: string
  editable: boolean
  readonly: boolean
  pulse: boolean
  onEditStart?: () => void
  entryKey?: string
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ts
  }
}

export function JournalEntryStep({ timestamp, body, editable, pulse, onEditStart, entryKey }: JournalEntryStepProps) {
  const html = useMemo(() => md.render(body), [body])

  return (
    <div
      className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--journal ${pulse ? 'animate-flash' : ''}`}
      data-entry-key={entryKey}
    >
      <div className="chat-timeline-dot">
        <Clock className="w-3.5 h-3.5 text-amber-400/70" />
      </div>
      <div>
        <div className="flex items-center gap-2 py-0.5">
          <span className="text-xs text-muted-foreground/70 tabular-nums">{formatTime(timestamp)}</span>
          {editable && onEditStart && (
            <button
              onClick={onEditStart}
              className="text-xs text-muted-foreground/60 hover:text-amber-400 transition-colors"
              aria-label="Edit entry"
            >
              <Edit3 className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="text-sm text-foreground/90 leading-relaxed mt-1 pl-1 border-l-2 border-border/25 ml-1.5">
          <div
            className="pl-3 py-1 prose prose-sm prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
}
