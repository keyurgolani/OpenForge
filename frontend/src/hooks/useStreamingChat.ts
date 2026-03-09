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

export type TimelineEntry = TimelineThinking | TimelineToolCall

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

interface SendMessageOptions {
    provider_id?: string
    model_id?: string
    attachment_ids?: string[]
}

export function useStreamingChat(conversationId: string | null) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const { on, send, isConnected } = useWorkspaceWebSocket(workspaceId)
    const queryClient = useQueryClient()

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
                setStreamingContent(snapshot.content ?? '')
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
                setStreamingContent(prev => prev + m.data)
                // Mark the last thinking entry as done when response text starts
                setTimeline(prev => {
                    const last = prev[prev.length - 1]
                    if (last?.type === 'thinking' && !last.done) {
                        const updated = [...prev.slice(0, -1), { ...last, done: true }]
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
                        // Extend the latest thinking entry
                        const updated = [...prev.slice(0, -1), { type: 'thinking' as const, content: last.content + chunk }]
                        timelineRef.current = updated
                        return updated
                    }
                    const updated = [...prev, { type: 'thinking' as const, content: chunk }]
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
        const sent = send({ type: 'chat_message', conversation_id: targetConversationId, content, ...(options || {}) })
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
