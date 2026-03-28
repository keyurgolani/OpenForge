import { Image as ImageIcon } from 'lucide-react'
import { getKnowledgeThumbnailUrl } from '@/lib/api'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp, ThumbnailSkeleton } from './shared'

export function ImageCard({ item, workspaceId, slim, isProcessing }: { item: KnowledgeListItem; workspaceId: string; slim?: boolean; isProcessing?: boolean }) {
    const displayTitle = item.title?.trim() || item.ai_title?.trim() || null
    const hasThumbnail = !!item.thumbnail_path
    const description = item.content_preview?.trim() || null

    return (
        <div className="flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <ImageIcon className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-pink-400">
                        Image
                    </span>
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>

            {/* Thumbnail area */}
            {isProcessing && !hasThumbnail ? (
                <ThumbnailSkeleton className="h-36" />
            ) : hasThumbnail ? (
                <div className="rounded-lg overflow-hidden border border-border/60 bg-muted/20">
                    <img
                        src={getKnowledgeThumbnailUrl(workspaceId, item.id)}
                        alt={displayTitle ?? 'Image preview'}
                        className="w-full object-cover max-h-36"
                        loading="lazy"
                    />
                </div>
            ) : (
                <div className="flex items-center justify-center rounded-lg border border-border/50 bg-pink-500/5 py-5">
                    <ImageIcon className="w-8 h-8 text-pink-400 opacity-40" />
                </div>
            )}

            {/* Title */}
            <h3 className={`font-semibold text-[14px] leading-snug line-clamp-2 ${displayTitle ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
                {displayTitle ?? 'Untitled Image'}
            </h3>

            {/* AI description snippet */}
            {description && (
                <p className="text-[11px] text-foreground/55 line-clamp-2 leading-relaxed">
                    {description}
                </p>
            )}

            {!slim && (
                <>
                    {/* Tags */}
                    <TagRow tags={item.tags} />

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/60">
                        <span className="text-[10px] text-muted-foreground/80">
                            {formatTimestamp(item.updated_at)}
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}
