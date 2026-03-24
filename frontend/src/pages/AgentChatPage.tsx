import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
    listConversations,
    createConversation,
    getConversation,
    deleteConversation,
    permanentlyDeleteConversation,
    updateConversation,
    listProviders,
    listSettings,
    getWorkspace,
    listWorkspaces,
    resolveKnowledgeIds,
    exportConversation,
    bulkTrashConversations,
    bulkRestoreConversations,
    bulkPermanentlyDeleteConversations,
} from '@/lib/api'
import { useStreamingChat, type Mention } from '@/hooks/useStreamingChat'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useChatApi } from '@/hooks/useChatApi'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Plus, Loader2, MessageSquare, Trash2, Bot,
    ChevronDown, ChevronRight, Check, Pencil,
    X, Copy, Search,
    RotateCcw, Trash, Download,
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator
} from '@/components/ui/context-menu'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import { chatRoute } from '@/lib/routes'
import { renderAgentMessageContent, type MentionResolutionMaps } from '@/lib/agent-content'
import Siderail from '@/components/shared/Siderail'
import { AgentChatView } from '@/components/chat/AgentChatView'

function buildActiveThreadPreview(messages: Message[]): string | null {
    const latestMessage = [...messages].reverse().find((message) => message.content?.trim())
    if (!latestMessage?.content) return null

    const normalized = latestMessage.content.replace(/\s+/g, ' ').trim()
    if (!normalized) return null

    return normalized.length > 83 ? `${normalized.slice(0, 83)}…` : normalized
}

function formatThreadRelativeTime(value: string | null): string | null {
    if (!value) return null

    try {
        return formatDistanceToNow(new Date(value), { addSuffix: true })
    } catch {
        return null
    }
}

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    thinking?: string | null
    model_used?: string | null
    provider_used?: string | null
    generation_ms?: number | null
    context_sources?: { knowledge_id: string; title: string; snippet: string; score: number }[]
    attachments_processed?: AttachmentProcessed[]
    tool_calls?: { call_id: string; tool_name: string; arguments: Record<string, unknown> }[] | null
    timeline?: unknown[] | null
    is_interrupted?: boolean
    provider_metadata?: { optimize?: boolean; [key: string]: unknown } | null
    created_at: string
}

interface AttachmentProcessed {
    id: string
    filename: string
    status: string
    pipeline: string
    details?: string
    source_url?: string | null
    extracted_text?: string | null
}

interface Conversation {
    id: string
    title: string | null
    title_locked?: boolean
    is_archived?: boolean
    is_delegated?: boolean
    archived_at?: string | null
    message_count: number
    last_message_at: string | null
}

interface ProviderRecord {
    id: string
    display_name: string
    provider_name: string
    default_model: string | null
    enabled_models?: { id?: string; name?: string }[]
    is_system_default?: boolean
}

interface ModelOption {
    key: string
    providerId: string
    modelId: string
    providerLabel: string
    modelLabel: string
    label: string
    searchText: string
}

interface ConversationWithMessages extends Conversation {
    messages: Message[]
}

