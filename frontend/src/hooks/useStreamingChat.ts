import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useChatWebSocket } from './useChatWebSocket'
import { useQueryClient } from '@tanstack/react-query'
import { getConversationStreamState, getGlobalConversationStreamState } from '@/lib/api'
import { useUIStore } from '@/stores/uiStore'

interface AttachmentProcessed {
    id: string
    filename: string
    status: string
    pipeline: string
    details?: string
}

// ── New Timeline Event Types ─────────────────────────────────────────────────

export interface TimelineModelSelection {
    type: 'model_selection'
    provider_name: string
    provider_display_name: string
    model: string
    is_override: boolean
}

export interface TimelineThinking {
    type: 'thinking'
    content: string
    done?: boolean
    startedAt?: number   // epoch ms when this thinking block started
    durationMs?: number  // ms from startedAt → done; set when done becomes true
}

export interface HITLSubObject {
    hitl_id: string
    action_summary: string
    risk_level: string
    agent_id?: string | null
    status: 'pending' | 'approved' | 'denied'
    resolution_note?: string | null
}

export interface TimelineToolCall {
    type: 'tool_call'
    call_id: string
    tool_name: string
    arguments: Record<string, unknown>
    hitl?: HITLSubObject | null
    success?: boolean | null
    output?: unknown
    error?: string | null
    duration_ms?: number | null
    images?: Array<{ data: string; media_type: string }> | null
    nested_timeline?: TimelineEntry[] | null
    delegated_conversation_id?: string | null
}

export interface TimelinePromptOptimized {
    type: 'prompt_optimized'
    original: string
    optimized: string
}

export interface TimelineAttachmentsProcessed {
    type: 'attachments_processed'
    attachments: AttachmentProcessed[]
}

export interface TimelineIntermediateResponse {
    type: 'intermediate_response'
    content: string
}

export interface TimelineFollowUpRequest {
    type: 'follow_up_request'
    missing_params: string[]
    question: string
}

export type TimelineEntry =
    | TimelineModelSelection
    | TimelineThinking
    | TimelineToolCall
    | TimelinePromptOptimized
    | TimelineAttachmentsProcessed
    | TimelineIntermediateResponse
    | TimelineFollowUpRequest

interface StreamSnapshot {
    content?: string
    thinking?: string
    attachments_processed?: AttachmentProcessed[]
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
}

// ── Helper: apply an event to a timeline array (used for both root and nested) ──

