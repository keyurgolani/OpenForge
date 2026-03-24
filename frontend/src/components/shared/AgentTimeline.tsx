import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import MarkdownIt from 'markdown-it'
import { Brain, ChevronRight, Sparkles, Paperclip } from 'lucide-react'
import type {
    TimelineEntry,
    TimelineThinking,
    TimelineToolCall,
    TimelinePromptOptimized,
    TimelineAttachmentsProcessed,
    TimelineIntermediateResponse,
    TimelineFollowUpRequest,
} from '@/hooks/useStreamingChat'
import { ToolCallCard } from '@/components/shared/ToolCallCard'
import { TimelineBadge } from '@/components/shared/TimelineBadge'

const timelineMd = new MarkdownIt({ html: false, linkify: true, breaks: true })

/**
 * Extract displayable thought segments from streaming thinking text.
 *
 * Aggressively splits on: newlines, sentence punctuation (.!?) followed
 * by a space, and also force-breaks long runs (>100 chars) at the nearest
 * word boundary.  Short segments (<20 chars) are merged forward.
 */
export function extractThoughts(text: string): string[] {
    if (!text) return []

    // Step 1: split on newlines
    const lines = text.split('\n')
    // The last line is still being typed — don't include it
    const closedLines = lines.slice(0, -1).map(l => l.trim()).filter(Boolean)
    const lastLine = lines[lines.length - 1] || ''

    // Step 2: within the last line, split on sentence boundaries (. ! ? followed by space)
    const segments: string[] = [...closedLines]
    const sentenceRe = /(.*?[.!?])(?=\s)/g
    let lastEnd = 0
    let m: RegExpExecArray | null
    while ((m = sentenceRe.exec(lastLine)) !== null) {
        const s = lastLine.slice(lastEnd, sentenceRe.lastIndex).trim()
        if (s) segments.push(s)
        lastEnd = sentenceRe.lastIndex
    }

    // Step 3: force-break any remaining long text at word boundaries (~100 char chunks)
    const remainder = lastLine.slice(lastEnd).trim()
    if (remainder.length > 100) {
        let pos = 0
        while (pos < remainder.length) {
            const end = Math.min(pos + 100, remainder.length)
            if (end >= remainder.length) break // leave the rest as trailing
            const spaceIdx = remainder.lastIndexOf(' ', end)
            const breakAt = spaceIdx > pos ? spaceIdx : end
            segments.push(remainder.slice(pos, breakAt).trim())
            pos = breakAt
        }
    }

    // Step 4: merge short segments (<20 chars) with the next one
    const merged: string[] = []
    let buf = ''
    for (const seg of segments) {
        buf = buf ? `${buf} ${seg}` : seg
        if (buf.length >= 20) {
            merged.push(buf)
            buf = ''
        }
    }
    if (buf && merged.length > 0) {
        merged[merged.length - 1] += ' ' + buf
    } else if (buf) {
        merged.push(buf)
    }

    return merged
}

const TICKER_DWELL_MS = 1500
const TICKER_POLL_MS = 250

