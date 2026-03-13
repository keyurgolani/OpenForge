import { useState, useEffect, useRef } from 'react'
import { Brain, ChevronsUp } from 'lucide-react'
import { TimelineBadge } from '@/components/shared/TimelineBadge'
import { AgentTimelineDot } from './AgentTimelineDot'

const THINKING_STREAM_MAX_HEIGHT = 160

export function TimelineThinkingBlock({
    content,
    requestVisibility,
    isActiveStream = false,
    durationMs,
}: {
    content: string
    requestVisibility?: (el: HTMLElement | null) => void
    isActiveStream?: boolean
    durationMs?: number
}) {
    const [open, setOpen] = useState(isActiveStream)
    const [fullyExpanded, setFullyExpanded] = useState(false)
    const [userInteracted, setUserInteracted] = useState(false)
    const [hasHiddenTop, setHasHiddenTop] = useState(false)

    const blockRef = useRef<HTMLDivElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const wasStreaming = useRef(isActiveStream)
    const thinkingCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!isActiveStream || fullyExpanded) return
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [content, isActiveStream, fullyExpanded])

    useEffect(() => {
        if (isActiveStream) {
            wasStreaming.current = true
            if (thinkingCollapseTimer.current) {
                clearTimeout(thinkingCollapseTimer.current)
                thinkingCollapseTimer.current = null
            }
            return
        }
        if (wasStreaming.current && !userInteracted) {
            thinkingCollapseTimer.current = setTimeout(() => {
                setOpen(false)
                thinkingCollapseTimer.current = null
            }, 3000)
        }
    }, [isActiveStream]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => { if (thinkingCollapseTimer.current) clearTimeout(thinkingCollapseTimer.current) }
    }, [])

    useEffect(() => {
        if (!isActiveStream || fullyExpanded) {
            setHasHiddenTop(false)
        }
    }, [isActiveStream, fullyExpanded])

    const toggle = () => {
        if (thinkingCollapseTimer.current) {
            clearTimeout(thinkingCollapseTimer.current)
            thinkingCollapseTimer.current = null
        }
        setUserInteracted(true)
        setOpen(prev => {
            const next = !prev
            if (next) {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => requestVisibility?.(blockRef.current))
                })
                window.setTimeout(() => requestVisibility?.(blockRef.current), 220)
            }
            return next
        })
    }

    const expandFully = () => {
        setFullyExpanded(true)
        setUserInteracted(true)
        window.requestAnimationFrame(() => requestVisibility?.(blockRef.current))
    }

    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        if (fullyExpanded) return
        const viewport = event.currentTarget
        const hasOverflow = viewport.scrollHeight - viewport.clientHeight > 2
        const hiddenTop = hasOverflow && viewport.scrollTop > 2
        setHasHiddenTop(prev => (prev === hiddenTop ? prev : hiddenTop))
    }

    const formatDuration = (ms: number) => {
        if (ms >= 60000) return Math.round(ms / 60000) + 'm'
        if (ms >= 1000) return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + 's'
        return ms + 'ms'
    }

    return (
        <TimelineBadge
            type="thinking"
            open={open}
            onToggle={toggle}
            timelineDot={<AgentTimelineDot type="thinking" />}
            blockRef={blockRef}
            detailCardClassName="relative w-full chat-section-reveal"
            label={<>
                <Brain className="w-3 h-3 text-zinc-400" />
                {isActiveStream
                    ? <><span>Thinking</span><span className="animate-pulse text-accent/50">•••</span></>
                    : open
                    ? 'Thinking'
                    : durationMs != null
                    ? `Thought for ${formatDuration(durationMs)}`
                    : 'Thought'
                }
            </>}
        >
            {isActiveStream && !fullyExpanded && hasHiddenTop && (
                <>
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-10 rounded-t-xl bg-gradient-to-b from-accent/6 via-accent/6/66 to-transparent" />
                    <button
                        type="button"
                        className="absolute left-1/2 top-0 z-[3] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full border border-accent/30 bg-card/95 px-2.5 py-0.5 text-[11px] text-accent/80 hover:border-accent/55 hover:text-accent shadow-sm"
                        onClick={expandFully}
                        aria-label="Expand thinking"
                        title="Show full thinking while streaming"
                    >
                        <ChevronsUp className="h-3 w-3" />
                        Expand
                    </button>
                </>
            )}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words"
                style={isActiveStream && !fullyExpanded ? { maxHeight: `${THINKING_STREAM_MAX_HEIGHT}px`, overflowY: 'auto' } : undefined}
            >
                {content}
                {isActiveStream && !fullyExpanded && <div className="h-6" aria-hidden />}
            </div>
        </TimelineBadge>
    )
}
