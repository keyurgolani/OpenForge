import { Bookmark, ExternalLink, Globe } from 'lucide-react'
import type { KnowledgeListItem } from './types'
import { TagRow, PinIndicator, formatTimestamp, mdPreview, ProcessingSkeleton } from './shared'

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

            {/* Title */}
            <h3 className={`font-semibold text-[15px] leading-snug line-clamp-2 ${displayTitle ? 'text-foreground' : 'text-muted-foreground/60 italic'}`}>
                {displayTitle ?? 'Untitled Bookmark'}
            </h3>

            {/* URL link */}
            {item.url && (
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="group/link flex items-center gap-2 text-[11px] text-purple-300/70 hover:text-purple-300 transition-colors truncate"
                >
                    {favicon ? (
                        <img
                            src={favicon}
                            alt=""
                            className="w-3.5 h-3.5 rounded-sm shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }}
                        />
                    ) : null}
                    <Globe className={`w-3 h-3 shrink-0 ${favicon ? 'hidden' : ''}`} />
                    <span className="truncate">{item.url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                </a>
            )}

            {/* Content preview — rendered markdown or processing skeleton */}
            {isProcessing && !item.content_preview ? (
                <ProcessingSkeleton lines={3} />
            ) : item.content_preview ? (
                <div
                    className="text-[13px] text-foreground/70 line-clamp-4 leading-relaxed prose prose-invert prose-p:my-0 prose-headings:my-0 prose-headings:text-[13px] prose-headings:font-medium prose-li:my-0 prose-ul:my-0 max-w-none"
                    dangerouslySetInnerHTML={{ __html: mdPreview.render(item.content_preview) }}
                />
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
