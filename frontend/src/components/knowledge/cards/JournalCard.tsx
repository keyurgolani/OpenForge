import { BookOpen, Clock } from 'lucide-react'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp } from './shared'

function parseEntryCount(preview: string | null | undefined): number {
    if (!preview) return 0
    // New format: "N entries | Latest entry text..."
    const match = preview.match(/^(\d+)\s+entr(?:y|ies)\s*\|/)
    if (match) return parseInt(match[1], 10)
    // Legacy JSON format fallback
    try {
        const data = JSON.parse(preview)
        if (data?.entries) return data.entries.length
        if (Array.isArray(data)) return data.length
    } catch { /* plain text fallback */ }
    return preview.trim() ? 1 : 0
}

function latestEntryPreview(preview: string | null | undefined): string {
    if (!preview) return ''
    // New format: "N entries | Latest entry text..."
    const pipeIdx = preview.indexOf('| ')
    if (pipeIdx >= 0 && /^\d+\s+entr(?:y|ies)/.test(preview)) {
        return preview.slice(pipeIdx + 2)
    }
    // Legacy JSON format fallback
    try {
        const data = JSON.parse(preview)
        const entries = data?.entries ?? (Array.isArray(data) ? data : [])
        if (entries.length > 0) {
            const last = entries[entries.length - 1]
            return last.body?.slice(0, 200) ?? ''
        }
    } catch { return preview.slice(0, 200) }
    return ''
}

function formatJournalDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function JournalCard({ item, slim }: { item: KnowledgeListItem; slim?: boolean }) {
    const entryCount = parseEntryCount(item.content_preview || null)
    const preview = latestEntryPreview(item.content_preview || null)
    const dateLabel = formatJournalDate(item.created_at)

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Journal</span>
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>
            <h3 className="font-semibold text-[15px] leading-snug line-clamp-1 text-foreground">{dateLabel}</h3>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{entryCount} {entryCount === 1 ? 'entry' : 'entries'}</span>
            </div>
            {preview && <p className="text-[13px] text-foreground/80 line-clamp-3 leading-relaxed">{preview}</p>}
            {!slim && (
                <>
                    <TagRow tags={item.tags} />
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/25">
                        <span className="text-[10px] text-muted-foreground/80">{formatTimestamp(item.updated_at)}</span>
                        <span className="text-[10px] text-muted-foreground/60">{item.word_count} words</span>
                    </div>
                </>
            )}
        </div>
    )
}
