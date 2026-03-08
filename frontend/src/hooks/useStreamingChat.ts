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

interface StreamSnapshot {
    content?: string
    thinking?: string
    attachments_processed?: AttachmentProcessed[]
    sources?: Source[]
}

interface AttachmentProcessed {
    id: string
    filename: string
    status: string
    pipeline: string
    details?: string
}

interface SendMessageOptions {
    provider_id?: string
    model_id?: string
    attachment_ids?: string[]
}

export interface ToolCallDisplay {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status: 'executing' | 'success' | 'error';
    result?: string;
    error?: string;
    durationMs?: number;
    timestamp?: string;
}

export interface HITLRequestState {
    id: string;
    toolName: string;
    arguments: Record<string, unknown>;
    riskLevel?: string;
    actionSummary?: string;
}

export function useStreamingChat(conversationId: string | null) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const { on, send, isConnected } = useWorkspaceWebSocket(workspaceId)
    const queryClient = useQueryClient()

    const [streamingContent, setStreamingContent] = useState('')
    const [streamingThinking, setStreamingThinking] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [attachmentsProcessed, setAttachmentsProcessed] = useState<AttachmentProcessed[]>([])
    const [sources, setSources] = useState<Source[]>([])
    const [lastError, setLastError] = useState<string | null>(null)
    const [thinkingByMessageId, setThinkingByMessageId] = useState<Record<string, string>>({})
    const streamingThinkingRef = useRef('')

    // Tool call and HITL state
    const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([])
    const [hitlRequest, setHitlRequest] = useState<HITLRequestState | null>(null)

    useEffect(() => {
        setIsStreaming(false)
        setStreamingContent('')
        setStreamingThinking('')
        setAttachmentsProcessed([])
        setSources([])
        setLastError(null)
        setToolCalls([])
        setHitlRequest(null)
    }, [conversationId])

    useEffect(() => {
        if (!conversationId) return

        const unsubs = [
            on('chat_stream_snapshot', (msg) => {
                const m = msg as { conversation_id: string; data?: StreamSnapshot }
                if (m.conversation_id !== conversationId) return
                const snapshot = m.data ?? {}
                const resumedContent = snapshot.content ?? ''
                const resumedThinking = snapshot.thinking ?? ''
                const resumedAttachments = Array.isArray(snapshot.attachments_processed) ? snapshot.attachments_processed : []
                const resumedSources = Array.isArray(snapshot.sources) ? snapshot.sources : []

                setStreamingContent(resumedContent)
                setStreamingThinking(resumedThinking)
                streamingThinkingRef.current = resumedThinking
                setAttachmentsProcessed(resumedAttachments)
                setSources(resumedSources)
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
                if (m.conversation_id === conversationId) {
                    setStreamingContent(prev => prev + m.data)
                }
            }),
            on('chat_thinking', (msg) => {
                const m = msg as { conversation_id: string; data: string }
                if (m.conversation_id === conversationId) {
                    setStreamingThinking(prev => {
                        const next = prev + m.data
                        streamingThinkingRef.current = next
                        return next
                    })
                }
            }),
            on('chat_done', (msg) => {
                const m = msg as { conversation_id: string; message_id: string }
                if (m.conversation_id === conversationId) {
                    const finalThinking = streamingThinkingRef.current.trim()
                    if (finalThinking && m.message_id) {
                        setThinkingByMessageId(prev => ({ ...prev, [m.message_id]: finalThinking }))
                    }
                    setIsStreaming(false)
                    setStreamingContent('')
                    setStreamingThinking('')
                    streamingThinkingRef.current = ''
                    setAttachmentsProcessed([])
                    setLastError(null)
                    setToolCalls([])
                    setHitlRequest(null)
                    // Refetch messages to get the persisted version
                    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
                    queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
                }
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
                    setIsStreaming(false)
                    setStreamingContent('')
                    setStreamingThinking('')
                    streamingThinkingRef.current = ''
                    setAttachmentsProcessed([])
                    setLastError(m.detail || 'Chat request failed')
                    setToolCalls([])
                    setHitlRequest(null)
                    // Ensure the persisted user message appears even when generation fails.
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
            on('agent_tool_call', (msg: any) => {
                if (msg.conversation_id !== conversationId) return
                setToolCalls(prev => [...prev, {
                    id: msg.data?.tool_call_id || msg.tool_call_id || String(Date.now()),
                    name: msg.data?.tool_name || msg.tool_name || 'unknown',
                    arguments: msg.data?.arguments || msg.arguments || {},
                    status: 'executing',
                    timestamp: msg.data?.timestamp || msg.timestamp,
                }])
            }),
            on('agent_tool_result', (msg: any) => {
                if (msg.conversation_id !== conversationId) return
                const tcId = msg.data?.tool_call_id || msg.tool_call_id
                setToolCalls(prev => prev.map(tc =>
                    tc.id === tcId
                        ? {
                            ...tc,
                            status: (msg.data?.success || msg.success) ? 'success' : 'error',
                            result: msg.data?.result || msg.result,
                            error: msg.data?.error || msg.error,
                            durationMs: msg.data?.duration_ms || msg.duration_ms,
                        }
                        : tc
                ))
            }),
            on('hitl_request', (msg: any) => {
                setHitlRequest({
                    id: msg.hitl_id || msg.data?.hitl_id,
                    toolName: msg.tool_name || msg.data?.tool_name || 'unknown',
                    arguments: msg.arguments || msg.data?.arguments || {},
                    riskLevel: msg.risk_level || msg.data?.risk_level,
                    actionSummary: msg.action_summary || msg.data?.action_summary,
                })
            }),
            on('hitl_resolved', (_msg: any) => {
                setHitlRequest(null)
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
        setIsStreaming(true)
        setStreamingContent('')
        setStreamingThinking('')
        streamingThinkingRef.current = ''
        setAttachmentsProcessed([])
        setSources([])
        setLastError(null)
        setToolCalls([])
        setHitlRequest(null)
        const sent = send({ type: 'chat_message', conversation_id: targetConversationId, content, ...(options || {}) })
        if (!sent) {
            setIsStreaming(false)
            setLastError('Failed to send message. Reconnecting to chat server...')
        }
        return sent
    }, [conversationId, send, isConnected])

    const clearLastError = useCallback(() => setLastError(null), [])

    return {
        streamingContent,
        streamingThinking,
        isStreaming,
        attachmentsProcessed,
        sources,
        sendMessage,
        isConnected,
        lastError,
        clearLastError,
        thinkingByMessageId,
        toolCalls,
        hitlRequest,
        setHitlRequest,
    }
}