function applyEventToTimeline(timeline: TimelineEntry[], eventType: string, eventData: unknown): TimelineEntry[] {
    const updated = [...timeline]

    switch (eventType) {
        case 'agent_model_selection': {
            const d = eventData as TimelineModelSelection
            updated.push({
                type: 'model_selection',
                provider_name: d.provider_name,
                provider_display_name: d.provider_display_name,
                model: d.model,
                is_override: d.is_override,
            })
            break
        }
        case 'agent_thinking': {
            const chunk = eventData as string
            const last = updated[updated.length - 1]
            if (last?.type === 'thinking' && !last.done) {
                updated[updated.length - 1] = { ...last, content: last.content + chunk }
            } else {
                updated.push({ type: 'thinking', content: chunk, startedAt: Date.now() })
            }
            break
        }
        case 'agent_token': {
            // Mark last thinking as done
            const last = updated[updated.length - 1]
            if (last?.type === 'thinking' && !last.done) {
                const durationMs = last.startedAt != null ? Date.now() - last.startedAt : undefined
                updated[updated.length - 1] = { ...last, done: true, durationMs }
            }
            break
        }
        case 'agent_tool_call_start': {
            // Mark any open thinking block as done
            const lastBeforeTool = updated[updated.length - 1]
            if (lastBeforeTool?.type === 'thinking' && !lastBeforeTool.done) {
                const durationMs = lastBeforeTool.startedAt != null ? Date.now() - lastBeforeTool.startedAt : undefined
                updated[updated.length - 1] = { ...lastBeforeTool, done: true, durationMs }
            }
            const d = eventData as { call_id: string; tool_name: string; arguments: Record<string, unknown> }
            updated.push({
                type: 'tool_call',
                call_id: d.call_id,
                tool_name: d.tool_name,
                arguments: d.arguments,
                hitl: null,
                success: null,
                output: null,
                error: null,
                duration_ms: null,
                nested_timeline: null,
                delegated_conversation_id: null,
            })
            break
        }
        case 'agent_tool_hitl': {
            const d = eventData as { call_id: string; hitl_id: string; action_summary: string; risk_level: string; agent_id?: string; status: string }
            for (let i = updated.length - 1; i >= 0; i--) {
                const entry = updated[i]
                if (entry.type === 'tool_call' && entry.call_id === d.call_id) {
                    updated[i] = {
                        ...entry,
                        hitl: {
                            hitl_id: d.hitl_id,
                            action_summary: d.action_summary,
                            risk_level: d.risk_level,
                            agent_id: d.agent_id,
                            status: d.status as 'pending' | 'approved' | 'denied',
                            resolution_note: null,
                        },
                    }
                    break
                }
            }
            break
        }
        case 'agent_tool_hitl_resolved': {
            const d = eventData as { call_id: string; hitl_id: string; status: string; resolution_note?: string }
            for (let i = updated.length - 1; i >= 0; i--) {
                const entry = updated[i]
                if (entry.type === 'tool_call' && entry.call_id === d.call_id) {
                    updated[i] = {
                        ...entry,
                        hitl: entry.hitl
                            ? { ...entry.hitl, status: d.status as 'pending' | 'approved' | 'denied', resolution_note: d.resolution_note ?? null }
                            : null,
                    }
                    break
                }
            }
            break
        }
        case 'agent_tool_call_result': {
            const d = eventData as { call_id: string; tool_name: string; success: boolean; output?: unknown; error?: string; duration_ms?: number; nested_timeline?: TimelineEntry[]; delegated_conversation_id?: string }
            for (let i = updated.length - 1; i >= 0; i--) {
                const entry = updated[i]
                if (entry.type === 'tool_call' && entry.call_id === d.call_id) {
                    updated[i] = {
                        ...entry,
                        success: d.success,
                        output: d.output,
                        error: d.error ?? null,
                        duration_ms: d.duration_ms ?? null,
                        nested_timeline: d.nested_timeline ?? null,
                        delegated_conversation_id: d.delegated_conversation_id ?? null,
                    }
                    break
                }
            }
            break
        }
        case 'agent_prompt_optimized': {
            const d = eventData as { original: string; optimized: string }
            updated.push({ type: 'prompt_optimized', original: d.original, optimized: d.optimized })
            break
        }
        case 'agent_attachments_processed': {
            const d = eventData as AttachmentProcessed[]
            updated.push({ type: 'attachments_processed', attachments: Array.isArray(d) ? d : [] })
            break
        }
        case 'agent_intermediate_response': {
            const d = eventData as { content: string }
            if (d.content) {
                updated.push({ type: 'intermediate_response', content: d.content })
            }
            break
        }
        case 'follow_up_request': {
            const d = eventData as { missing_inputs?: string[]; missing_params?: string[]; content?: string; question?: string }
            updated.push({
                type: 'follow_up_request',
                missing_params: d.missing_inputs ?? d.missing_params ?? [],
                question: d.content ?? d.question ?? '',
            })
            break
        }
    }

    return updated
}

function applyNestedEvent(timeline: TimelineEntry[], scopePath: number[], innerEvent: { type: string; data: unknown }): TimelineEntry[] {
    const updated = [...timeline]
    let target = updated
    for (let depth = 0; depth < scopePath.length; depth++) {
        const idx = scopePath[depth]
        if (idx < 0 || idx >= target.length) return updated
        const entry = target[idx]
        if (entry.type !== 'tool_call') return updated
        const cloned = { ...entry } as TimelineToolCall
        if (!cloned.nested_timeline) cloned.nested_timeline = []
        else cloned.nested_timeline = [...cloned.nested_timeline]
        target[idx] = cloned
        target = cloned.nested_timeline
    }
    const result = applyEventToTimeline(target, innerEvent.type, innerEvent.data)
    // Replace the target contents in-place
    target.length = 0
    target.push(...result)
    return updated
}

