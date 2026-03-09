import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspaceWebSocket } from './useWorkspaceWebSocket'
import { useQueryClient } from '@tanstack/react-query'

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

export interface TimelineSubagentInvocation {
    type: 'subagent_invocation'
    call_id: string
    tool_name: string
    arguments: Record<string, unknown>
    success: boolean
    subagent_response: string
    subagent_timeline: unknown[]
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

export type TimelineEntry = TimelineThinking | TimelineToolCall | TimelineSubagentInvocation | TimelineHITLRequest

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
        resetStreamState()
    }, [conversationId])

    useEffect(() => {
        if (!conversationId) return

        const unsubs = [
            on('chat_stream_snapshot', (msg) => {
                const m = msg as { conversation_id: string; data?: StreamSnapshot }
                if (m.conversation_id !== conversationId) return
                const snapshot = m.data ?? {}
                // Reconstruct timeline from snapshot (legacy format)
                const reconstructed: TimelineEntry[] = []
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
                setTimeline(reconstructed)
                timelineRef.current = reconstructed
                // Bypass jitter buffer for snapshot — we have the full content already
                const content = snapshot.content ?? ''
                tokenQueueRef.current = ''
                displayedContentRef.current = content
                setStreamingContent(content)
                setAttachmentsProcessed(Array.isArray(snapshot.attachments_processed) ? snapshot.attachments_processed : [])
                setSources(Array.isArray(snapshot.sources) ? snapshot.sources : [])
                setIsStreaming(true)
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
                    const updated = [...prev, m.data]
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

    useEffect(() => {
        if (!conversationId || !isConnected) return
        send({ type: 'chat_stream_resume', conversation_id: conversationId })
    }, [conversationId, isConnected, send])

    const sendMessage = useCallback((content: string, options?: SendMessageOptions, conversationOverride?: string) => {
        const targetConversationId = conversationOverride ?? conversationId
        if (!targetConversationId || !content.trim()) return false
        if (!isConnected) {
            setLastError('Chat is disconnected. Reconnect and try again.')
            return false
        }
        resetStreamState(false)
        setIsStreaming(true)
        setSources([])
        const payload: Record<string, unknown> = { type: 'chat_message', conversation_id: targetConversationId, content }
        if (options?.provider_id) payload.provider_id = options.provider_id
        if (options?.model_id) payload.model_id = options.model_id
        if (options?.attachment_ids?.length) payload.attachment_ids = options.attachment_ids
        if (options?.mentions?.length) payload.mentions = options.mentions
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
