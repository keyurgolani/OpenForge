import { FileText } from 'lucide-react'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp, mdPreview } from './shared'

export function NoteCard({ item, slim, isProcessing }: { item: KnowledgeListItem; slim?: boolean; isProcessing?: boolean }) {
    const displayTitle = item.title?.trim() || item.ai_title?.trim() || null

    return (
        <div className="flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                        Note
                    </span>
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>

            {/* Title */}
            <h3 className={`font-semibold text-[15px] leading-snug line-clamp-2 ${displayTitle ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
                {displayTitle ?? 'Untitled'}
            </h3>

            {/* Content preview */}
            {item.content_preview && (
                <div
                    className="text-[13px] text-foreground/80 line-clamp-4 leading-relaxed prose dark:prose-invert prose-p:my-0 prose-headings:my-0 prose-headings:text-[13px] prose-headings:font-medium prose-li:my-0 prose-ul:my-0 max-w-none"
                    dangerouslySetInnerHTML={{ __html: mdPreview.render(item.content_preview) }}
                />
            )}

            {!slim && (
                <>
                    {/* Tags */}
                    <TagRow tags={item.tags} />

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/25">
                        <span className="text-[10px] text-muted-foreground/80">
                            {formatTimestamp(item.updated_at)}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">
                            {item.word_count} words
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}
