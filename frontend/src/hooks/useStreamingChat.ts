import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspaceWebSocket } from './useWorkspaceWebSocket'
import { useQueryClient } from '@tanstack/react-query'
import { getConversationStreamState, listExecutions } from '@/lib/api'

interface Source {
    knowledge_id: string
    title: string
    snippet: string
    score: number
}

interface AttachmentProcessed {
    id: string
    filename: string
    status: string
    pipeline: string
    details?: string
}

export interface TimelineThinking {
    type: 'thinking'
    content: string
    done?: boolean
    startedAt?: number   // epoch ms when this thinking block started
    durationMs?: number  // ms from startedAt → done; set when done becomes true
}

export interface TimelineToolCall {
    type: 'tool_call'
    call_id: string
    tool_name: string
    arguments: Record<string, unknown>
    // populated once the result arrives
    success?: boolean
    output?: unknown
    error?: string
}

export interface SubagentTimelineStep {
    type: 'thinking' | 'tool_call'
    call_id?: string
    tool_name?: string
    arguments?: Record<string, unknown>
    success?: boolean
    output?: unknown
    error?: string
    content?: string  // for thinking steps
    done?: boolean    // for thinking steps — true when complete
}

export interface TimelineSubagentInvocation {
    type: 'subagent_invocation'
    call_id: string
    tool_name: string
    arguments: Record<string, unknown>
    success: boolean
    subagent_response: string
    subagent_timeline: SubagentTimelineStep[]
    subagent_conversation_id?: string | null
}

export interface TimelineHITLRequest {
    type: 'hitl_request'
    hitl_id: string
    tool_id: string
    action_summary: string
    risk_level: string
    status: 'pending' | 'approved' | 'denied'
}

export interface TimelinePromptOptimized {
    type: 'prompt_optimized'
    original: string
    optimized: string
}

export type TimelineEntry = TimelineThinking | TimelineToolCall | TimelineSubagentInvocation | TimelineHITLRequest | TimelinePromptOptimized

// Legacy aliases kept for any callers that still reference them
export type ToolCall = { call_id: string; tool_name: string; arguments: Record<string, unknown> }
export type ToolResult = { call_id: string; tool_name: string; success: boolean; output: unknown; error?: string }

interface StreamSnapshot {
    content?: string
    thinking?: string
    attachments_processed?: AttachmentProcessed[]
    sources?: Source[]
    tool_calls?: ToolCall[]
    tool_results?: Record<string, ToolResult>
    timeline?: TimelineEntry[]
    status?: string
}

export interface Mention {
    type: 'workspace' | 'chat'
    id: string
    name: string
}

interface SendMessageOptions {
    provider_id?: string
    model_id?: string
    attachment_ids?: string[]
    mentions?: Mention[]
    optimize?: boolean
}

