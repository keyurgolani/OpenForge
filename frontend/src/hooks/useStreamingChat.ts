import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspaceWebSocket } from './useWorkspaceWebSocket'
import { useQueryClient } from '@tanstack/react-query'

interface Source {
    note_id: string
    title: string
    snippet: string
    score: number
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
    const [sources, setSources] = useState<Source[]>([])
    const [lastError, setLastError] = useState<string | null>(null)

    useEffect(() => {
        setIsStreaming(false)
        setStreamingContent('')
        setSources([])
        setLastError(null)
    }, [conversationId])

    useEffect(() => {
        if (!conversationId) return

        const unsubs = [
            on('chat_token', (msg) => {
                const m = msg as { conversation_id: string; data: string }
                if (m.conversation_id === conversationId) {
                    setStreamingContent(prev => prev + m.data)
                }
            }),
            on('chat_done', (msg) => {
                const m = msg as { conversation_id: string; message_id: string }
                if (m.conversation_id === conversationId) {
                    setIsStreaming(false)
                    setStreamingContent('')
                    setLastError(null)
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
                    setLastError(m.detail || 'Chat request failed')
                    // Ensure the persisted user message appears even when generation fails.
                    if (conversationId) {
                        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
                    }
                    queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] })
                }
            }),
        ]
        return () => unsubs.forEach(u => u())
    }, [conversationId, on, queryClient, workspaceId])

    const sendMessage = useCallback((content: string, options?: SendMessageOptions, conversationOverride?: string) => {
        const targetConversationId = conversationOverride ?? conversationId
        if (!targetConversationId || !content.trim()) return false
        if (!isConnected) {
            setLastError('Chat is disconnected. Reconnect and try again.')
            return false
        }
        setIsStreaming(true)
        setStreamingContent('')
        setSources([])
        setLastError(null)
        const sent = send({ type: 'chat_message', conversation_id: targetConversationId, content, ...(options || {}) })
        if (!sent) {
            setIsStreaming(false)
            setLastError('Failed to send message. Reconnecting to chat server...')
        }
        return sent
    }, [conversationId, send, isConnected])

    const clearLastError = useCallback(() => setLastError(null), [])

    return { streamingContent, isStreaming, sources, sendMessage, isConnected, lastError, clearLastError }
}
