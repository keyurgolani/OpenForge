import { Pin, Loader2 } from 'lucide-react'
import MarkdownIt from 'markdown-it'

/** Markdown renderer for card previews -- links rendered as plain text to avoid navigation on card click */
const mdPreview = new MarkdownIt({ html: false, linkify: false, typographer: true, breaks: true })
mdPreview.renderer.rules.link_open = () => ''
mdPreview.renderer.rules.link_close = () => ''

export { mdPreview }

/** Render tag chips that fit the card width */
export function TagRow({ tags }: { tags: string[] }) {
    if (tags.length === 0) return null
    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {tags.slice(0, 4).map((tag, i) => (
                <span key={`${tag}-${i}`} className="chip-accent shrink-0 text-[10px] leading-none px-2 py-0.5">
                    {tag}
                </span>
            ))}
            {tags.length > 4 && (
                <span className="chip-muted shrink-0 text-[10px] leading-none px-2 py-0.5">
                    +{tags.length - 4}
                </span>
            )}
        </div>
    )
}

/** Pin indicator shown at top-right of cards */
export function PinIndicator({ isPinned }: { isPinned: boolean }) {
    if (!isPinned) return null
    return <Pin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
}

/** Format a timestamp for card footers */
export function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    })
}

/** Format file size in human-readable units */
export function formatFileSize(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Skeleton shimmer block shown while content extraction is running */
export function ProcessingSkeleton({ className = '', lines = 3 }: { className?: string; lines?: number }) {
    return (
        <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }, (_, i) => (
                <div
                    key={i}
                    className="skeleton rounded-md h-3"
                    style={{ width: i === lines - 1 ? '60%' : i % 2 === 0 ? '100%' : '85%' }}
                />
            ))}
        </div>
    )
}

/** Full-area skeleton for thumbnail/image placeholders */
export function ThumbnailSkeleton({ className = '' }: { className?: string }) {
    return (
        <div className={`skeleton rounded-lg flex items-center justify-center ${className}`}>
            <Loader2 className="w-5 h-5 text-muted-foreground/30 animate-spin" />
        </div>
    )
}