export function useStreamingChat(conversationId: string | null) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const { on, send, isConnected } = useWorkspaceWebSocket(workspaceId)
    const queryClient = useQueryClient()

    // ── Jitter-buffer state ────────────────────────────────────────────────────
    // Incoming tokens are pushed to tokenQueueRef; a RAF loop drains the queue
    // at a velocity proportional to its depth, creating a smooth reading cadence
    // instead of the default bursty rendering.
    const tokenQueueRef = useRef('')          // chars waiting to be displayed
    const displayedContentRef = useRef('')    // mirrored ref of streamingContent
    const activeStreamRef = useRef(false)     // guards the RAF loop after reset

    const [streamingContent, setStreamingContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [isInterrupted, setIsInterrupted] = useState(false)
    const [attachmentsProcessed, setAttachmentsProcessed] = useState<AttachmentProcessed[]>([])
    const [sources, setSources] = useState<Source[]>([])
    const [lastError, setLastError] = useState<string | null>(null)
    const [thinkingByMessageId, setThinkingByMessageId] = useState<Record<string, string>>({})
    // Single ordered timeline replaces separate activeToolCalls / toolResults / streamingThinking
    const [timeline, setTimeline] = useState<TimelineEntry[]>([])
    const latestThinkingRef = useRef('')   // accumulated thinking for the current turn
    const timelineRef = useRef<TimelineEntry[]>([])

    const resetStreamState = (interrupted = false) => {
        // Stop the jitter buffer loop immediately and discard any pending queue.
        // The persisted message from the API re-fetch provides the complete text.
        activeStreamRef.current = false
        tokenQueueRef.current = ''
        displayedContentRef.current = ''
        setStreamingContent('')
        setIsStreaming(false)
        setIsInterrupted(interrupted)
        setAttachmentsProcessed([])
        setSources([])
        setLastError(null)
        setTimeline([])
        timelineRef.current = []
        latestThinkingRef.current = ''
    }

    // Track whether a resume has populated streaming state for this conversation
    const resumePopulatedRef = useRef(false)

    // RAF drain loop — runs only while isStreaming is true.
    // Dynamic velocity: take ceil(queue.length / 15) chars per frame so the
    // buffer catches up quickly when bursting and slows to 1 char/frame when
    // nearly empty, giving a natural, consistent reading cadence at ~60 fps.
    useEffect(() => {
        if (!isStreaming) return
        activeStreamRef.current = true
        let rafId: number
        const drain = () => {
            if (!activeStreamRef.current) return
            const queue = tokenQueueRef.current
            if (queue.length > 0) {
                const take = Math.max(1, Math.ceil(queue.length / 15))
                const chunk = queue.slice(0, take)
                tokenQueueRef.current = queue.slice(take)
                const next = displayedContentRef.current + chunk
                displayedContentRef.current = next
                setStreamingContent(next)
            }
            rafId = requestAnimationFrame(drain)
        }
        rafId = requestAnimationFrame(drain)
        return () => { cancelAnimationFrame(rafId) }
    }, [isStreaming])

    useEffect(() => {
        resumePopulatedRef.current = false
        resetStreamState()
    }, [conversationId])

    useEffect(() => {
        if (!conversationId) return

        const unsubs = [
            on('chat_stream_snapshot', (msg) => {
                const m = msg as { conversation_id: string; data?: StreamSnapshot }
                if (m.conversation_id !== conversationId) return
                const snapshot = m.data ?? {}

                // Mark as populated so the polling loop stops
                resumePopulatedRef.current = true

                // Use full timeline if available, otherwise reconstruct from legacy fields
                let reconstructed: TimelineEntry[]
                if (Array.isArray(snapshot.timeline) && snapshot.timeline.length > 0) {
                    reconstructed = snapshot.timeline
                    const lastThinking = [...snapshot.timeline].reverse().find(e => e.type === 'thinking')
                    if (lastThinking) latestThinkingRef.current = (lastThinking as TimelineThinking).content
                } else {
                    reconstructed = []
                    const thinking = snapshot.thinking ?? ''
                    if (thinking) {
                        reconstructed.push({ type: 'thinking', content: thinking })
                        latestThinkingRef.current = thinking
                    }
                    const toolCalls = Array.isArray(snapshot.tool_calls) ? snapshot.tool_calls : []
                    const toolResults = (snapshot.tool_results && typeof snapshot.tool_results === 'object')
                        ? snapshot.tool_results : {}
                    for (const tc of toolCalls) {
                        const result = toolResults[tc.call_id]
                        reconstructed.push({
                            type: 'tool_call',
                            call_id: tc.call_id,
                            tool_name: tc.tool_name,
                            arguments: tc.arguments,
                            ...(result ? { success: result.success, output: result.output, error: result.error } : {}),
                        })
                    }
                }
                setTimeline(reconstructed)
                timelineRef.current = reconstructed
                const content = snapshot.content ?? ''
                tokenQueueRef.current = ''
                displayedContentRef.current = content
                setStreamingContent(content)
                setAttachmentsProcessed(Array.isArray(snapshot.attachments_processed) ? snapshot.attachments_processed : [])
                setSources(Array.isArray(snapshot.sources) ? snapshot.sources : [])
                setIsStreaming(true)
                setIsInterrupted(false)
                setLastError(null)
            }),
            on('chat_attachments_processed', (msg) => {
                const m = msg as { conversation_id: string; data: AttachmentProcessed[] }
                if (m.conversation_id === conversationId) {
                    setAttachmentsProcessed(Array.isArray(m.data) ? m.data : [])
                }
            }),
            on('chat_token', (msg) => {
                const m = msg as { conversation_id: string; data: string }
                if (m.conversation_id !== conversationId) return
                // Live event arrived — stop resume polling
                resumePopulatedRef.current = true
                // Push to jitter-buffer queue; the RAF loop drains it smoothly
                tokenQueueRef.current += m.data
                // Mark the last thinking entry as done and record duration
                setTimeline(prev => {
                    const last = prev[prev.length - 1]
                    if (last?.type === 'thinking' && !last.done) {
                        const durationMs = last.startedAt != null ? Date.now() - last.startedAt : undefined
                        const updated = [...prev.slice(0, -1), { ...last, done: true, durationMs }]
                        timelineRef.current = updated
                        return updated
                    }
                    return prev
                })
            }),
            on('chat_thinking', (msg) => {
                const m = msg as { conversation_id: string; data: string }
                if (m.conversation_id !== conversationId) return
                const chunk = m.data
                latestThinkingRef.current += chunk
                setTimeline(prev => {
                    const last = prev[prev.length - 1]
                    if (last?.type === 'thinking') {
                        // Extend the latest entry; preserve startedAt for duration tracking
                        const updated = [...prev.slice(0, -1), { type: 'thinking' as const, content: last.content + chunk, startedAt: last.startedAt }]
                        timelineRef.current = updated
                        return updated
                    }
                    // New thinking block — record start time now
                    const updated = [...prev, { type: 'thinking' as const, content: chunk, startedAt: Date.now() }]
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('chat_tool_call', (msg) => {
                const m = msg as { conversation_id: string; data: ToolCall }
                if (m.conversation_id !== conversationId) return
                // Reset per-turn thinking accumulator — a new tool call starts after thinking
                latestThinkingRef.current = ''
                const entry: TimelineToolCall = {
                    type: 'tool_call',
                    call_id: m.data.call_id,
                    tool_name: m.data.tool_name,
                    arguments: m.data.arguments,
                }
                setTimeline(prev => {
                    const updated = [...prev, entry]
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('chat_tool_result', (msg) => {
                const m = msg as { conversation_id: string; data: ToolResult }
                if (m.conversation_id !== conversationId) return
                // Patch the matching tool_call entry with result data
                setTimeline(prev => {
                    const updated = prev.map(entry =>
                        entry.type === 'tool_call' && entry.call_id === m.data.call_id
                            ? { ...entry, success: m.data.success, output: m.data.output, error: m.data.error }
                            : entry
                    )
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('chat_subagent_invocation', (msg) => {
                const m = msg as { conversation_id: string; data: TimelineSubagentInvocation }
                if (m.conversation_id !== conversationId) return
                setTimeline(prev => {
                    // Replace the pending tool_call entry for agent.invoke with the
                    // richer subagent_invocation entry (same call_id). If no pending
                    // entry exists yet, just append.
                    const existingIdx = prev.findIndex(
                        e => e.type === 'tool_call' && (e as TimelineToolCall).call_id === m.data.call_id
                    )
                    const updated = existingIdx >= 0
                        ? prev.map((e, i) => i === existingIdx ? m.data : e)
                        : [...prev, m.data]
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('chat_subagent_progress', (msg) => {
                const m = msg as { conversation_id: string; data: { timeline?: SubagentTimelineStep[]; response_text?: string } }
                if (m.conversation_id !== conversationId) return
                // Update the pending agent.invoke tool_call entry with the subagent's
                // live timeline and/or streaming response text.
                setTimeline(prev => {
                    const agentIdx = prev.findIndex(
                        e => e.type === 'tool_call' && (e as TimelineToolCall).tool_name === 'agent.invoke'
                            && (e as TimelineToolCall).success === undefined
                    )
                    if (agentIdx < 0) return prev
                    const existing = prev[agentIdx] as TimelineToolCall & { _liveTimeline?: SubagentTimelineStep[]; _liveResponse?: string }
                    const patch: Record<string, unknown> = {}
                    if (m.data.timeline) patch._liveTimeline = m.data.timeline
                    if (m.data.response_text !== undefined) patch._liveResponse = m.data.response_text
                    const updated = prev.map((e, i) =>
                        i === agentIdx
                            ? { ...existing, ...patch } as TimelineToolCall
                            : e
                    )
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('chat_hitl_request', (msg) => {
                const m = msg as { conversation_id: string; data: { hitl_id: string; tool_id: string; action_summary: string; risk_level: string } }
                if (m.conversation_id !== conversationId) return
                const entry: TimelineHITLRequest = {
                    type: 'hitl_request',
                    hitl_id: m.data.hitl_id,
                    tool_id: m.data.tool_id,
                    action_summary: m.data.action_summary,
                    risk_level: m.data.risk_level,
                    status: 'pending',
                }
                setTimeline(prev => {
                    const updated = [...prev, entry]
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('hitl_resolved', (msg) => {
                const m = msg as { data: { id: string; conversation_id: string; status: 'approved' | 'denied' } }
                if (m.data.conversation_id !== conversationId) return
                setTimeline(prev => {
                    const updated = prev.map(entry =>
                        entry.type === 'hitl_request' && entry.hitl_id === m.data.id
                            ? { ...entry, status: m.data.status }
                            : entry
                    )
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('chat_prompt_optimized', (msg) => {
                const m = msg as { conversation_id: string; data: { original: string; optimized: string } }
                if (m.conversation_id !== conversationId) return
                const entry: TimelinePromptOptimized = {
                    type: 'prompt_optimized',
                    original: m.data.original,
                    optimized: m.data.optimized,
                }
                setTimeline(prev => {
                    const updated = [...prev, entry]
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('chat_done', (msg) => {
                const m = msg as { conversation_id: string; message_id: string; interrupted?: boolean }
                if (m.conversation_id !== conversationId) return
                // Store accumulated thinking keyed by message id for ChatMessageCard fallback
                const allThinking = timelineRef.current
                    .filter(e => e.type === 'thinking')
                    .map(e => (e as TimelineThinking).content)
                    .join('\n\n')
                    .trim()
                if (allThinking && m.message_id) {
                    setThinkingByMessageId(prev => ({ ...prev, [m.message_id]: allThinking }))
                }
                resetStreamState(!!m.interrupted)
                queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
                queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            }),
            on('chat_sources', (msg) => {
                const m = msg as { conversation_id: string; data: Source[] }
                if (m.conversation_id === conversationId) {
                    setSources(m.data)
                }
            }),
            on('chat_error', (msg) => {
                const m = msg as { conversation_id: string; detail: string }
                if (!m.conversation_id || m.conversation_id === conversationId) {
                    resetStreamState()
                    setLastError(m.detail || 'Chat request failed')
                    if (conversationId) {
                        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
                    }
                    queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
                }
            }),
            on('conversation_updated', (msg) => {
                const m = msg as { conversation_id?: string; fields?: string[] }
                if (!m.conversation_id || !conversationId || m.conversation_id === conversationId) {
                    queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
                    if (conversationId && m.conversation_id === conversationId) {
                        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
                    }
                }
            }),
        ]
        return () => unsubs.forEach(u => u())
    }, [conversationId, on, queryClient, workspaceId])

    // Helper: apply a stream state snapshot (from REST or WS) to local state
    const applySnapshot = useCallback((state: {
        content?: string; thinking?: string; timeline?: TimelineEntry[];
        attachments_processed?: AttachmentProcessed[]; sources?: Source[];
    }) => {
        resumePopulatedRef.current = true
        let reconstructed: TimelineEntry[] = []
        if (Array.isArray(state.timeline) && state.timeline.length > 0) {
            reconstructed = state.timeline
            const lastThinking = [...state.timeline].reverse().find((e: TimelineEntry) => e.type === 'thinking')
            if (lastThinking) latestThinkingRef.current = (lastThinking as TimelineThinking).content
        } else {
            const thinking = state.thinking ?? ''
            if (thinking) {
                reconstructed.push({ type: 'thinking', content: thinking })
                latestThinkingRef.current = thinking
            }
        }
        setTimeline(reconstructed)
        timelineRef.current = reconstructed
        const content = state.content ?? ''
        tokenQueueRef.current = ''
        displayedContentRef.current = content
        setStreamingContent(content)
        setAttachmentsProcessed(Array.isArray(state.attachments_processed) ? state.attachments_processed : [])
        setSources(Array.isArray(state.sources) ? state.sources : [])
        setIsStreaming(true)
        setIsInterrupted(false)
        setLastError(null)
    }, [])

    // Unified stream resume: polls for active execution on mount and retries
    // until streaming state is populated or no active execution is found.
    // Combines REST snapshot retrieval with WS resume to be resilient to timing.
    useEffect(() => {
        if (!conversationId || !workspaceId) return

        let cancelled = false
        let pollTimer: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        const MAX_ATTEMPTS = 6

        const tryResume = async () => {
            if (cancelled || resumePopulatedRef.current) return
            attempt++

            // 1. Try the dedicated stream-state REST endpoint (most reliable)
            try {
                const state = await getConversationStreamState(workspaceId, conversationId)
                if (cancelled || resumePopulatedRef.current) return
                if (state?.active) {
                    if (state.content || state.thinking || (Array.isArray(state.timeline) && state.timeline.length > 0)) {
                        applySnapshot(state)
                    } else {
                        setIsStreaming(true)
                        setLastError(null)
                    }
                    // Also send WS resume to start receiving live events
                    if (isConnected) {
                        send({ type: 'chat_stream_resume', conversation_id: conversationId })
                    }
                    if (resumePopulatedRef.current) return
                    // State was minimal — retry to get richer snapshot
                    if (attempt < MAX_ATTEMPTS) {
                        pollTimer = setTimeout(tryResume, 2000)
                    }
                    return
                }
            } catch {
                // Endpoint may not exist — fall through
            }

            // 2. Fallback: check running/paused_hitl executions via list API
            try {
                const execs = await listExecutions(workspaceId)
                if (cancelled || resumePopulatedRef.current) return
                const match = Array.isArray(execs)
                    ? execs.find((e: { conversation_id: string; status: string }) =>
                        e.conversation_id === conversationId &&
                        (e.status === 'running' || e.status === 'paused_hitl'))
                    : null
                if (match) {
                    setIsStreaming(true)
                    setLastError(null)
                    if (isConnected) {
                        send({ type: 'chat_stream_resume', conversation_id: conversationId })
                    }
                    if (attempt < MAX_ATTEMPTS) {
                        pollTimer = setTimeout(tryResume, 2000)
                    }
                    return
                }
            } catch {
                // non-critical
            }

            // No active execution found — retry a few times in case of timing
            if (attempt < 3) {
                pollTimer = setTimeout(tryResume, 1500)
            }
        }

        // Invalidate cached queries so conversation data re-fetches
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
        queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })

        // Start resume attempt immediately
        tryResume()

        return () => {
            cancelled = true
            if (pollTimer) clearTimeout(pollTimer)
        }
    }, [conversationId, workspaceId, queryClient, applySnapshot, isConnected, send])

    // When WS reconnects, send a resume to re-register for live events
    useEffect(() => {
        if (!conversationId || !isConnected) return
        send({ type: 'chat_stream_resume', conversation_id: conversationId })
    }, [isConnected, conversationId, send])

    const sendMessage = useCallback((content: string, options?: SendMessageOptions, conversationOverride?: string) => {
        const targetConversationId = conversationOverride ?? conversationId
        if (!targetConversationId || !content.trim()) return false
        if (!isConnected) {
            setLastError('Chat is disconnected. Reconnect and try again.')
            return false
        }
        resetStreamState(false)
        resumePopulatedRef.current = true  // fresh stream, no resume needed
        setIsStreaming(true)
        setSources([])
        const payload: Record<string, unknown> = { type: 'chat_message', conversation_id: targetConversationId, content }
        if (options?.provider_id) payload.provider_id = options.provider_id
        if (options?.model_id) payload.model_id = options.model_id
        if (options?.attachment_ids?.length) payload.attachment_ids = options.attachment_ids
        if (options?.mentions?.length) payload.mentions = options.mentions
        if (options?.optimize) payload.optimize = true
        const sent = send(payload)
        if (!sent) {
            setIsStreaming(false)
            setLastError('Failed to send message. Reconnecting to chat server...')
        }
        return sent
    }, [conversationId, send, isConnected])

    const cancelStream = useCallback(() => {
        if (!conversationId || !isConnected) return
        setIsInterrupted(true)
        send({ type: 'chat_cancel', conversation_id: conversationId })
    }, [conversationId, send, isConnected])

    const clearLastError = useCallback(() => setLastError(null), [])

    // Legacy computed values for any remaining callers
    const streamingThinking = timeline
        .filter(e => e.type === 'thinking')
        .map(e => (e as TimelineThinking).content)
        .join('\n\n')
    const activeToolCalls: ToolCall[] = timeline
        .filter(e => e.type === 'tool_call')
        .map(e => e as TimelineToolCall)
    const toolResults: Record<string, ToolResult> = {}
    for (const e of timeline) {
        if (e.type === 'tool_call' && (e as TimelineToolCall).success !== undefined) {
            const tc = e as TimelineToolCall
            toolResults[tc.call_id] = { call_id: tc.call_id, tool_name: tc.tool_name, success: tc.success!, output: tc.output, error: tc.error }
        }
    }

    return {
        streamingContent,
        streamingThinking,
        isStreaming,
        attachmentsProcessed,
        sources,
        timeline,
        activeToolCalls,
        toolResults,
        sendMessage,
        cancelStream,
        isInterrupted,
        isConnected,
        lastError,
        clearLastError,
        thinkingByMessageId,
    }
}
