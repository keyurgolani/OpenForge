import { Code2 } from 'lucide-react'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp } from './shared'

export function GistCard({ item, slim, isProcessing }: { item: KnowledgeListItem; slim?: boolean; isProcessing?: boolean }) {
    const displayTitle = item.title?.trim() || item.ai_title?.trim() || null
    const codeLines = (item.content_preview || '').split('\n').slice(0, 6).join('\n')

    return (
        <div className="flex flex-col gap-2">
            {/* Header with language badge */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Code2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-green-400">
                        Gist
                    </span>
                    {item.gist_language && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-300 border border-green-500/30">
                            {item.gist_language}
                        </span>
                    )}
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>

            {/* Title if present */}
            {displayTitle && (
                <h3 className="font-semibold text-[14px] leading-snug line-clamp-1 text-foreground">
                    {displayTitle}
                </h3>
            )}

            {/* Code snippet */}
            {codeLines && (
                <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground/80 bg-muted/25 rounded-lg px-3 py-2 overflow-hidden max-h-[7.5rem] border border-border/30">
                    {codeLines}
                </pre>
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
                        <span className="text-[10px] text-muted-foreground/60">
                            {item.word_count} words
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}
