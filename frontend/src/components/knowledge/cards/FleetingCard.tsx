import { Zap } from 'lucide-react'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp } from './shared'

export function FleetingCard({ item, slim, isProcessing }: { item: KnowledgeListItem; slim?: boolean; isProcessing?: boolean }) {
    return (
        <div className="flex flex-col gap-2 border-l-2 border-yellow-400 pl-3 -ml-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-yellow-400">
                        Fleeting
                    </span>
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>

            {/* Content preview -- no title emphasis for fleeting thoughts */}
            {item.content_preview && (
                <p className="text-[13px] text-foreground/85 line-clamp-3 leading-relaxed">
                    {item.content_preview}
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