export default function AgentChatPage() {
    const { workspaceId, conversationId } = useParams<{ workspaceId: string; conversationId?: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const { success: showSuccess, error: showError } = useToast()
    const chatApi = useChatApi(workspaceId || null)
    const [inputText, setInputText] = useState('')
    const [activeCid, setActiveCid] = useState(conversationId ?? null)
    const mentionEditorRef = useRef<MentionEditorHandle>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [activeChatRailSection, setActiveChatRailSection] = useState<'conversations' | 'delegated' | 'trash' | null>('conversations')
    const shouldRestoreTextareaFocusRef = useRef(false)
    const suppressAutoSelectRef = useRef(false)

    // Per-message model override
    const [selectedModelKey, setSelectedModelKey] = useState('')
    const [modelPickerOpen, setModelPickerOpen] = useState(false)
    const [modelPickerQuery, setModelPickerQuery] = useState('')
    const modelPickerRef = useRef<HTMLDivElement>(null)
    const modelPickerSearchRef = useRef<HTMLInputElement>(null)
    const lastToastedErrorRef = useRef<string | null>(null)

    // File attachments
    const [attachments, setAttachments] = useState<File[]>([])
    const [uploadingFiles, setUploadingFiles] = useState(false)

    // WS message forwarder ref — populated by AgentChatView's onReady callback
    const agentViewHandleMessageRef = useRef<((msg: { type: string; data?: unknown; conversation_id?: string }) => void) | null>(null)

    const { data: workspace } = useQuery({
        queryKey: ['workspace', workspaceId],
        queryFn: () => getWorkspace(workspaceId),
        enabled: !!workspaceId,
    })

    const { data: allWorkspaces = [] } = useQuery({
        queryKey: ['workspaces'],
        queryFn: listWorkspaces,
        staleTime: 60_000,
    })

    const { data: conversations = [] } = useQuery({
        queryKey: [...chatApi.queryKeyPrefix],
        queryFn: () => chatApi.listConversations({ category: 'chats' }),
    })
    const { data: delegatedConversationsData = [] } = useQuery({
        queryKey: [...chatApi.queryKeyPrefix, 'delegated'],
        queryFn: () => chatApi.listConversations({ category: 'delegated' }),
    })
    const { data: trashedConversationsData = [] } = useQuery({
        queryKey: [...chatApi.queryKeyPrefix, 'trash'],
        queryFn: () => chatApi.listConversations({ category: 'trash' }),
    })
    const conversationsWithArchived = useMemo(
        () => [...(conversations as Conversation[]), ...(delegatedConversationsData as Conversation[]), ...(trashedConversationsData as Conversation[])],
        [conversations, delegatedConversationsData, trashedConversationsData]
    )

    const { data: conversationData } = useQuery({
        queryKey: ['conversation', activeCid],
        queryFn: () => chatApi.getConversation(activeCid!),
        enabled: !!activeCid,
    })

    const { data: providers = [] } = useQuery({
        queryKey: ['providers'],
        queryFn: listProviders,
    })
    const { data: appSettings = [] } = useQuery<{ key: string; value: unknown }[]>({
        queryKey: ['settings'],
        queryFn: listSettings,
    })

    const {
        isStreaming,
        isInterrupted,
        sendMessage,
        cancelStream,
        isConnected,
        lastError,
        clearLastError,
    } = useStreamingChat(activeCid, workspaceId || null)

    // Forward raw WS messages to AgentChatView's ingestion layer
    const { on: onWs } = useWorkspaceWebSocket(workspaceId ?? '', 'agent')
    useEffect(() => {
        if (!activeCid || !workspaceId) return
        const unsub = onWs('*', (msg) => {
            const m = msg as { type?: string; data?: unknown; conversation_id?: string }
            if (!m.type) return
            // Only forward messages for the active conversation
            if (m.conversation_id && m.conversation_id !== activeCid) return
            agentViewHandleMessageRef.current?.(m as { type: string; data?: unknown; conversation_id?: string })
        })
        return unsub
    }, [activeCid, onWs, workspaceId])

    const messages = useMemo<Message[]>(
        () => conversationData?.messages ?? [],
        [conversationData],
    )
    const activeConversations = conversations as Conversation[]
    const delegatedConversations = delegatedConversationsData as Conversation[]
    const trashedConversations = trashedConversationsData as Conversation[]
    const [resolvedKnowledgeTitles, setResolvedKnowledgeTitles] = useState<Map<string, { title: string; knowledgeType: string; workspaceId?: string; workspaceName?: string }>>(new Map())
    const fetchingKnowledgeIds = useRef<Set<string>>(new Set())

    const mentionMaps = useMemo<MentionResolutionMaps>(() => {
        const workspacesById = new Map<string, string>()
        const workspacesByName = new Map<string, string>()
        for (const ws of allWorkspaces as Array<{ id: string; name: string }>) {
            workspacesById.set(ws.id, ws.name)
            workspacesByName.set(ws.name.toLowerCase(), ws.id)
        }
        const chatsById = new Map<string, string>()
        const chatsByName = new Map<string, string>()
        for (const conv of conversationsWithArchived as Conversation[]) {
            if (conv.title) {
                chatsById.set(conv.id, conv.title)
                chatsByName.set(conv.title.toLowerCase(), conv.id)
            }
        }
        const knowledgeById = new Map<string, string>()
        const knowledgeTypeById = new Map<string, string>()
        const knowledgeWorkspaceById = new Map<string, { workspaceId: string; workspaceName: string }>()
        for (const msg of messages) {
            for (const src of msg.context_sources ?? []) {
                if (src.knowledge_id && src.title) {
                    knowledgeById.set(src.knowledge_id.toLowerCase(), src.title)
                }
            }
        }
        for (const [id, { title, knowledgeType, workspaceId: wsId, workspaceName: wsName }] of resolvedKnowledgeTitles) {
            knowledgeById.set(id, title)
            if (knowledgeType) knowledgeTypeById.set(id, knowledgeType)
            if (wsId) knowledgeWorkspaceById.set(id, { workspaceId: wsId, workspaceName: wsName || '' })
        }
        return { workspacesById, chatsById, knowledgeById, knowledgeTypeById, knowledgeWorkspaceById, workspacesByName, chatsByName }
    }, [allWorkspaces, conversationsWithArchived, messages, resolvedKnowledgeTitles])

    // Async-resolve titles for bare UUIDs in message content that aren't already known
    const UUID_RE_GLOBAL = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
    useEffect(() => {
        if (!workspaceId || messages.length === 0) return
        const candidates = new Set<string>()
        for (const msg of messages) {
            const matches = msg.content.matchAll(UUID_RE_GLOBAL)
            for (const [uuid] of matches) {
                const lc = uuid.toLowerCase()
                if (
                    !mentionMaps.workspacesById.has(lc) &&
                    !mentionMaps.chatsById.has(lc) &&
                    !mentionMaps.knowledgeById.has(lc) &&
                    !fetchingKnowledgeIds.current.has(lc)
                ) {
                    candidates.add(lc)
                }
            }
        }
        if (candidates.size === 0) return
        for (const id of candidates) fetchingKnowledgeIds.current.add(id)
        resolveKnowledgeIds([...candidates]).then((results: { id: string; title: string | null; type: string | null; workspace_id: string | null; workspace_name: string | null }[]) => {
            const updates = new Map<string, { title: string; knowledgeType: string; workspaceId?: string; workspaceName?: string }>()
            for (const r of results) {
                if (r.title) {
                    updates.set(r.id.toLowerCase(), {
                        title: r.title,
                        knowledgeType: r.type || '',
                        workspaceId: r.workspace_id || undefined,
                        workspaceName: r.workspace_name || undefined,
                    })
                }
            }
            if (updates.size > 0) {
                setResolvedKnowledgeTitles(prev => {
                    const next = new Map(prev)
                    for (const [k, v] of updates) next.set(k, v)
                    return next
                })
            }
        }).catch(() => { /* silently ignore resolve failures */ })
    }, [messages, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

    const activeConversationRecord = useMemo(
        () => (conversationsWithArchived as Conversation[]).find(conv => conv.id === activeCid) ?? null,
        [conversationsWithArchived, activeCid]
    )
    const mostRecentConversationId = useMemo(() => {
        const list = activeConversations
        if (list.length === 0) return null

        const parseTimestamp = (value: string | null) => {
            if (!value) return Number.NEGATIVE_INFINITY
            const parsed = Date.parse(value)
            return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
        }

        let best = list[0]
        let bestTs = parseTimestamp(list[0]?.last_message_at ?? null)

        for (const conv of list.slice(1)) {
            const ts = parseTimestamp(conv.last_message_at ?? null)
            if (ts > bestTs) {
                best = conv
                bestTs = ts
            }
        }

        return best?.id ?? null
    }, [activeConversations])

    // Build model options from system_chat_models setting (primary) and provider records (fallback)
    const modelOptions = useMemo(() => {
        const options: ModelOption[] = []
        const seen = new Set<string>()
        const providerMap = new Map<string, ProviderRecord>()
        for (const p of providers as ProviderRecord[]) providerMap.set(p.id, p)

        // Primary source: system_chat_models setting
        const chatModelsSetting = appSettings.find(s => s.key === 'system_chat_models')
        const chatModels = Array.isArray(chatModelsSetting?.value) ? chatModelsSetting.value as { provider_id: string; model_id: string; model_name: string; is_default?: boolean }[] : []

        for (const entry of chatModels) {
            const pid = entry.provider_id
            const modelId = (entry.model_id ?? '').trim()
            if (!modelId || !pid) continue

            const dedupeKey = `${pid}:${modelId}`
            if (seen.has(dedupeKey)) continue
            seen.add(dedupeKey)

            const provider = providerMap.get(pid)
            const providerLabel = provider ? (sanitizeProviderDisplayName(provider.display_name) || provider.provider_name) : pid.slice(0, 8)
            const modelName = (entry.model_name ?? modelId).trim()
            const providerName = provider?.provider_name ?? ''

            options.push({
                key: dedupeKey,
                providerId: pid,
                modelId,
                providerLabel,
                modelLabel: modelName,
                label: `${providerLabel} · ${modelName}`,
                searchText: `${providerLabel} ${providerName} ${modelName} ${modelId}`.toLowerCase(),
            })
        }

        // Fallback: provider.enabled_models / default_model for providers not covered above
        for (const provider of providers as ProviderRecord[]) {
            const enabled = provider.enabled_models ?? []
            const candidateModels = enabled.length > 0
                ? enabled
                : (provider.default_model ? [{ id: provider.default_model, name: provider.default_model }] : [])
            const providerLabel = sanitizeProviderDisplayName(provider.display_name) || provider.provider_name

            for (const model of candidateModels) {
                const modelId = (model.id ?? '').trim()
                if (!modelId) continue

                const dedupeKey = `${provider.id}:${modelId}`
                if (seen.has(dedupeKey)) continue
                seen.add(dedupeKey)

                const modelName = (model.name ?? modelId).trim()
                options.push({
                    key: dedupeKey,
                    providerId: provider.id,
                    modelId,
                    providerLabel,
                    modelLabel: modelName,
                    label: `${providerLabel} · ${modelName}`,
                    searchText: `${providerLabel} ${provider.provider_name} ${modelName} ${modelId}`.toLowerCase(),
                })
            }
        }

        return options.sort((a, b) => a.label.localeCompare(b.label))
    }, [providers, appSettings])

    const selectedOption = modelOptions.find(o => o.key === selectedModelKey)
    const filteredModelOptions = useMemo(() => {
        const q = modelPickerQuery.trim().toLowerCase()
        if (!q) return modelOptions
        return modelOptions.filter(opt => opt.searchText.includes(q))
    }, [modelOptions, modelPickerQuery])

    // Determine the default model label
    const defaultLabel = useMemo(() => {
        if (!workspace) return 'Default model'

        const chatModelsSetting = appSettings.find(s => s.key === 'system_chat_models')
        const chatModels = Array.isArray(chatModelsSetting?.value) ? chatModelsSetting.value as { provider_id: string; model_id: string; model_name: string; is_default?: boolean }[] : []
        const systemDefault = chatModels.find(m => m.is_default) ?? chatModels[0]

        if (workspace.llm_provider_id) {
            const dp = (providers as ProviderRecord[]).find(p => p.id === workspace.llm_provider_id)
            if (dp) {
                const modelName = workspace.llm_model || dp.default_model || systemDefault?.model_name || 'provider default'
                return `${sanitizeProviderDisplayName(dp.display_name) || dp.provider_name} · ${modelName}`
            }
        }
        const sys = (providers as ProviderRecord[]).find(p => p.is_system_default)
        if (sys) {
            const sysModelName = sys.default_model || chatModels.find(m => m.provider_id === sys.id)?.model_name || 'provider default'
            return `${sanitizeProviderDisplayName(sys.display_name) || sys.provider_name} · ${sysModelName}`
        }
        if (systemDefault) {
            const dp = (providers as ProviderRecord[]).find(p => p.id === systemDefault.provider_id)
            const provLabel = dp ? (sanitizeProviderDisplayName(dp.display_name) || dp.provider_name) : ''
            return `${provLabel} · ${systemDefault.model_name}`
        }
        return 'Default model'
    }, [workspace, providers, appSettings])

    useEffect(() => {
        if (conversationId !== activeCid) {
            if (conversationId) {
                suppressAutoSelectRef.current = false
            }
            shouldRestoreTextareaFocusRef.current = true
            setActiveCid(conversationId ?? null)
        }
    }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (conversationId) return
        if (suppressAutoSelectRef.current) return
        if (!workspaceId) return
        if (!mostRecentConversationId) return
        if (activeCid === mostRecentConversationId) return
        shouldRestoreTextareaFocusRef.current = true
        setActiveCid(mostRecentConversationId)
        navigate(chatApi.routeFor(mostRecentConversationId), { replace: true })
    }, [activeCid, conversationId, mostRecentConversationId, navigate, workspaceId])

    useEffect(() => {
        if (!modelPickerOpen) {
            setModelPickerQuery('')
            return
        }
        modelPickerSearchRef.current?.focus()
        const handleOutsideClick = (event: MouseEvent) => {
            if (!modelPickerRef.current) return
            if (!modelPickerRef.current.contains(event.target as Node)) {
                setModelPickerOpen(false)
            }
        }
        document.addEventListener('mousedown', handleOutsideClick)
        return () => document.removeEventListener('mousedown', handleOutsideClick)
    }, [modelPickerOpen])

    useEffect(() => {
        if (!lastError) {
            lastToastedErrorRef.current = null
            return
        }
        if (lastToastedErrorRef.current === lastError) return
        lastToastedErrorRef.current = lastError
        showError('Chat request failed', lastError)
    }, [lastError, showError])

    const pushOptimisticUserMessage = (cid: string, content: string) => {
        const createdAt = new Date().toISOString()
        const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        qc.setQueryData(['conversation', cid], (prev: ConversationWithMessages | undefined) => {
            if (!prev) {
                return {
                    id: cid,
                    title: null,
                    message_count: 1,
                    last_message_at: createdAt,
                    messages: [{ id: optimisticId, role: 'user', content, created_at: createdAt } as Message],
                } as ConversationWithMessages
            }
            const nextMessages = [
                ...(prev.messages ?? []),
                { id: optimisticId, role: 'user', content, created_at: createdAt } as Message,
            ]
            return {
                ...prev,
                messages: nextMessages,
                message_count: typeof prev.message_count === 'number' ? prev.message_count + 1 : nextMessages.length,
                last_message_at: createdAt,
            }
        })

        qc.setQueryData([...chatApi.queryKeyPrefix], (prev: Conversation[] | undefined) => {
            if (!prev) return prev
            const withUpdate = prev.map(conv => (
                conv.id === cid
                    ? {
                        ...conv,
                        message_count: (conv.message_count ?? 0) + 1,
                        last_message_at: createdAt,
                    }
                    : conv
            ))
            return withUpdate.sort((a, b) => {
                const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
                const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
                return bTime - aTime
            })
        })
    }

    const handleNewChat = async () => {
        const conv = await chatApi.createConversation()
        suppressAutoSelectRef.current = false
        setActiveChatRailSection('conversations')
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix] })
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'delegated'] }); qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'trash'] })
        setActiveCid(conv.id)
        navigate(chatApi.routeFor(conv.id))
    }

    const handleDeleteConv = async (cid: string) => {
        await chatApi.deleteConversation(cid)
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix] })
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'delegated'] }); qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'trash'] })
        if (activeCid === cid) {
            suppressAutoSelectRef.current = true
            setActiveCid(null)
            navigate(chatApi.routeBase)
        }
    }

    const handleRestoreConv = async (cid: string) => {
        try {
            await chatApi.updateConversation(cid, { is_archived: false })
            qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix] })
            qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'delegated'] }); qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'trash'] })
            qc.invalidateQueries({ queryKey: ['conversation', cid] })
            if (activeCid === cid) {
                setActiveChatRailSection('conversations')
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Unable to restore conversation.'
            showError('Restore failed', detail)
        }
    }

    const handlePermanentlyDeleteConv = async (cid: string) => {
        try {
            await chatApi.permanentlyDeleteConversation(cid)
            qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix] })
            qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'delegated'] }); qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'trash'] })
            qc.removeQueries({ queryKey: ['conversation', cid], exact: true })
            if (activeCid === cid) {
                suppressAutoSelectRef.current = true
                setActiveCid(null)
                navigate(chatApi.routeBase)
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Unable to permanently delete conversation.'
            showError('Permanent delete failed', detail)
        }
    }

    const invalidateAllConvQueries = () => {
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix] })
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'delegated'] })
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'trash'] })
    }

    const handleBulkTrash = async (category: 'chats' | 'delegated') => {
        await chatApi.bulkTrashConversations(category)
        invalidateAllConvQueries()
        if (activeCid) {
            const affected = category === 'delegated' ? delegatedConversations : activeConversations
            if (affected.some(c => c.id === activeCid)) {
                suppressAutoSelectRef.current = true
                setActiveCid(null)
                navigate(chatApi.routeBase)
            }
        }
    }

    const handleBulkRestore = async () => {
        await chatApi.bulkRestoreConversations()
        invalidateAllConvQueries()
    }

    const handleBulkPermanentDelete = async () => {
        try {
            await chatApi.bulkPermanentlyDeleteConversations()
            invalidateAllConvQueries()
            if (activeCid && trashedConversations.some(c => c.id === activeCid)) {
                suppressAutoSelectRef.current = true
                setActiveCid(null)
                navigate(chatApi.routeBase)
            }
        } catch (err: any) {
            showError('Bulk delete failed', err?.response?.data?.detail || err?.message || 'Unable to delete.')
        }
    }

    const handleDownloadConv = async (cid: string, format: 'json' | 'markdown' | 'txt' = 'json') => {
        try {
            const blob = await chatApi.exportConversation(cid, format)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const conv = [...(conversations as Conversation[]), ...(conversationsWithArchived as Conversation[])].find(c => c.id === cid)
            const ext = format === 'markdown' ? 'md' : format === 'txt' ? 'txt' : 'json'
            a.download = `${(conv?.title || 'chat').replace(/[^a-z0-9]/gi, '_')}.${ext}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Unable to download conversation.'
            showError('Download failed', detail)
        }
    }

    const handleCopyConv = async (cid: string) => {
        try {
            const blob = await chatApi.exportConversation(cid, 'txt')
            const text = await blob.text()
            await navigator.clipboard.writeText(text)
            showSuccess('Copied to clipboard')
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Unable to copy conversation.'
            showError('Copy failed', detail)
        }
    }

    const handleSelectConversation = (cid: string) => {
        setActiveChatRailSection('conversations')
        suppressAutoSelectRef.current = false
        setActiveCid(cid)
        navigate(chatApi.routeFor(cid))
    }

    const handleSelectTrashedConversation = (cid: string) => {
        setActiveChatRailSection('trash')
        suppressAutoSelectRef.current = false
        setActiveCid(cid)
        navigate(chatApi.routeFor(cid))
    }

    // ── Send message handler: wraps useStreamingChat.sendMessage with file uploads, mentions, model overrides ──
    const handleSendMessage = useCallback(async (content: string) => {
        if (!content.trim() || (isStreaming && !isInterrupted) || uploadingFiles) return
        if (conversationData?.is_archived || activeConversationRecord?.is_archived) {
            showError('Chat is archived', 'Restore this chat from Trash to continue messaging.')
            return
        }
        const msg = content.trim()
        clearLastError()

        // Upload attachments if any
        let attachmentIds: string[] = []
        if (attachments.length > 0) {
            setUploadingFiles(true)
            try {
                const uploadPromises = attachments.map(async (file) => {
                    const formData = new FormData()
                    formData.append('file', file)
                    const res = await fetch(`/api/v1/attachments/upload`, {
                        method: 'POST',
                        body: formData,
                    })
                    if (!res.ok) throw new Error(`Failed to upload ${file.name}`)
                    return res.json()
                })
                const results = await Promise.all(uploadPromises)
                attachmentIds = results.map((r: any) => r.id)
            } catch (e) {
                console.error('Failed to upload attachments:', e)
                showError('Attachment upload failed', 'Please retry or remove the problematic file.')
                return
            } finally {
                setUploadingFiles(false)
            }
        }

        let targetCid = activeCid
        if (!targetCid) {
            const conv = await chatApi.createConversation()
            targetCid = conv.id
            suppressAutoSelectRef.current = false
            setActiveChatRailSection('conversations')
            qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix] })
            qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'delegated'] }); qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'trash'] })
            setActiveCid(conv.id)
            navigate(chatApi.routeFor(conv.id))
        }

        const override: { provider_id?: string; model_id?: string; attachment_ids?: string[]; mentions?: Mention[]; optimize?: boolean } = {}
        if (selectedOption) {
            override.provider_id = selectedOption.providerId
            override.model_id = selectedOption.modelId
        }
        if (attachmentIds.length > 0) override.attachment_ids = attachmentIds

        const sent = sendMessage(msg, override, targetCid)
        if (!sent) {
            showError('Message not sent', 'Chat socket is disconnected. Wait for reconnect and try again.')
            return
        }

        pushOptimisticUserMessage(targetCid, msg)
        setInputText('')
        if (attachments.length > 0) setAttachments([])
    }, [activeCid, isStreaming, isInterrupted, uploadingFiles, conversationData, activeConversationRecord, attachments, selectedOption, sendMessage, workspaceId, clearLastError, showError, qc, navigate]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        const allowed = files.filter(f => {
            const type = f.type
            const ext = f.name.split('.').pop()?.toLowerCase() || ''
            return (
                type === 'application/pdf' ||
                type.startsWith('text/') ||
                type.startsWith('image/') ||
                type.startsWith('audio/') ||
                type === 'video/webm' ||
                type.startsWith('application/vnd.openxmlformats') ||
                type.startsWith('application/ms') ||
                ['pdf', 'txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'png', 'jpg', 'jpeg', 'gif', 'webp',
                 'mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm', 'weba',
                 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext)
            )
        })
        setAttachments(prev => [...prev, ...allowed].slice(0, 5))
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index))
    }

    const activeConversationIsArchived = Boolean(conversationData?.is_archived || activeConversationRecord?.is_archived)
    const activeThreadPreview = useMemo(
        () => buildActiveThreadPreview(messages),
        [messages],
    )
    const composerDisabled = (isStreaming && !isInterrupted) || uploadingFiles || activeConversationIsArchived
    const isConversationsSectionExpanded = activeChatRailSection === 'conversations'
    const isDelegatedSectionExpanded = activeChatRailSection === 'delegated'
    const isTrashSectionExpanded = activeChatRailSection === 'trash'
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
    const confirmBulkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const toggleChatRailSection = (section: 'conversations' | 'delegated' | 'trash') => {
        setActiveChatRailSection(prev => (prev === section ? null : section))
    }

    // Callbacks for AgentChatView
    const handleConversationUpdated = useCallback((conversation: { id: string; title?: string }) => {
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix] })
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'delegated'] })
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix, 'trash'] })
        if (conversation.id) {
            qc.invalidateQueries({ queryKey: ['conversation', conversation.id] })
        }
    }, [qc, workspaceId])

    const handleStreamComplete = useCallback((messageId: string) => {
        if (activeCid) {
            qc.invalidateQueries({ queryKey: ['conversation', activeCid] })
        }
        qc.invalidateQueries({ queryKey: [...chatApi.queryKeyPrefix] })
    }, [activeCid, qc, workspaceId])

    const handleRetry = useCallback(() => {
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
        if (lastUserMsg) {
            handleSendMessage(lastUserMsg.content)
        }
    }, [messages, handleSendMessage])

    const handleAgentViewReady = useCallback((handleMessage: (msg: { type: string; data?: unknown; conversation_id?: string }) => void) => {
        agentViewHandleMessageRef.current = handleMessage
    }, [])

    // Convert File[] attachments to the format AgentChatView expects
    const chatViewAttachments = useMemo(() =>
        attachments.map((file, i) => ({
            id: `file-${i}`,
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            size: file.size,
        })),
        [attachments]
    )

    return (
        <div className="flex h-full min-h-0 gap-3">
            {/* Conversation pane (flat main area) */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {!activeCid ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
                                <Bot className="w-8 h-8 text-accent/60" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Start a Conversation</h3>
                            <p className="text-muted-foreground text-sm mb-4">Ask questions about your knowledge or anything else.</p>
                            <button className="btn-primary" onClick={handleNewChat}>
                                <Plus className="w-4 h-4" /> New Chat
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col">
                        {/* Connection / error status bar */}
                        {(!isConnected || lastError) && (
                            <div className="px-4 py-1 flex-shrink-0">
                                {!isConnected && (
                                    <p className="mb-1 flex items-center gap-1.5 text-xs text-amber-300">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Reconnecting to server…
                                    </p>
                                )}
                                {lastError && (
                                    <div className="mb-1 flex items-start justify-between gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                                        <span className="leading-relaxed">{lastError}</span>
                                        <button
                                            type="button"
                                            className="mt-0.5 rounded p-0.5 text-red-100/80 hover:bg-red-500/20 hover:text-red-50"
                                            onClick={clearLastError}
                                            aria-label="Dismiss chat error"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* AgentChatView replaces the inline message thread + composer */}
                        <AgentChatView
                            conversationId={activeCid}
                            agent={{ id: workspaceId, name: workspace?.name ?? 'Agent' }}
                            messages={messages as any}
                            isLoadingMessages={!conversationData}
                            onSendMessage={handleSendMessage}
                            onCancelStream={cancelStream}
                            onApproveHITL={() => {}}
                            onDenyHITL={() => {}}
                            onRetry={handleRetry}
                            onConversationUpdated={handleConversationUpdated}
                            onStreamComplete={handleStreamComplete}
                            onAttach={(files) => {
                                setAttachments(prev => [...prev, ...files].slice(0, 5))
                            }}
                            onRemoveAttachment={(id) => {
                                const idx = parseInt(id.replace('file-', ''), 10)
                                if (!isNaN(idx)) removeAttachment(idx)
                            }}
                            attachments={chatViewAttachments}
                            composerDisabled={composerDisabled}
                            userInitial="U"
                            onReady={handleAgentViewReady}
                        />
                    </div>
                )}
            </div>

            {/* Conversation list rail */}
            <Siderail
                storageKey="openforge.shell.chat.list.pct"
                collapsedStorageKey="openforge.shell.chat.list.collapsed"
                icon={MessageSquare}
                label="Chats"
                itemCount={activeConversations.length}
                minPct={15}
                maxPct={40}
                defaultPct={25}
                breakpoint="always"
                collapsedExtra={
                    <button
                        type="button"
                        onClick={handleNewChat}
                        className="w-8 h-8 rounded-lg border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                        aria-label="Create new chat"
                        title="New chat"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                }
            >
                {(onCollapse) => (
                    <>
                        <div className="px-4">
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-accent" />
                                        <h3 className="font-semibold text-sm tracking-tight">Chat Threads</h3>
                                    </div>
                                    <p className="text-xs text-muted-foreground/90">Chats, delegated threads, and trash.</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="flex-shrink-0 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                        {activeConversations.length + delegatedConversations.length + trashedConversations.length}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onCollapse}
                                        className="w-7 h-7 rounded-md border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                                        aria-label="Collapse conversations sidebar"
                                        title="Collapse conversations"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-2">
                            {/* Conversations section */}
                            <section
                                className={`rounded-xl border px-2.5 py-2 transition-colors ${isConversationsSectionExpanded ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50' : 'flex-shrink-0 border-border/55 bg-card/22'}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleChatRailSection('conversations')}
                                    className="w-full flex items-center justify-between gap-3 py-0.5 text-left"
                                    aria-label={`${isConversationsSectionExpanded ? 'Collapse' : 'Expand'} Conversations`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isConversationsSectionExpanded ? 'rotate-90' : ''}`} />
                                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-accent bg-accent/10 border border-accent/20">
                                            <MessageSquare className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-foreground truncate">Conversations</div>
                                            <div className="text-xs text-muted-foreground/90 leading-5">
                                                {activeConversations.length} thread{activeConversations.length === 1 ? '' : 's'}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-semibold text-foreground/70 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                                        {activeConversations.length}
                                    </span>
                                </button>

                                {isConversationsSectionExpanded && (
                                    <div className="mt-2 min-h-0 flex-1 flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <button className="btn-primary flex-1 justify-center text-sm py-2" onClick={handleNewChat}>
                                                <Plus className="w-4 h-4" /> New Chat
                                            </button>
                                            {activeConversations.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleBulkTrash('chats')}
                                                    className="flex items-center gap-1 px-2 py-2 text-[11px] text-muted-foreground hover:text-red-400 rounded-lg border border-border/50 hover:border-red-500/30 transition-colors"
                                                    title="Trash all conversations"
                                                >
                                                    <Trash className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="mt-2 min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1">
                                            {activeConversations.length === 0 ? (
                                                <p className="text-xs text-muted-foreground text-center py-8 px-4">No conversations yet. Start a new chat!</p>
                                            ) : (
                                                activeConversations.map(c => (
                                                    <ConversationRow
                                                        key={c.id}
                                                        conv={c}
                                                        active={activeCid === c.id}
                                                        onSelect={() => handleSelectConversation(c.id)}
                                                        onDelete={() => handleDeleteConv(c.id)}
                                                        onDownload={(format) => handleDownloadConv(c.id, format)}
                                                        onCopy={() => handleCopyConv(c.id)}
                                                        onRename={(title) => chatApi.updateConversation(c.id, { title, title_locked: true }).then(() => invalidateAllConvQueries())}
                                                        activePreview={activeCid === c.id ? activeThreadPreview : null}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* Delegated section */}
                            <section
                                className={`rounded-xl border px-2.5 py-2 transition-colors ${isDelegatedSectionExpanded ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50' : 'flex-shrink-0 border-border/55 bg-card/22'}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleChatRailSection('delegated')}
                                    className="w-full flex items-center justify-between gap-3 py-0.5 text-left"
                                    aria-label={`${isDelegatedSectionExpanded ? 'Collapse' : 'Expand'} Delegated`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isDelegatedSectionExpanded ? 'rotate-90' : ''}`} />
                                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-violet-400 bg-violet-400/10 border border-violet-400/25">
                                            <Bot className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-foreground truncate">Delegated</div>
                                            <div className="text-xs text-muted-foreground/90 leading-5">
                                                {delegatedConversations.length} thread{delegatedConversations.length === 1 ? '' : 's'}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-semibold text-foreground/70 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                                        {delegatedConversations.length}
                                    </span>
                                </button>

                                {isDelegatedSectionExpanded && (
                                    <div className="mt-2 min-h-0 flex-1 flex flex-col">
                                        {delegatedConversations.length > 0 && (
                                            <div className="flex items-center justify-end mb-2">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleBulkTrash('delegated')}
                                                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-red-400 rounded-md border border-border/50 hover:border-red-500/30 transition-colors"
                                                    title="Trash all delegated threads"
                                                >
                                                    <Trash className="w-3 h-3" /> Trash All
                                                </button>
                                            </div>
                                        )}
                                        <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1">
                                            {delegatedConversations.length === 0 ? (
                                                <p className="text-xs text-muted-foreground text-center py-8 px-4">No delegated threads.</p>
                                            ) : (
                                                delegatedConversations.map(c => (
                                                    <ConversationRow
                                                        key={c.id}
                                                        conv={{ ...c, title: (c.title ?? '').replace(/^\[delegated\]\s*/i, '') || 'Delegated Task' }}
                                                        active={activeCid === c.id}
                                                        onSelect={() => handleSelectConversation(c.id)}
                                                        onDelete={() => handleDeleteConv(c.id)}
                                                        onDownload={(format) => handleDownloadConv(c.id, format)}
                                                        onCopy={() => handleCopyConv(c.id)}
                                                        onRename={(title) => chatApi.updateConversation(c.id, { title, title_locked: true }).then(() => invalidateAllConvQueries())}
                                                        enhanceActive={false}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* Trash section */}
                            <section
                                className={`rounded-xl border px-2.5 py-2 transition-colors ${isTrashSectionExpanded ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50' : 'flex-shrink-0 border-border/55 bg-card/22'}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleChatRailSection('trash')}
                                    className="w-full flex items-center justify-between gap-3 py-0.5 text-left"
                                    aria-label={`${isTrashSectionExpanded ? 'Collapse' : 'Expand'} Trash`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isTrashSectionExpanded ? 'rotate-90' : ''}`} />
                                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-amber-300 bg-amber-400/10 border border-amber-300/25">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-foreground truncate">Trash</div>
                                            <div className="text-xs text-muted-foreground/90 leading-5">
                                                {trashedConversations.length} archived thread{trashedConversations.length === 1 ? '' : 's'}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-semibold text-foreground/70 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                                        {trashedConversations.length}
                                    </span>
                                </button>

                                {isTrashSectionExpanded && (
                                    <div className="mt-2 min-h-0 flex-1 flex flex-col">
                                        {trashedConversations.length > 0 && (
                                            <div className="flex items-center gap-2 mb-2">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleBulkRestore()}
                                                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded-md border border-border/50 hover:border-accent/30 transition-colors"
                                                    title="Restore all trashed conversations"
                                                >
                                                    <RotateCcw className="w-3 h-3" /> Restore All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (confirmBulkDelete) {
                                                            if (confirmBulkTimerRef.current) clearTimeout(confirmBulkTimerRef.current)
                                                            setConfirmBulkDelete(false)
                                                            void handleBulkPermanentDelete()
                                                        } else {
                                                            setConfirmBulkDelete(true)
                                                            confirmBulkTimerRef.current = setTimeout(() => setConfirmBulkDelete(false), 3000)
                                                        }
                                                    }}
                                                    className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-all ${confirmBulkDelete
                                                        ? 'bg-red-500/20 border-red-500/40 text-red-400 font-medium'
                                                        : 'text-red-500/70 hover:text-red-400 border-border/50 hover:border-red-500/30'
                                                    }`}
                                                    title={confirmBulkDelete ? 'Click again to confirm' : 'Permanently delete all trashed conversations'}
                                                >
                                                    <Trash2 className="w-3 h-3" /> {confirmBulkDelete ? 'Sure?' : 'Delete All'}
                                                </button>
                                            </div>
                                        )}
                                        <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1">
                                            {trashedConversations.length === 0 ? (
                                                <p className="text-xs text-muted-foreground text-center py-8 px-4">Trash is empty.</p>
                                            ) : (
                                                trashedConversations.map(c => (
                                                    <TrashedConversationRow
                                                        key={c.id}
                                                        conv={c}
                                                        active={activeCid === c.id}
                                                        onSelect={() => handleSelectTrashedConversation(c.id)}
                                                        onRestore={() => handleRestoreConv(c.id)}
                                                        onPermanentDelete={() => handlePermanentlyDeleteConv(c.id)}
                                                        onDownload={(format) => handleDownloadConv(c.id, format)}
                                                        onCopy={() => handleCopyConv(c.id)}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>
                    </>
                )}
            </Siderail>
        </div>
    )
}

// ── Conversation row with inline rename ──
function ConversationRow({ conv, active, onSelect, onDelete, onDownload, onCopy, onRename, activePreview = null, enhanceActive = true }: {
    conv: Conversation; active: boolean
    onSelect: () => void; onDelete: () => void
    onDownload: (format: 'json' | 'markdown' | 'txt') => void
    onCopy: () => void
    onRename: (title: string) => void
    activePreview?: string | null
    enhanceActive?: boolean
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(conv.title ?? '')
    const [showDownloadMenu, setShowDownloadMenu] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const showActiveCard = active && enhanceActive
    const relativeTime = showActiveCard ? formatThreadRelativeTime(conv.last_message_at) : null
    const actionIconClass = showActiveCard ? 'h-3.5 w-3.5' : 'h-3 w-3'

    const openRename = () => {
        setDraft(conv.title ?? '')
        setEditing(true)
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
    }
    const startEdit = (e: React.MouseEvent) => {
        e.stopPropagation()
        openRename()
    }

    const commitEdit = () => {
        if (draft.trim() && draft.trim() !== conv.title) onRename(draft.trim())
        setEditing(false)
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className={`group flex items-start gap-1.5 cursor-pointer transition-colors ${showActiveCard
                        ? 'rounded-2xl border border-accent/45 bg-[linear-gradient(180deg,hsla(var(--accent)/0.14),hsla(var(--card)/0.8))] px-3 py-3 shadow-[0_0_0_1px_hsla(var(--accent)/0.14)]'
                        : active
                        ? 'rounded-md border border-accent/35 bg-accent/12 px-2.5 py-1.5 ring-1 ring-accent/20'
                        : 'rounded-md border border-transparent bg-transparent px-2.5 py-1.5 hover:border-border/60 hover:bg-muted/35'
                        }`}
                    onClick={onSelect}
                >
                    <div className={`${showActiveCard
                        ? 'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/12 text-accent'
                        : 'pt-0.5'
                    }`}>
                        <MessageSquare className={`${showActiveCard ? 'h-3.5 w-3.5 text-accent' : 'w-3 h-3 text-muted-foreground'} flex-shrink-0`} />
                    </div>
                    <div className="min-w-0 flex-1">
                        {editing ? (
                            <input
                                ref={inputRef}
                                className="w-full text-[11px] bg-background border border-accent/40 rounded px-1 py-0.5 outline-none"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
                                onClick={e => e.stopPropagation()}
                            />
                        ) : (
                            <p className={`${showActiveCard ? 'text-sm font-semibold leading-tight text-foreground' : 'text-[11px] font-medium leading-tight'} truncate`}>
                                {conv.title ?? 'New Chat'}
                            </p>
                        )}
                        {showActiveCard && activePreview ? (
                            <>
                                <p className="mt-1 truncate text-[12px] leading-5 text-muted-foreground/88">
                                    {activePreview}
                                </p>
                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/72">
                                    <span>{conv.message_count} message{conv.message_count === 1 ? '' : 's'}</span>
                                    {relativeTime && (
                                        <>
                                            <span aria-hidden>•</span>
                                            <span>{relativeTime}</span>
                                        </>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-[10px] text-muted-foreground/85 leading-tight">{conv.message_count} messages</p>
                        )}
                    </div>
                    <div className={`relative flex items-center gap-0.5 ${showActiveCard ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button
                            className={showActiveCard
                                ? 'btn-ghost h-7 w-7 rounded-lg border-border/55 bg-card/55'
                                : 'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors'
                            }
                            onClick={startEdit}
                            title="Rename chat"
                            aria-label="Rename chat"
                        >
                            <Pencil className={actionIconClass} />
                        </button>
                        <button
                            type="button"
                            className={showActiveCard
                                ? 'btn-ghost h-7 w-7 rounded-lg border-border/55 bg-card/55 text-muted-foreground hover:text-foreground'
                                : 'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors'
                            }
                            onClick={(e) => { e.stopPropagation(); setShowDownloadMenu(m => !m) }}
                            title="Download chat"
                            aria-label="Download chat"
                        >
                            <Download className={actionIconClass} />
                        </button>
                        {showDownloadMenu && (
                            <div className="absolute right-0 top-full mt-1 z-50 min-w-[100px] rounded-lg border border-border/60 bg-popover py-1 shadow-lg">
                                <button type="button" onClick={(e) => { e.stopPropagation(); onCopy(); setShowDownloadMenu(false) }}
                                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted/50 flex items-center gap-1.5">
                                    <Copy className="w-3 h-3" /> Copy Text
                                </button>
                                {(['json', 'markdown', 'txt'] as const).map(fmt => (
                                    <button key={fmt} type="button" onClick={(e) => { e.stopPropagation(); onDownload(fmt); setShowDownloadMenu(false) }}
                                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted/50 capitalize">
                                        {fmt === 'markdown' ? 'Markdown' : fmt === 'txt' ? 'Plain Text' : 'JSON'}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button
                            className={showActiveCard
                                ? 'btn-ghost h-7 w-7 rounded-lg border-border/55 bg-card/55'
                                : 'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors'
                            }
                            onClick={e => { e.stopPropagation(); onDelete() }}
                            title="Move chat to trash"
                            aria-label="Move chat to trash"
                        >
                            <Trash2 className={actionIconClass} />
                        </button>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={(e) => { e.preventDefault(); openRename() }} className="gap-2">
                    <Pencil className="w-4 h-4" /> Rename Chat
                </ContextMenuItem>
                <ContextMenuItem onSelect={(e) => { e.preventDefault(); onCopy() }} className="gap-2">
                    <Copy className="w-4 h-4" /> Copy Text
                </ContextMenuItem>
                <ContextMenuItem onSelect={(e) => { e.preventDefault(); onDownload('json') }} className="gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download Chat
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={(e) => { e.preventDefault(); onDelete() }} className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10">
                    <Trash2 className="w-4 h-4" /> Move to Trash
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

function TrashedConversationRow({
    conv,
    active,
    onSelect,
    onRestore,
    onPermanentDelete,
    onDownload,
    onCopy,
}: {
    conv: Conversation
    active: boolean
    onSelect: () => void
    onRestore: () => void
    onPermanentDelete: () => void
    onDownload: (format: 'json' | 'markdown' | 'txt') => void
    onCopy: () => void
}) {
    const [showDownloadMenu, setShowDownloadMenu] = useState(false)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (confirmingDelete) {
            if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
            setConfirmingDelete(false)
            onPermanentDelete()
        } else {
            setConfirmingDelete(true)
            confirmTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000)
        }
    }

    useEffect(() => () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current) }, [])

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className={`group flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors ${active
                        ? 'border-accent/35 bg-accent/12 ring-1 ring-accent/20'
                        : 'border-transparent bg-transparent hover:border-border/60 hover:bg-muted/35'
                        }`}
                    onClick={onSelect}
                >
                    <Trash2 className="w-3 h-3 flex-shrink-0 text-amber-300" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate leading-tight">{conv.title ?? 'Untitled Chat'}</p>
                        <p className="text-[10px] text-muted-foreground/85 leading-tight">{conv.message_count} messages</p>
                    </div>
                    <div className="relative flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setShowDownloadMenu(!showDownloadMenu)
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            aria-label="Download chat"
                            title="Download chat"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </button>
                        {showDownloadMenu && (
                            <div className="absolute right-0 top-full mt-1 z-50 min-w-[100px] rounded-lg border border-border/60 bg-popover py-1 shadow-lg">
                                <button type="button"
                                    onClick={(e) => { e.stopPropagation(); onCopy(); setShowDownloadMenu(false) }}
                                    className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted/50 flex items-center gap-1.5">
                                    <Copy className="w-3 h-3" /> Copy Text
                                </button>
                                {(['json', 'markdown', 'txt'] as const).map(fmt => (
                                    <button key={fmt} type="button"
                                        onClick={(e) => { e.stopPropagation(); onDownload(fmt); setShowDownloadMenu(false) }}
                                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted/50">
                                        {fmt === 'markdown' ? 'Markdown' : fmt === 'txt' ? 'Plain Text' : 'JSON'}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRestore() }}
                            className="inline-flex h-6 items-center px-2 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                            aria-label="Restore chat"
                        >
                            Restore
                        </button>
                        <button
                            type="button"
                            onClick={handleDeleteClick}
                            className={`inline-flex items-center justify-center h-6 rounded-md transition-all ${confirmingDelete
                                ? 'w-auto px-2 bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-medium'
                                : 'w-6 text-red-400 hover:bg-red-500/10'
                            }`}
                            aria-label="Delete permanently"
                            title={confirmingDelete ? 'Click again to confirm' : 'Delete permanently'}
                        >
                            {confirmingDelete ? 'Sure?' : <Trash2 className="w-3 h-3" />}
                        </button>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={(e) => { e.preventDefault(); onRestore() }} className="gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                    Restore Chat
                </ContextMenuItem>
                <ContextMenuItem onSelect={(e) => { e.preventDefault(); onCopy() }} className="gap-2">
                    <Copy className="w-4 h-4" /> Copy Text
                </ContextMenuItem>
                <ContextMenuItem onSelect={(e) => { e.preventDefault(); onDownload('json') }} className="gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download Chat
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={(e) => { e.preventDefault(); onPermanentDelete() }} className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10">
                    <Trash2 className="w-4 h-4" /> Delete Permanently
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

// ── Mention editor handle ──
interface MentionEditorHandle {
    getText: () => string
    getMentions: () => Mention[]
    clear: () => void
    focus: () => void
    insertText: (text: string) => void
}
