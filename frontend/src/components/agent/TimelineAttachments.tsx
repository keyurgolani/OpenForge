import { useState, useRef } from 'react'
import { Paperclip, CheckCircle2, XCircle, BookmarkPlus, Loader2 } from 'lucide-react'
import { TimelineBadge } from '@/components/shared/TimelineBadge'
import { AgentTimelineDot } from './AgentTimelineDot'
import { saveAttachmentToKnowledge } from '@/lib/api'
import type { TimelineAttachmentsProcessed } from '@/hooks/useStreamingChat'

interface AttachmentCardProps {
    att: { id: string; filename: string; status: string; pipeline: string; details?: string }
    workspaceId: string
}

function AttachmentCard({ att, workspaceId }: AttachmentCardProps) {
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const ok = att.status === 'processed'
    return (
        <div className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-muted/15 p-2 text-xs">
            {ok
                ? <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                : <XCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
            }
            <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground/80 truncate">{att.filename}</div>
                <div className="text-[10px] text-muted-foreground/50 flex gap-2">
                    <span>{att.pipeline}</span>
                    {att.details && <span className="truncate">{att.details}</span>}
                </div>
            </div>
            {ok && (
                <button
                    type="button"
                    onClick={async () => {
                        setSaving(true)
                        try {
                            await saveAttachmentToKnowledge(workspaceId, att.id)
                            setSaved(true)
                        } catch { /* swallow */ } finally {
                            setSaving(false)
                        }
                    }}
                    disabled={saving || saved}
                    className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] text-accent/60 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                    title="Save to knowledge base"
                >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" />
                        : saved ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        : <BookmarkPlus className="h-3 w-3" />}
                </button>
            )}
        </div>
    )
}

export function TimelineAttachments({
    entry,
    workspaceId,
    requestVisibility,
}: {
    entry: TimelineAttachmentsProcessed
    workspaceId: string
    requestVisibility?: (el: HTMLElement | null) => void
}) {
    const [open, setOpen] = useState(false)
    const blockRef = useRef<HTMLDivElement>(null)

    return (
        <TimelineBadge
            type="attachment"
            open={open}
            onToggle={() => {
                setOpen(prev => {
                    const next = !prev
                    if (next) {
                        window.requestAnimationFrame(() => {
                            window.requestAnimationFrame(() => requestVisibility?.(blockRef.current))
                        })
                        window.setTimeout(() => requestVisibility?.(blockRef.current), 220)
                    }
                    return next
                })
            }}
            timelineDot={<AgentTimelineDot type="attachment" />}
            blockRef={blockRef}
            detailCardClassName="chat-section-reveal space-y-2 w-full"
            label={<>
                <Paperclip className="h-3 w-3 text-sky-400" />
                <span>
                    Processed {entry.attachments.length} Attachment{entry.attachments.length === 1 ? '' : 's'}
                </span>
            </>}
        >
            {entry.attachments.map(att => (
                <AttachmentCard key={att.id} att={att} workspaceId={workspaceId} />
            ))}
        </TimelineBadge>
    )
}
