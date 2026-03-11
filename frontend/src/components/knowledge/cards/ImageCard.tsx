import { Image as ImageIcon } from 'lucide-react'
import { getKnowledgeThumbnailUrl } from '@/lib/api'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp, ThumbnailSkeleton } from './shared'

export function ImageCard({ item, workspaceId, slim, isProcessing }: { item: KnowledgeListItem; workspaceId: string; slim?: boolean; isProcessing?: boolean }) {
    const displayTitle = item.title?.trim() || item.ai_title?.trim() || null
    const hasThumbnail = !!item.thumbnail_path

    // Extract description from content_preview if available
    const description = item.content_preview?.trim() || null

    return (
        <div className="flex flex-col gap-0">
            {/* Image as hero — full bleed within card */}
            {isProcessing && !hasThumbnail ? (
                <>
                    <div className="relative -mx-4 -mt-4 rounded-t-[inherit] overflow-hidden">
                        <ThumbnailSkeleton className="h-44 w-full rounded-none" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent pt-8 pb-2.5 px-4">
                            <div className="flex items-center gap-1.5">
                                <ImageIcon className="w-3 h-3 text-pink-300/80 shrink-0" />
                                <span className="text-[10px] font-medium text-white/60">Processing…</span>
                            </div>
                        </div>
                    </div>
                </>
            ) : hasThumbnail ? (
                <div className="relative -mx-4 -mt-4 rounded-t-[inherit] overflow-hidden group">
                    <img
                        src={getKnowledgeThumbnailUrl(workspaceId, item.id)}
                        alt={displayTitle ?? 'Image preview'}
                        className="w-full object-cover h-44 transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                    />
                    {/* Gradient overlay with title */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-10 pb-2.5 px-4">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <ImageIcon className="w-3 h-3 text-pink-300/80 shrink-0" />
                                {displayTitle ? (
                                    <h3 className="font-semibold text-[13px] leading-snug line-clamp-1 text-white/95">
                                        {displayTitle}
                                    </h3>
                                ) : (
                                    <span className="text-[10px] font-medium text-white/60">Image</span>
                                )}
                            </div>
                            <PinIndicator isPinned={item.is_pinned} />
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* No thumbnail — show placeholder */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <ImageIcon className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-pink-400">Image</span>
                        </div>
                        <PinIndicator isPinned={item.is_pinned} />
                    </div>
                    <div className="flex flex-col items-center justify-center rounded-lg border border-border/40 bg-pink-500/5 py-8 mb-2">
                        <ImageIcon className="w-10 h-10 text-pink-400/25 mb-2" />
                        <h3 className={`font-semibold text-[14px] leading-snug line-clamp-1 ${displayTitle ? 'text-foreground/80' : 'text-muted-foreground/50 italic'}`}>
                            {displayTitle ?? 'Untitled Image'}
                        </h3>
                    </div>
                </>
            )}

            {/* AI description snippet */}
            {description && hasThumbnail && (
                <p className="text-[11px] text-foreground/60 line-clamp-2 leading-relaxed mt-2 px-0.5">
                    {description}
                </p>
            )}

            {!slim && (
                <>
                    {/* Tags */}
                    <div className="mt-2">
                        <TagRow tags={item.tags} />
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 mt-1 border-t border-border/40">
                        <span className="text-[10px] text-muted-foreground/80">
                            {formatTimestamp(item.updated_at)}
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}