export function useStreamingChat(conversationId: string | null, workspaceId?: string | null) {
    const { on, send, isConnected } = useChatWebSocket(conversationId)
    const queryClient = useQueryClient()
    const conversationsQueryKey = useMemo(() => workspaceId ? ['conversations', workspaceId] : ['global-conversations'], [workspaceId])
    const conversationQueryKey = useMemo(() => workspaceId ? ['conversation'] : ['global-conversation'], [workspaceId])

    // ── Jitter-buffer state ────────────────────────────────────────────────────
    const tokenQueueRef = useRef('')
    const displayedContentRef = useRef('')
    const activeStreamRef = useRef(false)

    const [streamingContent, setStreamingContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [isInterrupted, setIsInterrupted] = useState(false)
    const isInterruptedRef = useRef(false)
    const [lastError, setLastError] = useState<string | null>(null)
    const [timeline, setTimeline] = useState<TimelineEntry[]>([])
    const latestThinkingRef = useRef('')
    const timelineRef = useRef<TimelineEntry[]>([])

    const cancelTimeoutCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const awaitingResponseRef = useRef(false)

    // Pending message: used when a new conversation is created but WS hasn't connected yet
    const pendingMessageRef = useRef<{ payload: Record<string, unknown> } | null>(null)

    const resetStreamState = (interrupted = false) => {
        activeStreamRef.current = false
        tokenQueueRef.current = ''
        displayedContentRef.current = ''
        setStreamingContent('')
        setIsStreaming(false)
        setIsInterrupted(interrupted)
        isInterruptedRef.current = interrupted
        setLastError(null)
        // Don't clear timeline here — the persisted message carries it.
        // Timeline is reset when a new stream starts (see sendMessage).
        awaitingResponseRef.current = false
        // Clear any pending cancel timeout
        if (cancelTimeoutCleanupRef.current) {
            clearTimeout(cancelTimeoutCleanupRef.current)
            cancelTimeoutCleanupRef.current = null
        }
    }

    const resumePopulatedRef = useRef(false)

    // RAF drain loop for smooth token rendering
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
        const pendingConvId = pendingMessageRef.current?.payload.conversation_id as string | undefined
        const keepQueuedStream = Boolean(
            awaitingResponseRef.current
            && pendingConvId
            && pendingConvId === conversationId,
        )

        // Clear pending message only when switching away from the conversation it
        // was intended for; keep it when navigating TO the target conversation
        // (which happens right after a new conversation is created).
        if (pendingConvId && pendingConvId !== conversationId) {
            pendingMessageRef.current = null
        }

        if (keepQueuedStream) {
            tokenQueueRef.current = ''
            displayedContentRef.current = ''
            setStreamingContent('')
            setIsInterrupted(false)
            isInterruptedRef.current = false
            setLastError(null)
            setTimeline([])
            timelineRef.current = []
            latestThinkingRef.current = ''
            if (cancelTimeoutCleanupRef.current) {
                clearTimeout(cancelTimeoutCleanupRef.current)
                cancelTimeoutCleanupRef.current = null
            }
            return
        }

        resetStreamState()
    }, [conversationId])

    useEffect(() => {
        if (!conversationId) return

        const unsubs = [
            on('agent_stream_snapshot', (msg) => {
                const m = msg as { conversation_id: string; data?: StreamSnapshot }
                if (m.conversation_id !== conversationId) return
                const snapshot = m.data ?? {}

                resumePopulatedRef.current = true

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
                }
                setTimeline(reconstructed)
                timelineRef.current = reconstructed
                const content = snapshot.content ?? ''
                tokenQueueRef.current = ''
                displayedContentRef.current = content
                setStreamingContent(content)
                setIsStreaming(true)
                setIsInterrupted(false)
                setLastError(null)
            }),
            on('agent_attachments_processed', (msg) => {
                const m = msg as { conversation_id: string; data: AttachmentProcessed[] }
                if (m.conversation_id !== conversationId) return
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_attachments_processed', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_model_selection', (msg) => {
                const m = msg as { conversation_id: string; data: TimelineModelSelection }
                if (m.conversation_id !== conversationId) return
                resumePopulatedRef.current = true
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_model_selection', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_token', (msg) => {
                const m = msg as { conversation_id: string; data: string }
                if (m.conversation_id !== conversationId) return
                if (isInterruptedRef.current) return
                resumePopulatedRef.current = true
                tokenQueueRef.current += m.data
                // Mark last thinking as done
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_token', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_thinking', (msg) => {
                const m = msg as { conversation_id: string; data: string }
                if (m.conversation_id !== conversationId) return
                if (isInterruptedRef.current) return
                const chunk = m.data
                latestThinkingRef.current += chunk
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_thinking', chunk)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_tool_call_start', (msg) => {
                const m = msg as { conversation_id: string; data: { call_id: string; tool_name: string; arguments: Record<string, unknown> } }
                if (m.conversation_id !== conversationId) return
                latestThinkingRef.current = ''
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_tool_call_start', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_tool_hitl', (msg) => {
                const m = msg as { conversation_id: string; data: { call_id: string; hitl_id: string; action_summary: string; risk_level: string; agent_id?: string; status: string } }
                if (m.conversation_id !== conversationId) return
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_tool_hitl', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_tool_hitl_resolved', (msg) => {
                const m = msg as { conversation_id: string; data: { call_id: string; hitl_id: string; status: string; resolution_note?: string } }
                if (m.conversation_id !== conversationId) return
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_tool_hitl_resolved', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('hitl_resolved', (msg) => {
                // Also handle the direct hitl_resolved from the HITL API endpoint
                const m = msg as { data: { id: string; conversation_id: string; status: 'approved' | 'denied' } }
                if (m.data.conversation_id !== conversationId) return
                setTimeline(prev => {
                    const updated = prev.map(entry => {
                        if (entry.type === 'tool_call' && entry.hitl?.hitl_id === m.data.id) {
                            return {
                                ...entry,
                                hitl: { ...entry.hitl, status: m.data.status },
                            }
                        }
                        return entry
                    })
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_tool_call_result', (msg) => {
                const m = msg as { conversation_id: string; data: { call_id: string; tool_name: string; success: boolean; output?: unknown; error?: string; duration_ms?: number; nested_timeline?: TimelineEntry[]; delegated_conversation_id?: string } }
                if (m.conversation_id !== conversationId) return
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_tool_call_result', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_nested_event', (msg) => {
                const m = msg as { conversation_id: string; data: { scope_path: number[]; event: { type: string; data: unknown } } }
                if (m.conversation_id !== conversationId) return
                setTimeline(prev => {
                    const updated = applyNestedEvent(prev, m.data.scope_path, m.data.event)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_intermediate_response', (msg) => {
                const m = msg as { conversation_id: string; data: { content: string } }
                if (m.conversation_id !== conversationId) return
                // The intermediate content is now in the timeline — clear it from
                // the streaming response so the final response block only shows
                // the actual final-iteration content.
                tokenQueueRef.current = ''
                displayedContentRef.current = ''
                setStreamingContent('')
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_intermediate_response', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_prompt_optimized', (msg) => {
                const m = msg as { conversation_id: string; data: { original: string; optimized: string } }
                if (m.conversation_id !== conversationId) return
                setTimeline(prev => {
                    const updated = applyEventToTimeline(prev, 'agent_prompt_optimized', m.data)
                    timelineRef.current = updated
                    return updated
                })
            }),
            on('agent_done', (msg) => {
                const m = msg as { conversation_id: string; message_id: string; interrupted?: boolean }
                if (m.conversation_id !== conversationId) return
                resetStreamState(!!m.interrupted)
                queryClient.invalidateQueries({ queryKey: [...conversationQueryKey, conversationId] })
                queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
                // Refresh app shell header preview
                queryClient.invalidateQueries({ queryKey: ['conversation-header', conversationId] })
            }),
            on('agent_error', (msg) => {
                const m = msg as { conversation_id?: string; detail?: string }
                if (!conversationId || m.conversation_id !== conversationId) return

                resetStreamState()
                setLastError(m.detail || 'Chat request failed')
                queryClient.invalidateQueries({ queryKey: [...conversationQueryKey, conversationId] })
                queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
            }),
            on('conversation_updated', (msg) => {
                const m = msg as { conversation_id?: string; fields?: string[] }
                if (!m.conversation_id) return
                queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
                // Refresh app shell header title/preview and clear optimistic override
                queryClient.invalidateQueries({ queryKey: ['conversation-header', m.conversation_id] })
                useUIStore.getState().setChatHeaderOverride(null)
                if (conversationId && m.conversation_id === conversationId) {
                    queryClient.invalidateQueries({ queryKey: [...conversationQueryKey, conversationId] })
                }
            }),
        ]
        return () => unsubs.forEach(u => u())
    }, [conversationId, on, queryClient, conversationsQueryKey, conversationQueryKey])

    const applySnapshot = useCallback((state: {
        content?: string; thinking?: string; timeline?: TimelineEntry[];
        attachments_processed?: AttachmentProcessed[];
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
        setIsStreaming(true)
        setIsInterrupted(false)
        setLastError(null)
    }, [])

    // Stream resume polling
    useEffect(() => {
        if (!conversationId) return

        let cancelled = false
        let pollTimer: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        const MAX_ATTEMPTS = 12
        const RETRY_INTERVAL_MS = 1500

        const tryResume = async () => {
            if (cancelled || resumePopulatedRef.current) return
            attempt++

            try {
                const state = workspaceId
                    ? await getConversationStreamState(workspaceId, conversationId)
                    : await getGlobalConversationStreamState(conversationId)
                if (cancelled || resumePopulatedRef.current) return
                if (state?.active) {
                    if (state.content || state.thinking || (Array.isArray(state.timeline) && state.timeline.length > 0)) {
                        applySnapshot(state)
                    } else {
                        setIsStreaming(true)
                        setLastError(null)
                    }
                    if (isConnected) {
                        send({ type: 'chat_stream_resume', conversation_id: conversationId })
                    }
                    if (resumePopulatedRef.current) return
                    if (attempt < MAX_ATTEMPTS) {
                        pollTimer = setTimeout(tryResume, RETRY_INTERVAL_MS)
                    }
                    return
                }

                // Stream is not active
                if (awaitingResponseRef.current) {
                    // We sent a message but backend finished before we caught up
                    resetStreamState()
                    queryClient.invalidateQueries({ queryKey: [...conversationQueryKey, conversationId] })
                    queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
                }
                // No active stream and not awaiting — stop polling
                return
            } catch {
                // non-critical — retry on network errors only
                if (attempt < MAX_ATTEMPTS) {
                    pollTimer = setTimeout(tryResume, RETRY_INTERVAL_MS)
                }
            }
        }

        tryResume()

        return () => {
            cancelled = true
            if (pollTimer) clearTimeout(pollTimer)
        }
    }, [conversationId, workspaceId, queryClient, conversationsQueryKey, conversationQueryKey, applySnapshot, isConnected, send])

    useEffect(() => {
        if (!conversationId || !isConnected) return
        send({ type: 'chat_stream_resume', conversation_id: conversationId })
    }, [isConnected, conversationId, send])

    // Fallback: periodically check stream-state while streaming to detect
    // completion in case the agent_done WebSocket event was missed.
    // Also applies stream-state updates from polling so timeline/content
    // stay up-to-date even if WebSocket relay fails.
    const isStreamingRef = useRef(false)
    useEffect(() => { isStreamingRef.current = isStreaming }, [isStreaming])

    useEffect(() => {
        if (!conversationId) return

        let cancelled = false
        let consecutiveInactive = 0
        let lastTimelineLen = 0
        let lastContentLen = 0
        const POLL_INTERVAL = 1500 // 1.5 seconds for responsive streaming
        const REQUIRED_INACTIVE_CHECKS = 2 // need 2 consecutive inactive results

        const checkStreamState = async () => {
            if (cancelled || !isStreamingRef.current) {
                consecutiveInactive = 0
                return
            }
            try {
                const state = workspaceId
                    ? await getConversationStreamState(workspaceId, conversationId)
                    : await getGlobalConversationStreamState(conversationId)
                if (cancelled || !isStreamingRef.current) return
                if (!state?.active) {
                    consecutiveInactive++
                    if (consecutiveInactive >= REQUIRED_INACTIVE_CHECKS) {
                        // Stream is done on the backend but UI is still showing as streaming
                        resetStreamState()
                        queryClient.invalidateQueries({ queryKey: [...conversationQueryKey, conversationId] })
                        queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
                        consecutiveInactive = 0
                    }
                } else {
                    consecutiveInactive = 0
                    // Apply stream-state updates from polling if they contain
                    // new data the WebSocket relay may have missed
                    const stateTimeline = state.timeline ?? []
                    const stateContentLen = (state.content ?? '').length
                    if (stateTimeline.length > lastTimelineLen || stateContentLen > lastContentLen) {
                        lastTimelineLen = stateTimeline.length
                        lastContentLen = stateContentLen
                        applySnapshot(state)
                    }
                }
            } catch {
                // non-critical
            }
        }

        const timer = setInterval(checkStreamState, POLL_INTERVAL)
        return () => {
            cancelled = true
            clearInterval(timer)
        }
    }, [conversationId, workspaceId, queryClient, conversationsQueryKey, conversationQueryKey, applySnapshot])

    const sendMessage = useCallback((content: string, options?: SendMessageOptions, conversationOverride?: string) => {
        const targetConversationId = conversationOverride ?? conversationId
        if (!targetConversationId || !content.trim()) return false

        const payload: Record<string, unknown> = { type: 'chat_message', conversation_id: targetConversationId, content }
        if (options?.provider_id) payload.provider_id = options.provider_id
        if (options?.model_id) payload.model_id = options.model_id
        if (options?.attachment_ids?.length) payload.attachment_ids = options.attachment_ids
        if (options?.mentions?.length) payload.mentions = options.mentions

        resetStreamState(false)
        // Clear previous turn's timeline/thinking for the new message
        setTimeline([])
        timelineRef.current = []
        latestThinkingRef.current = ''
        resumePopulatedRef.current = true
        awaitingResponseRef.current = true
        setIsStreaming(true)

        if (!isConnected) {
            // New conversation: WS not connected yet. Queue the message to send when it connects.
            if (conversationOverride) {
                pendingMessageRef.current = { payload }
                return true
            }
            setIsStreaming(false)
            setLastError('Chat is disconnected. Reconnect and try again.')
            return false
        }
        const sent = send(payload)
        if (!sent) {
            setIsStreaming(false)
            setLastError('Failed to send message. Reconnecting to chat server...')
        } else {
            // Set optimistic title immediately so the app shell header updates
            const { setChatHeaderOverride } = useUIStore.getState()
            setChatHeaderOverride(content.trim())
        }
        return sent
    }, [conversationId, send, isConnected])

    const cancelStream = useCallback(() => {
        if (!conversationId || !isConnected) return
        setIsInterrupted(true)
        isInterruptedRef.current = true
        activeStreamRef.current = false
        // Capture displayed content + any remaining queued tokens before clearing
        const partialContent = (displayedContentRef.current + tokenQueueRef.current).trim()
        tokenQueueRef.current = ''
        // Immediately exit streaming visual state so the UI is responsive
        setIsStreaming(false)
        send({
            type: 'chat_cancel',
            conversation_id: conversationId,
            ...(partialContent ? { partial_content: partialContent } : {}),
        })
        // Safety timeout: if agent_done doesn't arrive within 15s, force-reset
        // and invalidate queries so the conversation reloads with the final state
        if (cancelTimeoutCleanupRef.current) clearTimeout(cancelTimeoutCleanupRef.current)
        cancelTimeoutCleanupRef.current = setTimeout(() => {
            if (isInterruptedRef.current) {
                resetStreamState(true)
                queryClient.invalidateQueries({ queryKey: [...conversationQueryKey, conversationId] })
                queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
            }
            cancelTimeoutCleanupRef.current = null
        }, 15_000)
    }, [conversationId, send, isConnected, queryClient, conversationQueryKey, conversationsQueryKey])

    const clearLastError = useCallback(() => setLastError(null), [])

    // Flush pending message when WebSocket connects
    useEffect(() => {
        if (isConnected && pendingMessageRef.current) {
            const pending = pendingMessageRef.current
            pendingMessageRef.current = null
            const sent = send(pending.payload)
            if (!sent) {
                setIsStreaming(false)
                setLastError('Failed to send message after connection. Please try again.')
            }
        }
    }, [isConnected, send])

    return {
        streamingContent,
        isStreaming,
        timeline,
        sendMessage,
        cancelStream,
        isInterrupted,
        isConnected,
        lastError,
        clearLastError,
        onWsEvent: on,
    }
}
