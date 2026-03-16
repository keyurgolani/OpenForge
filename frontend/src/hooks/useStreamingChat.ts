import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspaceWebSocket } from './useWorkspaceWebSocket'
import { useQueryClient } from '@tanstack/react-query'
import { getConversationStreamState } from '@/lib/api'

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

export type TimelineEntry =
    | TimelineModelSelection
    | TimelineThinking
    | TimelineToolCall
    | TimelinePromptOptimized
    | TimelineAttachmentsProcessed
    | TimelineIntermediateResponse

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
    optimize?: boolean
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

export function useStreamingChat(conversationId: string | null) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const { on, send, isConnected } = useWorkspaceWebSocket(workspaceId, 'agent')
    const queryClient = useQueryClient()

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

    const resetStreamState = (interrupted = false) => {
        activeStreamRef.current = false
        tokenQueueRef.current = ''
        displayedContentRef.current = ''
        setStreamingContent('')
        setIsStreaming(false)
        setIsInterrupted(interrupted)
        isInterruptedRef.current = interrupted
        setLastError(null)
        setTimeline([])
        timelineRef.current = []
        latestThinkingRef.current = ''
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
                queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
                queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            }),
            on('agent_error', (msg) => {
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
        if (!conversationId || !workspaceId) return

        let cancelled = false
        let pollTimer: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        const MAX_ATTEMPTS = 6

        const tryResume = async () => {
            if (cancelled || resumePopulatedRef.current) return
            attempt++

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
                    if (isConnected) {
                        send({ type: 'chat_stream_resume', conversation_id: conversationId })
                    }
                    if (resumePopulatedRef.current) return
                    if (attempt < MAX_ATTEMPTS) {
                        pollTimer = setTimeout(tryResume, 2000)
                    }
                    return
                }
            } catch {
                // non-critical
            }

            if (attempt < 3) {
                pollTimer = setTimeout(tryResume, 1500)
            }
        }

        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
        queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
        tryResume()

        return () => {
            cancelled = true
            if (pollTimer) clearTimeout(pollTimer)
        }
    }, [conversationId, workspaceId, queryClient, applySnapshot, isConnected, send])

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
        resumePopulatedRef.current = true
        setIsStreaming(true)
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
        isInterruptedRef.current = true
        activeStreamRef.current = false
        tokenQueueRef.current = ''
        send({ type: 'chat_cancel', conversation_id: conversationId })
    }, [conversationId, send, isConnected])

    const clearLastError = useCallback(() => setLastError(null), [])

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
    }
}
