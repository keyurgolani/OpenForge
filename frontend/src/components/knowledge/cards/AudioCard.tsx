import { Music } from 'lucide-react'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp } from './shared'

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    if (m >= 60) {
        const h = Math.floor(m / 60)
        const rm = m % 60
        return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioCard({ item, slim, isProcessing }: { item: KnowledgeListItem; slim?: boolean; isProcessing?: boolean }) {
    const displayTitle = item.title?.trim() || item.ai_title?.trim() || null
    const duration = item.file_metadata?.duration as number | undefined
    const contentSnippet = item.content_preview?.trim() || null

    return (
        <div className="flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Music className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">
                        Audio
                    </span>
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>

            {/* Music icon with duration badge */}
            <div className="flex items-center justify-center rounded-lg border border-border/30 bg-violet-500/5 py-6 relative">
                <Music className="w-10 h-10 text-violet-400 opacity-40" />
                {duration != null && duration > 0 && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-violet-500/20 border border-violet-400/30 px-2 py-0.5 text-[11px] font-mono font-medium text-violet-300">
                        {formatDuration(duration)}
                    </span>
                )}
            </div>

            {/* Title */}
            <h3 className={`font-semibold text-[14px] leading-snug line-clamp-2 ${displayTitle ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
                {displayTitle ?? 'Untitled Audio'}
            </h3>

            {/* Transcript snippet */}
            {contentSnippet && (
                <p className="text-[11px] text-foreground/55 line-clamp-2 leading-relaxed italic">
                    &ldquo;{contentSnippet}&rdquo;
                </p>
            )}

            {!slim && (
                <>
                    {/* Tags */}
                    <TagRow tags={item.tags} />

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/40">
                        <span className="text-[10px] text-muted-foreground/80">
                            {formatTimestamp(item.updated_at)}
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}