export function ThinkingTicker({ content }: { content: string; isStreaming: boolean }) {
    const thoughtsRef = useRef<string[]>([])
    const lastShownText = useRef<string | null>(null)
    const shownAt = useRef(0)
    const phase = useRef<'idle' | 'visible' | 'exiting' | 'entering'>('idle')
    const pRef = useRef<HTMLParagraphElement>(null)

    const [text, setText] = useState<string | null>(null)
    const [animCls, setAnimCls] = useState('ticker-enter')

    const thoughts = useMemo(() => extractThoughts(content), [content])
    thoughtsRef.current = thoughts

    // Listen for animation end to advance the phase
    useEffect(() => {
        const el = pRef.current
        if (!el) return
        const handler = () => {
            if (phase.current === 'entering') {
                phase.current = 'visible'
                shownAt.current = Date.now()
            } else if (phase.current === 'exiting') {
                // Exit done — swap text and enter
                const available = thoughtsRef.current
                const latest = available.length > 0 ? available[available.length - 1] : lastShownText.current
                if (latest) {
                    lastShownText.current = latest
                    setText(latest)
                }
                phase.current = 'entering'
                setAnimCls('ticker-enter')
            }
        }
        el.addEventListener('animationend', handler)
        return () => el.removeEventListener('animationend', handler)
    }, [text]) // rebind when text changes so pRef targets the current element

    // Interval poller — checks for new thoughts and triggers transitions
    useEffect(() => {
        const interval = setInterval(() => {
            const available = thoughtsRef.current
            if (available.length === 0) return
            const latest = available[available.length - 1]

            if (phase.current === 'idle') {
                // First thought — show with enter animation
                phase.current = 'entering'
                lastShownText.current = latest
                setText(latest)
                setAnimCls('ticker-enter')
                return
            }

            if (phase.current !== 'visible') return
            if (latest === lastShownText.current) return

            const elapsed = Date.now() - shownAt.current
            if (elapsed < TICKER_DWELL_MS) return

            // Start exit animation — the animationend handler will swap and enter
            phase.current = 'exiting'
            setAnimCls('ticker-exit')
        }, TICKER_POLL_MS)

        return () => clearInterval(interval)
    }, [])

    if (text == null) {
        return (
            <span className="thinking-shimmer text-sm font-medium">
                Thinking...
            </span>
        )
    }

    const cleaned = text.replace(/^["'"]+|["'"]+$/g, '')

    return (
        <div className="min-h-[1.6em] overflow-hidden">
            <p ref={pRef} key={text} className={`text-sm text-foreground/75 leading-relaxed ${animCls}`}>
                {cleaned}
            </p>
        </div>
    )
}

