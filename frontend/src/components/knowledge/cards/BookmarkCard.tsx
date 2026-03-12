import { Bookmark, ExternalLink, Globe } from 'lucide-react'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp, ProcessingSkeleton } from './shared'

function extractDomain(url: string | null): string | null {
    if (!url) return null
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url
    }
}

function getFaviconUrl(url: string | null): string | null {
    if (!url) return null
    try {
        const origin = new URL(url).origin
        return `${origin}/favicon.ico`
    } catch {
        return null
    }
}

export function BookmarkCard({ item, slim, isProcessing }: { item: KnowledgeListItem; slim?: boolean; isProcessing?: boolean }) {
    const displayTitle = item.title?.trim() || item.ai_title?.trim() || item.url_title?.trim() || null
    const domain = extractDomain(item.url)
    const favicon = getFaviconUrl(item.url)

    return (
        <div className="flex flex-col gap-2">
            {/* Header — type indicator + domain badge */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Bookmark className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-400">
                        Bookmark
                    </span>
                    {domain && (
                        <span className="text-[10px] text-muted-foreground/80 truncate max-w-[160px] rounded-full border border-border/50 bg-muted/30 px-2 py-0.5">
                            {domain}
                        </span>
                    )}
                </div>
                <PinIndicator isPinned={item.is_pinned} />
            </div>

            {/* Thumbnail area — favicon hero or icon placeholder (matches image/pdf/doc layout) */}
            <div className="flex items-center justify-center rounded-lg border border-border/30 bg-purple-500/5 py-5 relative">
                {favicon ? (
                    <>
                        <img
                            src={favicon}
                            alt=""
                            className="w-8 h-8 rounded-md"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }}
                        />
                        <Bookmark className="w-8 h-8 text-purple-400 opacity-40 hidden" />
                    </>
                ) : (
                    <Bookmark className="w-8 h-8 text-purple-400 opacity-40" />
                )}
                {/* URL overlay */}
                {item.url && (
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="absolute bottom-1.5 right-1.5 flex items-center gap-1 text-[9px] text-purple-300/60 hover:text-purple-300 transition-colors bg-black/30 rounded-md px-1.5 py-0.5 backdrop-blur-sm"
                    >
                        <Globe className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate max-w-[120px]">{domain}</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />
                    </a>
                )}
            </div>

            {/* Title */}
            <h3 className={`font-semibold text-[14px] leading-snug line-clamp-2 ${displayTitle ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
                {displayTitle ?? 'Untitled Bookmark'}
            </h3>

            {/* Content preview */}
            {isProcessing && !item.content_preview ? (
                <ProcessingSkeleton lines={2} />
            ) : item.content_preview ? (
                <p className="text-[11px] text-foreground/55 line-clamp-2 leading-relaxed">
                    {item.content_preview}
                </p>
            ) : null}

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
