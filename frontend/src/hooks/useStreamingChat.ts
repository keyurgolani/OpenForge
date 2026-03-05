import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspaceWebSocket } from './useWorkspaceWebSocket'
import { createConversation } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

interface Source {
    note_id: string
    title: string
    snippet: string
    score: number
}

export function useStreamingChat(conversationId: string | null) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const { on, send, isConnected } = useWorkspaceWebSocket(workspaceId)
    const queryClient = useQueryClient()

    const [streamingContent, setStreamingContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [sources, setSources] = useState<Source[]>([])

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
                if (m.conversation_id === conversationId) {
                    setIsStreaming(false)
                    setStreamingContent('')
                }
            }),
        ]
        return () => unsubs.forEach(u => u())
    }, [conversationId, on, queryClient, workspaceId])

    const sendMessage = useCallback((content: string, modelOverride?: { provider_id?: string; model_id?: string }) => {
        if (!conversationId || !content.trim()) return
        setIsStreaming(true)
        setStreamingContent('')
        setSources([])
        send({ type: 'chat_message', conversation_id: conversationId, content, ...modelOverride })
    }, [conversationId, send])

    return { streamingContent, isStreaming, sources, sendMessage, isConnected }
}