// ── Timeline renderer ────────────────────────────────────────────────────────
export function TimelineRenderer({ timeline, isLive = false }: { timeline: TimelineEntry[]; isLive?: boolean }) {
    // For items that default to closed (thinking, prompt_optimized, etc.)
    const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())
    // For items that default to open (intermediate_response)
    const [collapsedIndices, setCollapsedIndices] = useState<Set<number>>(new Set())

    const toggleIndex = useCallback((idx: number) => {
        setExpandedIndices(prev => {
            const next = new Set(prev)
            if (next.has(idx)) next.delete(idx)
            else next.add(idx)
            return next
        })
    }, [])

    const toggleCollapse = useCallback((idx: number) => {
        setCollapsedIndices(prev => {
            const next = new Set(prev)
            if (next.has(idx)) next.delete(idx)
            else next.add(idx)
            return next
        })
    }, [])

    if (!timeline || timeline.length === 0) return null

    return (
        <>
            {timeline.map((entry, idx) => {
                switch (entry.type) {
                    case 'model_selection':
                        // Model name is shown in the message footer instead
                        return null
                    case 'thinking': {
                        const e = entry as TimelineThinking
                        const durationMs = e.durationMs ?? (e as any).duration_ms
                        const isActive = isLive && (e.done === false || (e.done == null && !durationMs))

                        if (isActive) {
                            return (
                                <div key={idx} className="flex items-center gap-2 px-1 py-1">
                                    <Brain className="h-3.5 w-3.5 text-accent/60 animate-pulse flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <span className="thinking-shimmer text-sm font-medium">
                                            Reasoning in progress…
                                        </span>
                                    </div>
                                </div>
                            )
                        }

                        const isOpen = expandedIndices.has(idx)
                        return (
                            <div key={idx} className="px-1">
                                <button
                                    type="button"
                                    onClick={() => toggleIndex(idx)}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors py-0.5"
                                >
                                    <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                    <span>Thought{durationMs != null ? ` ${((durationMs) / 1000).toFixed(1)} seconds` : ''}</span>
                                </button>
                                {isOpen && (
                                    <div className="mt-1 ml-4.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground/70">
                                        Reasoning content is hidden for user-facing chats.
                                    </div>
                                )}
                            </div>
                        )
                    }
                    case 'tool_call': {
                        const e = entry as TimelineToolCall
                        const result = e.success != null
                            ? {
                                success: e.success,
                                output: e.output,
                                error: e.error ?? undefined,
                            }
                            : undefined
                        return (
                            <ToolCallCard
                                key={idx}
                                callId={e.call_id}
                                toolName={e.tool_name}
                                arguments={e.arguments}
                                result={result}
                                isRunning={e.success == null}
                                hitl={e.hitl}
                                nestedTimeline={e.nested_timeline}
                                delegatedConversationId={e.delegated_conversation_id}
                            />
                        )
                    }
                    case 'prompt_optimized': {
                        const e = entry as TimelinePromptOptimized
                        const isOpen = expandedIndices.has(idx)
                        return (
                            <TimelineBadge
                                key={idx}
                                type="optimization"
                                open={isOpen}
                                onToggle={() => toggleIndex(idx)}
                                label={
                                    <>
                                        <Sparkles className="h-3 w-3 text-accent/60" />
                                        <span className="text-[11px] text-muted-foreground/80">Prompt Optimized</span>
                                    </>
                                }
                            >
                                <div className="space-y-2 text-[11px]">
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-1">Original</div>
                                        <pre className="whitespace-pre-wrap break-words rounded bg-muted/25 px-2 py-1.5 text-foreground/70 max-h-32 overflow-y-auto">
                                            {e.original}
                                        </pre>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-1">Optimized</div>
                                        <pre className="whitespace-pre-wrap break-words rounded bg-muted/25 px-2 py-1.5 text-foreground/70 max-h-32 overflow-y-auto">
                                            {e.optimized}
                                        </pre>
                                    </div>
                                </div>
                            </TimelineBadge>
                        )
                    }
                    case 'attachments_processed': {
                        const e = entry as TimelineAttachmentsProcessed
                        const isOpen = expandedIndices.has(idx)
                        return (
                            <TimelineBadge
                                key={idx}
                                type="attachment"
                                open={isOpen}
                                onToggle={() => toggleIndex(idx)}
                                label={
                                    <>
                                        <Paperclip className="h-3 w-3 text-accent/60" />
                                        <span className="text-[11px] text-muted-foreground/80">
                                            {e.attachments.length} Attachment{e.attachments.length !== 1 ? 's' : ''} Processed
                                        </span>
                                    </>
                                }
                            >
                                <div className="space-y-1 text-[11px]">
                                    {e.attachments.map((att, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <Paperclip className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                            <span className="text-foreground/75 truncate">{att.filename}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${att.status === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                                {att.status}
                                            </span>
                                            {att.pipeline && (
                                                <span className="text-muted-foreground/40 text-[10px]">{att.pipeline}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </TimelineBadge>
                        )
                    }
                    case 'intermediate_response': {
                        const e = entry as TimelineIntermediateResponse
                        const isCollapsed = collapsedIndices.has(idx)
                        return (
                            <div key={idx}>
                                <button
                                    type="button"
                                    onClick={() => toggleCollapse(idx)}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-0.5 px-1"
                                >
                                    <ChevronRight className={`h-3 w-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                                    <span>Intermediate response</span>
                                </button>
                                {!isCollapsed && (
                                    <div className="px-4 py-2 mt-1">
                                        <div
                                            className="markdown-content text-sm"
                                            dangerouslySetInnerHTML={{ __html: timelineMd.render(e.content) }}
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    }
                    case 'follow_up_request': {
                        const e = entry as TimelineFollowUpRequest
                        return (
                            <div key={idx} className="flex items-center gap-1.5 text-xs text-amber-400/80 py-0.5 px-1">
                                <Sparkles className="h-3 w-3" />
                                <span>Awaiting input</span>
                                {e.missing_params.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground/60 ml-1">
                                        ({e.missing_params.join(', ')})
                                    </span>
                                )}
                            </div>
                        )
                    }
                    default:
                        return null
                }
            })}
        </>
    )
}
