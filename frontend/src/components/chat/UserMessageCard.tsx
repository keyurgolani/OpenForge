import { FileText } from 'lucide-react'

interface Attachment {
  filename: string
  content_type: string
}

interface UserMessageCardProps {
  content: string
  userInitial: string
  attachments?: Attachment[]
  timestamp?: string
}

export function UserMessageCard({ content, userInitial, attachments, timestamp }: UserMessageCardProps) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-accent/15 border border-accent/25 flex-shrink-0 flex items-center justify-center text-[11px] text-accent font-semibold">
        {userInitial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-accent/6 border border-accent/12 rounded-lg px-4 py-3 text-foreground text-sm leading-relaxed">
          {content}
          {attachments && attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {attachments.map((att) => (
                <div key={att.filename} className="inline-flex items-center gap-1.5 px-2 py-1 bg-card/50 border border-border/60 rounded-sm text-xs text-muted-foreground">
                  <FileText className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{att.filename}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {timestamp && (
          <div className="text-[11px] text-muted-foreground/50 mt-1 ml-1 opacity-0 hover:opacity-100 transition-opacity">
            {timestamp}
          </div>
        )}
      </div>
    </div>
  )
}
