import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
    getKnowledge,
    resolveKnowledgeIds,
    exportConversation,
    bulkTrashConversations,
    bulkRestoreConversations,
    bulkPermanentlyDeleteConversations,
} from '@/lib/api'
import { useStreamingChat, type Mention, type TimelineEntry } from '@/hooks/useStreamingChat'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Plus, Send, Square, Loader2, MessageSquare, Trash2, Bot, User, Sparkles,
    ChevronDown, ChevronRight, ChevronLeft, ChevronUp, ChevronsUp, Check, Pencil,
    Paperclip, X, Copy, Search, Network, AtSign,
    RotateCcw, Trash, Mic, Pause, Play,
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator
} from '@/components/ui/context-menu'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import { renderAgentMessageContent, type MentionResolutionMaps } from '@/lib/agent-content'
import Siderail from '@/components/shared/Siderail'
function renderMessageContent(
    content: string,
    workspaceId: string,
    maps?: MentionResolutionMaps,
): string {
    return renderAgentMessageContent(content, workspaceId, maps)
}

const CHAT_STREAMING_SAFE_GAP = 4

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
    timeline?: TimelineEntry[] | null
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
    is_subagent?: boolean
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

export default function WorkspaceAgentPage() {
    const { workspaceId = '', conversationId } = useParams<{ workspaceId: string; conversationId?: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const { success: showSuccess, error: showError } = useToast()
    const [inputText, setInputText] = useState('')
    const [activeCid, setActiveCid] = useState(conversationId ?? null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const streamingMessageRef = useRef<HTMLDivElement>(null)
    const streamingResponseViewportRef = useRef<HTMLDivElement>(null)
    const mentionEditorRef = useRef<MentionEditorHandle>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const composerShellRef = useRef<HTMLDivElement>(null)
    const [composerHeight, setComposerHeight] = useState(188)
    const [messagesViewportHeight, setMessagesViewportHeight] = useState(0)
    const [activeChatRailSection, setActiveChatRailSection] = useState<'conversations' | 'subagent' | 'trash' | null>('conversations')
    const shouldRestoreTextareaFocusRef = useRef(false)
    const suppressAutoSelectRef = useRef(false)
    const [stickToBottom, setStickToBottom] = useState(true)
    const stickToBottomRef = useRef(true)
    const wasStreamingRef = useRef(false)

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
    const [optimizeEnabled, setOptimizeEnabled] = useState(() => sessionStorage.getItem('optimizeEnabled') === 'true')

    // Audio recording
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle')
    const [recordingDuration, setRecordingDuration] = useState(0)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioStreamRef = useRef<MediaStream | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const [streamResponseExpanded, setStreamResponseExpanded] = useState(false)
    const [streamResponseHasHiddenTop, setStreamResponseHasHiddenTop] = useState(false)
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
        queryKey: ['conversations', workspaceId],
        queryFn: () => listConversations(workspaceId, { category: 'chats' }),
        enabled: !!workspaceId,
    })
    const { data: subagentConversationsData = [] } = useQuery({
        queryKey: ['conversations', workspaceId, 'subagent'],
        queryFn: () => listConversations(workspaceId, { category: 'subagent' }),
        enabled: !!workspaceId,
    })
    const { data: trashedConversationsData = [] } = useQuery({
        queryKey: ['conversations', workspaceId, 'trash'],
        queryFn: () => listConversations(workspaceId, { category: 'trash' }),
        enabled: !!workspaceId,
    })
    const conversationsWithArchived = useMemo(
        () => [...(conversations as Conversation[]), ...(subagentConversationsData as Conversation[]), ...(trashedConversationsData as Conversation[])],
        [conversations, subagentConversationsData, trashedConversationsData]
    )

    const { data: conversationData } = useQuery({
        queryKey: ['conversation', activeCid],
        queryFn: () => getConversation(workspaceId, activeCid!, { include_archived: true }),
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
        streamingContent,
        isStreaming,
        isInterrupted,
        timeline: streamingTimeline,
        sendMessage,
        cancelStream,
        isConnected,
        lastError,
        clearLastError,
    } = useStreamingChat(activeCid)

    const messages: Message[] = conversationData?.messages ?? []
    const activeConversations = conversations as Conversation[]
    const subagentConversations = subagentConversationsData as Conversation[]
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
        navigate(`/w/${workspaceId}/agent/${mostRecentConversationId}`, { replace: true })
    }, [activeCid, conversationId, mostRecentConversationId, navigate, workspaceId])

    useEffect(() => {
        stickToBottomRef.current = true
        setStickToBottom(true)
    }, [activeCid])

    useEffect(() => {
        if (!isStreaming) {
            setStreamResponseExpanded(false)
            setStreamResponseHasHiddenTop(false)
            return
        }
        if (!streamingContent) {
            setStreamResponseHasHiddenTop(false)
        }
    }, [activeCid, isStreaming, streamingContent])

    // On chat_done, ensure the full response is visible
    useEffect(() => {
        if (wasStreamingRef.current && !isStreaming) {
            const container = messagesContainerRef.current
            if (container) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
                stickToBottomRef.current = true
                setStickToBottom(true)
            }
        }
        wasStreamingRef.current = isStreaming
    }, [isStreaming])

    // Track thinking content length for scroll updates during streaming
    const streamingThinkingContentLength = useMemo(() => {
        return streamingTimeline
            .filter((entry): entry is { type: 'thinking'; content: string } => entry.type === 'thinking')
            .reduce((sum, entry) => sum + (entry.content?.length ?? 0), 0)
    }, [streamingTimeline])

    // Track nested timeline content length for scroll updates during subagent execution
    const subagentLiveContentLength = useMemo(() => {
        return streamingTimeline.reduce((sum, entry) => {
            if (entry.type === 'tool_call' && entry.nested_timeline) {
                return sum + entry.nested_timeline.length
            }
            return sum
        }, 0)
    }, [streamingTimeline])

    useEffect(() => {
        if (!stickToBottomRef.current) return
        const container = messagesContainerRef.current
        if (!container) return
        container.scrollTo({ top: container.scrollHeight, behavior: isStreaming ? 'auto' : 'smooth' })
    }, [messages.length, streamingContent, streamingTimeline.length, subagentLiveContentLength, isStreaming, stickToBottom])

    useEffect(() => {
        if (!stickToBottomRef.current) return
        const container = messagesContainerRef.current
        if (!container) return
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' })
    }, [composerHeight, stickToBottom])

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

    useEffect(() => {
        if (!activeCid) return
        const element = composerShellRef.current
        if (!element) return

        const updateHeight = () => {
            setComposerHeight(Math.max(80, Math.ceil(element.getBoundingClientRect().height)))
        }

        updateHeight()

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateHeight)
            return () => window.removeEventListener('resize', updateHeight)
        }

        const observer = new ResizeObserver(() => updateHeight())
        observer.observe(element)
        window.addEventListener('resize', updateHeight)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', updateHeight)
        }
    }, [activeCid, attachments.length, lastError, isConnected, inputText, modelPickerOpen, uploadingFiles])

    useEffect(() => {
        if (!activeCid) return
        const container = messagesContainerRef.current
        if (!container) return

        const updateHeight = () => {
            const next = Math.max(0, Math.floor(container.clientHeight))
            setMessagesViewportHeight(prev => (prev === next ? prev : next))
        }

        updateHeight()

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateHeight)
            return () => window.removeEventListener('resize', updateHeight)
        }

        const observer = new ResizeObserver(updateHeight)
        observer.observe(container)
        window.addEventListener('resize', updateHeight)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', updateHeight)
        }
    }, [activeCid, composerHeight])

    const focusComposer = useCallback(() => {
        const editor = mentionEditorRef.current
        if (!editor) return false
        editor.focus()
        return true
    }, [])

    const scheduleComposerFocus = useCallback((delayMs = 0) => {
        shouldRestoreTextareaFocusRef.current = true

        const attemptFocus = () => {
            if (focusComposer()) {
                shouldRestoreTextareaFocusRef.current = false
                return
            }

            window.setTimeout(() => {
                if (focusComposer()) {
                    shouldRestoreTextareaFocusRef.current = false
                }
            }, 90)
        }

        if (delayMs > 0) {
            window.setTimeout(attemptFocus, delayMs)
            return
        }

        window.requestAnimationFrame(attemptFocus)
    }, [focusComposer])

    useEffect(() => {
        if (!activeCid) return
        scheduleComposerFocus(40)
    }, [activeCid, scheduleComposerFocus])

    const ensureExpandedBlockVisible = useCallback((
        element: HTMLElement | null,
        behavior: ScrollBehavior = 'smooth',
        preferBottom = false,
    ) => {
        const container = messagesContainerRef.current
        if (!container || !element) return

        const containerRect = container.getBoundingClientRect()
        const elementRect = element.getBoundingClientRect()
        const topPadding = 12
        const bottomPadding = 16
        const visibleHeight = containerRect.height - topPadding - bottomPadding
        const elementHeight = elementRect.height

        if (elementHeight > visibleHeight || preferBottom) {
            const hiddenBelow = elementRect.bottom - (containerRect.bottom - bottomPadding)
            if (hiddenBelow > 0) {
                container.scrollTo({
                    top: container.scrollTop + hiddenBelow,
                    behavior,
                })
            }
            return
        }

        const hiddenAbove = (containerRect.top + topPadding) - elementRect.top
        if (hiddenAbove > 0) {
            container.scrollTo({
                top: Math.max(0, container.scrollTop - hiddenAbove),
                behavior,
            })
            return
        }

        const hiddenBelow = elementRect.bottom - (containerRect.bottom - bottomPadding)
        if (hiddenBelow > 0) {
            container.scrollTo({
                top: container.scrollTop + hiddenBelow,
                behavior,
            })
        }
    }, [])

    // Pre-render streaming markdown once per content change instead of inline
    // on every render cycle — avoids redundant md.render() calls when only
    // unrelated state (scroll position, tool results, etc.) changes.
    const renderedStreamingContent = useMemo(() => renderMessageContent(streamingContent, workspaceId ?? '', mentionMaps), [streamingContent, workspaceId, mentionMaps])

    useEffect(() => {
        if (!isStreaming || !stickToBottom) return
        const target = streamingMessageRef.current
        if (!target) return

        const keepVisible = () => ensureExpandedBlockVisible(target, 'auto', true)
        keepVisible()

        const raf1 = window.requestAnimationFrame(keepVisible)
        const raf2 = window.requestAnimationFrame(() => {
            window.requestAnimationFrame(keepVisible)
        })
        const timer = window.setTimeout(keepVisible, 180)

        return () => {
            window.cancelAnimationFrame(raf1)
            window.cancelAnimationFrame(raf2)
            window.clearTimeout(timer)
        }
    }, [
        isStreaming,
        stickToBottom,
        streamingTimeline.length,
        streamingThinkingContentLength,
        subagentLiveContentLength,
        streamingContent,
        ensureExpandedBlockVisible,
    ])

    useEffect(() => {
        if (!isStreaming || streamResponseExpanded) return
        const viewport = streamingResponseViewportRef.current
        if (!viewport) return

        const stickToStreamEnd = () => {
            viewport.scrollTop = viewport.scrollHeight
            const hasOverflow = viewport.scrollHeight - viewport.clientHeight > 2
            const hiddenTop = hasOverflow && viewport.scrollTop > 2
            setStreamResponseHasHiddenTop(prev => (prev === hiddenTop ? prev : hiddenTop))
        }

        stickToStreamEnd()
        const raf1 = window.requestAnimationFrame(stickToStreamEnd)
        const raf2 = window.requestAnimationFrame(() => {
            window.requestAnimationFrame(stickToStreamEnd)
        })

        return () => {
            window.cancelAnimationFrame(raf1)
            window.cancelAnimationFrame(raf2)
        }
    }, [isStreaming, streamingContent, streamResponseExpanded])

    useEffect(() => {
        if (!shouldRestoreTextareaFocusRef.current) return
        if (isStreaming || uploadingFiles) return
        const rafId = window.requestAnimationFrame(() => {
            if (focusComposer()) {
                shouldRestoreTextareaFocusRef.current = false
            }
        })
        return () => window.cancelAnimationFrame(rafId)
    }, [isStreaming, uploadingFiles, activeCid])

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

        qc.setQueryData(['conversations', workspaceId], (prev: Conversation[] | undefined) => {
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
        const conv = await createConversation(workspaceId)
        suppressAutoSelectRef.current = false
        setActiveChatRailSection('conversations')
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'subagent'] }); qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'trash'] })
        scheduleComposerFocus(40)
        setActiveCid(conv.id)
        navigate(`/w/${workspaceId}/agent/${conv.id}`)
    }

    const handleDeleteConv = async (cid: string) => {
        await deleteConversation(workspaceId, cid)
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'subagent'] }); qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'trash'] })
        if (activeCid === cid) {
            suppressAutoSelectRef.current = true
            setActiveCid(null)
            navigate(`/w/${workspaceId}/agent`)
        }
    }

    const handleRestoreConv = async (cid: string) => {
        try {
            await updateConversation(workspaceId, cid, { is_archived: false })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'subagent'] }); qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'trash'] })
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
            await permanentlyDeleteConversation(workspaceId, cid)
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'subagent'] }); qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'trash'] })
            qc.removeQueries({ queryKey: ['conversation', cid], exact: true })
            if (activeCid === cid) {
                suppressAutoSelectRef.current = true
                setActiveCid(null)
                navigate(`/w/${workspaceId}/agent`)
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Unable to permanently delete conversation.'
            showError('Permanent delete failed', detail)
        }
    }

    const invalidateAllConvQueries = () => {
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'subagent'] })
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'trash'] })
    }

    const handleBulkTrash = async (category: 'chats' | 'subagent') => {
        await bulkTrashConversations(workspaceId, category)
        invalidateAllConvQueries()
        if (activeCid) {
            const affected = category === 'subagent' ? subagentConversations : activeConversations
            if (affected.some(c => c.id === activeCid)) {
                suppressAutoSelectRef.current = true
                setActiveCid(null)
                navigate(`/w/${workspaceId}/agent`)
            }
        }
    }

    const handleBulkRestore = async () => {
        await bulkRestoreConversations(workspaceId)
        invalidateAllConvQueries()
    }

    const handleBulkPermanentDelete = async () => {
        try {
            await bulkPermanentlyDeleteConversations(workspaceId)
            invalidateAllConvQueries()
            if (activeCid && trashedConversations.some(c => c.id === activeCid)) {
                suppressAutoSelectRef.current = true
                setActiveCid(null)
                navigate(`/w/${workspaceId}/agent`)
            }
        } catch (err: any) {
            showError('Bulk delete failed', err?.response?.data?.detail || err?.message || 'Unable to delete.')
        }
    }

    const handleDownloadConv = async (cid: string, format: 'json' | 'markdown' | 'txt' = 'json') => {
        try {
            const blob = await exportConversation(workspaceId, cid, format)
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
            const blob = await exportConversation(workspaceId, cid, 'txt')
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
        scheduleComposerFocus(20)
        setActiveCid(cid)
        navigate(`/w/${workspaceId}/agent/${cid}`)
    }

    const handleSelectTrashedConversation = (cid: string) => {
        setActiveChatRailSection('trash')
        suppressAutoSelectRef.current = false
        setActiveCid(cid)
        navigate(`/w/${workspaceId}/agent/${cid}`)
    }

    const handleSend = async () => {
        const rawText = mentionEditorRef.current?.getText() ?? inputText
        if (!rawText.trim() || (isStreaming && !isInterrupted) || uploadingFiles) return
        if (conversationData?.is_archived || activeConversationRecord?.is_archived) {
            showError('Chat is archived', 'Restore this chat from Trash to continue messaging.')
            return
        }
        const msg = rawText.trim()
        const activeMentions = mentionEditorRef.current?.getMentions() ?? []
        clearLastError()
        stickToBottomRef.current = true
        setStickToBottom(true)

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
                scheduleComposerFocus()
                return
            } finally {
                setUploadingFiles(false)
            }
        }

        let targetCid = activeCid
        if (!targetCid) {
            const conv = await createConversation(workspaceId)
            targetCid = conv.id
            suppressAutoSelectRef.current = false
            setActiveChatRailSection('conversations')
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'subagent'] }); qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'trash'] })
            setActiveCid(conv.id)
            navigate(`/w/${workspaceId}/agent/${conv.id}`)
        }

        const override: { provider_id?: string; model_id?: string; attachment_ids?: string[]; mentions?: Mention[]; optimize?: boolean } = {}
        if (selectedOption) {
            override.provider_id = selectedOption.providerId
            override.model_id = selectedOption.modelId
        }
        if (attachmentIds.length > 0) override.attachment_ids = attachmentIds
        if (activeMentions.length > 0) override.mentions = activeMentions
        if (optimizeEnabled) override.optimize = true

        const sent = sendMessage(msg, override, targetCid)
        if (!sent) {
            showError('Message not sent', 'Chat socket is disconnected. Wait for reconnect and try again.')
            scheduleComposerFocus()
            return
        }

        pushOptimisticUserMessage(targetCid, msg)
        mentionEditorRef.current?.clear()
        setInputText('')
        if (attachments.length > 0) setAttachments([])
        scheduleComposerFocus()
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        // Filter to allowed types
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
        setAttachments(prev => [...prev, ...allowed].slice(0, 5)) // Max 5 files
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index))
    }

    // --- Audio recording ---
    const clearRecordingTimer = () => {
        if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
    }

    const stopAudioRecording = useCallback((discard = false) => {
        clearRecordingTimer()
        const recorder = mediaRecorderRef.current
        if (recorder && recorder.state !== 'inactive') {
            if (discard) {
                // Detach onstop handler to avoid adding to attachments
                recorder.onstop = () => {
                    audioStreamRef.current?.getTracks().forEach(t => t.stop())
                    audioStreamRef.current = null
                    mediaRecorderRef.current = null
                }
            }
            recorder.stop()
        }
        if (discard) {
            audioStreamRef.current?.getTracks().forEach(t => t.stop())
            audioStreamRef.current = null
            mediaRecorderRef.current = null
        }
        setRecordingState('idle')
        setRecordingDuration(0)
    }, [])

    const startAudioRecording = async () => {
        if (attachments.length >= 5) {
            showError('Attachment limit reached', 'Remove an attachment first.')
            return
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            audioStreamRef.current = stream
            audioChunksRef.current = []

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'

            const recorder = new MediaRecorder(stream, { mimeType })
            mediaRecorderRef.current = recorder

            recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
            recorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType })
                const cleanMime = mimeType.split(';')[0].trim()
                const ext = cleanMime === 'audio/mp4' ? '.m4a' : '.webm'
                const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
                const audioFile = new File([blob], `recording-${ts}${ext}`, { type: cleanMime })
                setAttachments(prev => [...prev, audioFile].slice(0, 5))
                audioStreamRef.current?.getTracks().forEach(t => t.stop())
                audioStreamRef.current = null
                mediaRecorderRef.current = null
                setRecordingState('idle')
                setRecordingDuration(0)
                clearRecordingTimer()
            }

            recorder.start(250)
            setRecordingState('recording')
            setRecordingDuration(0)

            const start = Date.now()
            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration((Date.now() - start) / 1000)
            }, 200)
        } catch (err: any) {
            showError('Microphone error', err?.name === 'NotAllowedError'
                ? 'Microphone access denied. Please allow microphone access.'
                : 'Could not access microphone. Check your device settings.')
        }
    }

    const pauseAudioRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.pause()
            setRecordingState('paused')
            clearRecordingTimer()
        }
    }

    const resumeAudioRecording = () => {
        if (mediaRecorderRef.current?.state === 'paused') {
            mediaRecorderRef.current.resume()
            setRecordingState('recording')
            const resumeStart = Date.now() - recordingDuration * 1000
            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration((Date.now() - resumeStart) / 1000)
            }, 200)
        }
    }

    // Cleanup recording on unmount
    useEffect(() => {
        return () => { stopAudioRecording(true) }
    }, [stopAudioRecording])

    const formatRecordingDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = Math.floor(seconds % 60)
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const handleMessagesScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const el = event.currentTarget
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        const atBottom = distanceFromBottom <= 50
        stickToBottomRef.current = atBottom
        setStickToBottom(atBottom)
    }

    const activeConversationIsArchived = Boolean(conversationData?.is_archived || activeConversationRecord?.is_archived)
    // Input box stays editable while streaming so the user can compose their next message
    const inputDisabled = uploadingFiles || activeConversationIsArchived
    const composerDisabled = (isStreaming && !isInterrupted) || uploadingFiles || activeConversationIsArchived
    const canSend = !composerDisabled && inputText.trim().length > 0
    const streamingModelLabel = selectedOption?.label ?? defaultLabel
    const streamingBubbleMaxHeight = useMemo(() => {
        if (messagesViewportHeight <= 0) return 280
        return Math.max(180, Math.floor(messagesViewportHeight * 0.5))
    }, [messagesViewportHeight])
    const isConversationsSectionExpanded = activeChatRailSection === 'conversations'
    const isSubagentSectionExpanded = activeChatRailSection === 'subagent'
    const isTrashSectionExpanded = activeChatRailSection === 'trash'
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
    const confirmBulkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const toggleChatRailSection = (section: 'conversations' | 'subagent' | 'trash') => {
        setActiveChatRailSection(prev => (prev === section ? null : section))
    }
    const handleStreamingBubbleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        if (streamResponseExpanded) return
        const viewport = event.currentTarget
        const hasOverflow = viewport.scrollHeight - viewport.clientHeight > 2
        const hiddenTop = hasOverflow && viewport.scrollTop > 2
        setStreamResponseHasHiddenTop(prev => (prev === hiddenTop ? prev : hiddenTop))
    }

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
                    <>
                        <div className="relative flex-1 min-h-0">
                            <div
                                ref={messagesContainerRef}
                                className="absolute inset-x-0 top-0 overflow-y-auto px-6 pt-6 pb-3 space-y-4"
                                style={{ bottom: `${composerHeight + CHAT_STREAMING_SAFE_GAP}px` }}
                                onScroll={handleMessagesScroll}
                            >
                                {messages.map((msg) => (
                                        <ChatMessageCard
                                            key={msg.id}
                                            message={msg}
                                            workspaceId={workspaceId}
                                            requestVisibility={ensureExpandedBlockVisible}
                                            mentionMaps={mentionMaps}
                                        />
                                ))}
                                {isStreaming && (
                                    <div className="flex gap-3">
                                        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-1">
                                            <Bot className="w-4 h-4 text-accent" />
                                        </div>
                                        <div ref={streamingMessageRef} className="max-w-[92%] lg:max-w-[84%] xl:max-w-[78%] 2xl:max-w-[72%] space-y-2">
                                            <div className="agent-generation-pill">
                                                <span className="agent-generation-orb" aria-hidden />
                                                Agent Generating Response
                                            </div>
                                            <div className="chat-workflow-stack w-full">
                                                <div className="text-xs text-muted-foreground/40 p-4 text-center">
                                                    Timeline view not available
                                                </div>
                                                {(streamingContent || isInterrupted) && (
                                                <div className={`chat-workflow-step chat-workflow-step--iconic chat-workflow-step--response chat-section-reveal ${streamingContent ? 'chat-workflow-step-live' : ''}`}>
                                                    <div className="chat-workflow-header">
                                                        <MessageSquare className="h-3.5 w-3.5" />
                                                        <span>Response</span>
                                                        <span className="chat-workflow-status">{isInterrupted ? 'Interrupted' : 'Streaming'}</span>
                                                    </div>
                                                    <div className="chat-bubble-assistant relative px-4 py-3">
                                                            {!streamResponseExpanded && streamResponseHasHiddenTop && (
                                                                <>
                                                                    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-12 rounded-t-2xl bg-gradient-to-b from-card/92 via-card/66 to-transparent" />
                                                                    <button
                                                                        type="button"
                                                                        className="absolute left-1/2 top-0 z-[3] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full border border-accent/30 bg-card/95 px-2.5 py-0.5 text-[11px] text-accent/80 hover:border-accent/55 hover:text-accent shadow-sm"
                                                                        onClick={() => {
                                                                            setStreamResponseExpanded(true)
                                                                            window.requestAnimationFrame(() => {
                                                                                ensureExpandedBlockVisible(streamingMessageRef.current, 'auto')
                                                                            })
                                                                        }}
                                                                        aria-label="Expand streaming response"
                                                                        title="Show full response while streaming"
                                                                    >
                                                                        <ChevronsUp className="h-3 w-3" />
                                                                        Expand
                                                                    </button>
                                                                </>
                                                            )}
                                                            <div
                                                                ref={streamingResponseViewportRef}
                                                                onScroll={handleStreamingBubbleScroll}
                                                                className={`min-h-0 ${streamResponseExpanded ? 'overflow-visible' : 'overflow-y-auto'}`}
                                                                style={streamResponseExpanded ? undefined : { maxHeight: `${streamingBubbleMaxHeight}px` }}
                                                            >
                                                                <div
                                                                    className={`markdown-content ${isInterrupted ? '' : 'streaming-cursor'}`}
                                                                    dangerouslySetInnerHTML={{ __html: renderedStreamingContent }}
                                                                    onClick={(e) => {
                                                                        const a = (e.target as HTMLElement).closest('a')
                                                                        if (a) { const h = a.getAttribute('href'); if (h?.startsWith('/')) { e.preventDefault(); navigate(h) } }
                                                                    }}
                                                                />
                                                                {isInterrupted && (
                                                                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground/50 italic">
                                                                        …Interrupted
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div ref={composerShellRef} className="chat-composer-shell pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 py-1 md:px-6 md:py-1.5">
                                {activeConversationIsArchived && (
                                    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 pointer-events-auto">
                                        <span className="leading-relaxed">This chat is in Trash. Restore it to continue sending messages.</span>
                                        {activeCid && (
                                            <button
                                                type="button"
                                                className="btn-ghost h-7 px-2 py-0 text-[11px]"
                                                onClick={() => { void handleRestoreConv(activeCid) }}
                                            >
                                                Restore
                                            </button>
                                        )}
                                    </div>
                                )}
                                {activeCid && !isConnected && (
                                    <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-300 pointer-events-auto">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Reconnecting to server…
                                    </p>
                                )}
                                {lastError && (
                                    <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 pointer-events-auto">
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

                                <div className="chat-composer-panel">
                                    {attachments.length > 0 && (
                                        <div className="mb-3 flex flex-wrap gap-2">
                                            {attachments.map((file, index) => (
                                                <div
                                                    key={`${file.name}-${index}`}
                                                    className="flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-2.5 py-1.5 text-xs"
                                                >
                                                    <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-accent/90" />
                                                    <span className="truncate max-w-[180px]">{file.name}</span>
                                                    <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeAttachment(index)}
                                                        className="rounded p-0.5 text-muted-foreground hover:bg-red-500/15 hover:text-red-300"
                                                        aria-label={`Remove ${file.name}`}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {recordingState !== 'idle' && (
                                        <div className="mb-3 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                                            <div className="relative flex items-center justify-center">
                                                {recordingState === 'recording' && (
                                                    <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-red-500/60" />
                                                )}
                                                <span className={`inline-flex h-3 w-3 rounded-full ${recordingState === 'recording' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                                            </div>
                                            <span className="font-mono text-xs tabular-nums text-foreground">
                                                {formatRecordingDuration(recordingDuration)}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {recordingState === 'recording' ? 'Recording...' : 'Paused'}
                                            </span>
                                            <div className="ml-auto flex items-center gap-1.5">
                                                {recordingState === 'recording' ? (
                                                    <button type="button" onClick={pauseAudioRecording} className="rounded p-1 text-muted-foreground hover:bg-muted/35 hover:text-foreground" title="Pause">
                                                        <Pause className="h-3.5 w-3.5" />
                                                    </button>
                                                ) : (
                                                    <button type="button" onClick={resumeAudioRecording} className="rounded p-1 text-muted-foreground hover:bg-muted/35 hover:text-foreground" title="Resume">
                                                        <Play className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => stopAudioRecording(false)} className="rounded p-1 text-emerald-400 hover:bg-emerald-500/15" title="Stop & attach">
                                                    <Square className="h-3.5 w-3.5 fill-current" />
                                                </button>
                                                <button type="button" onClick={() => stopAudioRecording(true)} className="rounded p-1 text-muted-foreground hover:bg-red-500/15 hover:text-red-300" title="Discard">
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-start gap-2">
                                        <button
                                            type="button"
                                            className={`mt-1.5 flex-shrink-0 rounded-lg p-1.5 transition-colors ${
                                                optimizeEnabled
                                                    ? 'bg-accent/15 text-accent'
                                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/35'
                                            }`}
                                            onClick={() => setOptimizeEnabled(prev => { const next = !prev; sessionStorage.setItem('optimizeEnabled', String(next)); return next })}
                                            title={optimizeEnabled ? 'Prompt optimization enabled' : 'Enable prompt optimization'}
                                        >
                                            <Sparkles className="h-4 w-4" />
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <MentionEditor
                                                ref={mentionEditorRef}
                                                disabled={inputDisabled}
                                                placeholder={activeConversationIsArchived ? 'Restore this chat to continue messaging...' : 'Ask a question, or type @ to mention a workspace or chat…'}
                                                workspaces={(allWorkspaces as { id: string; name: string }[]).filter(w => w.id !== workspaceId).map(w => ({ type: 'workspace' as const, id: w.id, name: w.name }))}
                                                conversations={(conversations as Conversation[]).filter(c => c.id !== activeCid).map(c => ({ type: 'chat' as const, id: c.id, name: c.title || 'Untitled Chat' }))}
                                                onTextChange={(text) => {
                                                    setInputText(text)
                                                    if (lastError) clearLastError()
                                                }}
                                                onMentionsChange={() => {}}
                                                onSubmit={handleSend}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {modelOptions.length > 0 && (
                                                <div ref={modelPickerRef} className="relative">
                                                    <button
                                                        type="button"
                                                        className="chat-control-pill"
                                                        onClick={() => setModelPickerOpen(prev => !prev)}
                                                        aria-expanded={modelPickerOpen}
                                                    >
                                                        <Bot className="h-3.5 w-3.5" />
                                                        <span className="max-w-[220px] truncate">{selectedModelKey ? (selectedOption?.label ?? defaultLabel) : 'Workspace default'}</span>
                                                        <ChevronDown className={`h-3 w-3 transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {modelPickerOpen && (
                                                        <div className="absolute bottom-full left-0 z-[180] mb-2 w-[min(30rem,84vw)] rounded-xl border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-md">
                                                            <div className="border-b border-border/60 p-2">
                                                                <div className="relative">
                                                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                                                                    <input
                                                                        ref={modelPickerSearchRef}
                                                                        className="input h-8 pl-7 text-xs"
                                                                        placeholder="Search provider or model..."
                                                                        value={modelPickerQuery}
                                                                        onChange={e => setModelPickerQuery(e.target.value)}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Escape') setModelPickerOpen(false)
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="max-h-64 overflow-y-auto p-1.5">
                                                                <button
                                                                    type="button"
                                                                    className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/35 ${!selectedModelKey ? 'bg-accent/10 text-accent' : 'text-muted-foreground'}`}
                                                                    onClick={() => {
                                                                        setSelectedModelKey('')
                                                                        setModelPickerOpen(false)
                                                                    }}
                                                                >
                                                                    {!selectedModelKey ? <Check className="h-3.5 w-3.5 flex-shrink-0" /> : <span className="w-3.5" />}
                                                                    <span>Workspace default</span>
                                                                </button>
                                                                {filteredModelOptions.length === 0 ? (
                                                                    <p className="px-2.5 py-2 text-xs text-muted-foreground">No models match your search.</p>
                                                                ) : (
                                                                    filteredModelOptions.map(opt => {
                                                                        const isSelected = selectedModelKey === opt.key
                                                                        return (
                                                                            <button
                                                                                key={opt.key}
                                                                                type="button"
                                                                                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/35 ${isSelected ? 'bg-accent/10 text-accent' : 'text-foreground'}`}
                                                                                onClick={() => {
                                                                                    setSelectedModelKey(opt.key)
                                                                                    setModelPickerOpen(false)
                                                                                }}
                                                                            >
                                                                                {isSelected ? <Check className="h-3.5 w-3.5 flex-shrink-0" /> : <span className="w-3.5" />}
                                                                                <span className="truncate">{opt.label}</span>
                                                                            </button>
                                                                        )
                                                                    })
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                multiple
                                                accept=".pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.ogg,.flac,.m4a,.webm,.weba,.docx,.doc,.xlsx,.xls,.pptx,.ppt,image/*,text/*,audio/*,video/webm,application/pdf"
                                                className="hidden"
                                                onChange={handleFileSelect}
                                            />
                                            <button
                                                type="button"
                                                className="chat-control-pill disabled:opacity-50"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={(uploadingFiles || activeConversationIsArchived) || attachments.length >= 5}
                                                title="Attach files"
                                            >
                                                <Paperclip className="h-3.5 w-3.5" />
                                                Attach
                                                {attachments.length > 0 && (
                                                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{attachments.length}</span>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                className={`chat-control-pill disabled:opacity-50 ${recordingState !== 'idle' ? 'bg-red-500/15 text-red-400 border-red-500/30' : ''}`}
                                                onClick={recordingState === 'idle' ? startAudioRecording : () => stopAudioRecording(false)}
                                                disabled={uploadingFiles || activeConversationIsArchived}
                                                title={recordingState === 'idle' ? 'Record audio' : 'Stop recording'}
                                            >
                                                {recordingState === 'idle' ? (
                                                    <Mic className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Square className="h-3.5 w-3.5 fill-current" />
                                                )}
                                                {recordingState === 'idle' ? 'Record' : 'Stop'}
                                            </button>
                                            <button
                                                type="button"
                                                className="chat-control-pill disabled:opacity-50"
                                                onClick={() => {
                                                    mentionEditorRef.current?.insertText('@')
                                                    mentionEditorRef.current?.focus()
                                                }}
                                                disabled={inputDisabled}
                                                title="Mention a workspace or chat"
                                            >
                                                <AtSign className="h-3.5 w-3.5" />
                                                Mention
                                            </button>
                                        </div>

                                        {isStreaming ? (
                                            <button
                                                type="button"
                                                className="chat-send-button"
                                                onClick={cancelStream}
                                                title="Stop generation"
                                            >
                                                <Square className="h-4 w-4 fill-current" />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="chat-send-button disabled:cursor-not-allowed disabled:opacity-50"
                                                onClick={handleSend}
                                                disabled={!canSend}
                                            >
                                                {uploadingFiles ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Send className="h-4 w-4" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
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
                                    <p className="text-xs text-muted-foreground/90">Chats, subagent threads, and trash.</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="flex-shrink-0 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                        {activeConversations.length + subagentConversations.length + trashedConversations.length}
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
                            {/* ── Conversations section ── */}
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
                                                        workspaceId={workspaceId}
                                                        onSelect={() => handleSelectConversation(c.id)}
                                                        onDelete={() => handleDeleteConv(c.id)}
                                                        onDownload={(format) => handleDownloadConv(c.id, format)}
                                                        onCopy={() => handleCopyConv(c.id)}
                                                        onRename={(title) => updateConversation(workspaceId, c.id, { title, title_locked: true }).then(() => invalidateAllConvQueries())}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* ── Subagent section ── */}
                            <section
                                className={`rounded-xl border px-2.5 py-2 transition-colors ${isSubagentSectionExpanded ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50' : 'flex-shrink-0 border-border/55 bg-card/22'}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleChatRailSection('subagent')}
                                    className="w-full flex items-center justify-between gap-3 py-0.5 text-left"
                                    aria-label={`${isSubagentSectionExpanded ? 'Collapse' : 'Expand'} Subagent`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isSubagentSectionExpanded ? 'rotate-90' : ''}`} />
                                        <div className="w-6 h-6 rounded-md flex items-center justify-center text-violet-400 bg-violet-400/10 border border-violet-400/25">
                                            <Bot className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-foreground truncate">Subagent</div>
                                            <div className="text-xs text-muted-foreground/90 leading-5">
                                                {subagentConversations.length} thread{subagentConversations.length === 1 ? '' : 's'}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-semibold text-foreground/70 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                                        {subagentConversations.length}
                                    </span>
                                </button>

                                {isSubagentSectionExpanded && (
                                    <div className="mt-2 min-h-0 flex-1 flex flex-col">
                                        {subagentConversations.length > 0 && (
                                            <div className="flex items-center justify-end mb-2">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleBulkTrash('subagent')}
                                                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-red-400 rounded-md border border-border/50 hover:border-red-500/30 transition-colors"
                                                    title="Trash all subagent threads"
                                                >
                                                    <Trash className="w-3 h-3" /> Trash All
                                                </button>
                                            </div>
                                        )}
                                        <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1">
                                            {subagentConversations.length === 0 ? (
                                                <p className="text-xs text-muted-foreground text-center py-8 px-4">No subagent threads.</p>
                                            ) : (
                                                subagentConversations.map(c => (
                                                    <ConversationRow
                                                        key={c.id}
                                                        conv={{ ...c, title: (c.title ?? '').replace(/^\[subagent\]\s*/i, '') || 'Subagent Task' }}
                                                        active={activeCid === c.id}
                                                        workspaceId={workspaceId}
                                                        onSelect={() => handleSelectConversation(c.id)}
                                                        onDelete={() => handleDeleteConv(c.id)}
                                                        onDownload={(format) => handleDownloadConv(c.id, format)}
                                                        onCopy={() => handleCopyConv(c.id)}
                                                        onRename={(title) => updateConversation(workspaceId, c.id, { title, title_locked: true }).then(() => invalidateAllConvQueries())}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* ── Trash section ── */}
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

// ── Conversation row with inline rename ─────────────────────────────────────
function ConversationRow({ conv, active, workspaceId, onSelect, onDelete, onDownload, onCopy, onRename }: {
    conv: Conversation; active: boolean; workspaceId: string
    onSelect: () => void; onDelete: () => void
    onDownload: (format: 'json' | 'markdown' | 'txt') => void
    onCopy: () => void
    onRename: (title: string) => void
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(conv.title ?? '')
    const [showDownloadMenu, setShowDownloadMenu] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

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
                    className={`group flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors ${active
                        ? 'border-accent/35 bg-accent/12 ring-1 ring-accent/20'
                        : 'border-transparent bg-transparent hover:border-border/60 hover:bg-muted/35'
                        }`}
                    onClick={onSelect}
                >
                    <MessageSquare className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
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
                            <p className="text-[11px] font-medium truncate leading-tight">{conv.title ?? 'New Chat'}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/85 leading-tight">{conv.message_count} messages</p>
                    </div>
                    <div className="relative opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                        <button
                            className="btn-ghost h-6 w-6 p-0 justify-center"
                            onClick={startEdit}
                            title="Rename chat"
                            aria-label="Rename chat"
                        >
                            <Pencil className="w-2.5 h-2.5" />
                        </button>
                        <button
                            type="button"
                            className="btn-ghost h-6 w-6 p-0 justify-center text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); setShowDownloadMenu(m => !m) }}
                            title="Download chat"
                            aria-label="Download chat"
                        >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
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
                            className="btn-ghost h-6 w-6 p-0 justify-center"
                            onClick={e => { e.stopPropagation(); onDelete() }}
                            title="Move chat to trash"
                            aria-label="Move chat to trash"
                        >
                            <Trash2 className="w-2.5 h-2.5" />
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
                            className="btn-ghost h-6 w-6 p-0 justify-center text-muted-foreground hover:text-foreground"
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
                            className="btn-ghost h-6 px-2 py-0 text-[10px] rounded-md"
                            aria-label="Restore chat"
                        >
                            Restore
                        </button>
                        <button
                            type="button"
                            onClick={handleDeleteClick}
                            className={`h-6 p-0 justify-center rounded-md transition-all ${confirmingDelete
                                ? 'w-auto px-2 bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-medium'
                                : 'btn-ghost w-6 text-red-400 hover:bg-red-500/10'
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

// ── Mention editor handle ─────────────────────────────────────────────────────
interface MentionEditorHandle {
    getText: () => string
    getMentions: () => Mention[]
    clear: () => void
    focus: () => void
    insertText: (text: string) => void
}

// ── Mention editor (contenteditable with inline chips) ────────────────────────
const MentionEditor = React.forwardRef<MentionEditorHandle, {
    onTextChange: (text: string) => void
    onMentionsChange: (mentions: Mention[]) => void
    onSubmit: () => void
    disabled?: boolean
    placeholder?: string
    workspaces: Mention[]
    conversations: Mention[]
}>(function MentionEditor({ onTextChange, onMentionsChange, onSubmit, disabled, placeholder, workspaces, conversations }, ref) {
    const editorRef = useRef<HTMLDivElement>(null)
    const [mentionOpen, setMentionOpen] = useState(false)
    const [mentionQuery, setMentionQuery] = useState('')
    const [mentionActiveIndex, setMentionActiveIndex] = useState(-1)
    const mentionDropdownRef = useRef<HTMLDivElement>(null)
    const atPositionRef = useRef<{ node: Text; offset: number } | null>(null)

    const getPlainText = (el: HTMLElement): string => {
        let text = ''
        el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent?.replace(/\u00a0/g, ' ') ?? ''
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const elem = node as HTMLElement
                if (elem.dataset.mentionId) {
                    text += `@${elem.dataset.mentionName}`
                } else if (elem.tagName === 'BR') {
                    text += '\n'
                } else if (elem.tagName === 'DIV') {
                    text += '\n' + getPlainText(elem)
                } else {
                    text += getPlainText(elem)
                }
            }
        })
        return text
    }

    const getChipMentions = (el: HTMLElement): Mention[] => {
        const seen = new Set<string>()
        const result: Mention[] = []
        el.querySelectorAll('[data-mention-id]').forEach(chip => {
            const elem = chip as HTMLElement
            const id = elem.dataset.mentionId || ''
            if (!seen.has(id)) {
                seen.add(id)
                result.push({
                    type: (elem.dataset.mentionType as 'workspace' | 'chat') || 'workspace',
                    id,
                    name: elem.dataset.mentionName || '',
                })
            }
        })
        return result
    }

    React.useImperativeHandle(ref, () => ({
        getText: () => editorRef.current ? getPlainText(editorRef.current) : '',
        getMentions: () => editorRef.current ? getChipMentions(editorRef.current) : [],
        clear: () => {
            if (editorRef.current) {
                editorRef.current.innerHTML = ''
                onTextChange('')
                onMentionsChange([])
            }
        },
        focus: () => {
            const el = editorRef.current
            if (!el) return
            el.focus()
            // Move cursor to end
            const range = document.createRange()
            range.selectNodeContents(el)
            range.collapse(false)
            const sel = window.getSelection()
            sel?.removeAllRanges()
            sel?.addRange(range)
        },
        insertText: (text: string) => {
            const el = editorRef.current
            if (!el) return
            el.focus()
            document.execCommand('insertText', false, text)
        },
    }))

    const detectMentionTrigger = () => {
        const sel = window.getSelection()
        if (!sel || !sel.rangeCount) { setMentionOpen(false); return }
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        if (node.nodeType !== Node.TEXT_NODE) { setMentionOpen(false); return }
        const textNode = node as Text
        const textBefore = textNode.data.slice(0, range.startOffset)
        const atMatch = textBefore.match(/@(\w*)$/)
        if (atMatch) {
            setMentionQuery(atMatch[1])
            setMentionActiveIndex(0)
            atPositionRef.current = { node: textNode, offset: range.startOffset - atMatch[0].length }
            setMentionOpen(true)
        } else {
            setMentionOpen(false)
            setMentionActiveIndex(-1)
            atPositionRef.current = null
        }
    }

    const handleInput = () => {
        const el = editorRef.current
        if (!el) return
        const text = getPlainText(el)
        const mentions = getChipMentions(el)
        onTextChange(text)
        onMentionsChange(mentions)
        detectMentionTrigger()
        // Auto-resize
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 160) + 'px'
    }

    const handleMentionSelect = (mention: Mention) => {
        const el = editorRef.current
        if (!el) { setMentionOpen(false); return }

        const sel = window.getSelection()
        const pos = atPositionRef.current
        if (!pos || !sel) { setMentionOpen(false); return }

        // Find current cursor offset in the same text node
        const curRange = sel.rangeCount > 0 ? sel.getRangeAt(0) : null
        const curOffset = (curRange?.startContainer === pos.node ? curRange.startOffset : null) ?? pos.node.data.length

        // Delete @query from the text node
        pos.node.deleteData(pos.offset, curOffset - pos.offset)

        // Create insertion range at the deletion point
        const insertRange = document.createRange()
        insertRange.setStart(pos.node, pos.offset)
        insertRange.collapse(true)

        // Build the chip
        const chip = document.createElement('span')
        chip.contentEditable = 'false'
        chip.className = 'mention-chip'
        chip.dataset.mentionId = mention.id
        chip.dataset.mentionType = mention.type
        chip.dataset.mentionName = mention.name
        chip.textContent = `@${mention.name}`

        // Insert chip then a non-breaking space for cursor placement
        insertRange.insertNode(chip)
        const space = document.createTextNode('\u00a0')
        chip.after(space)

        // Move cursor after the space
        const newRange = document.createRange()
        newRange.setStartAfter(space)
        newRange.collapse(true)
        sel.removeAllRanges()
        sel.addRange(newRange)

        setMentionOpen(false)
        atPositionRef.current = null

        const text = getPlainText(el)
        const mentions2 = getChipMentions(el)
        onTextChange(text)
        onMentionsChange(mentions2)
        el.focus()
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            if (mentionOpen) { setMentionOpen(false); setMentionActiveIndex(-1); e.preventDefault() }
            return
        }
        if (mentionOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                const q = mentionQuery.toLowerCase()
                const total = workspaces.filter(w => w.name.toLowerCase().includes(q)).slice(0, 5).length
                    + conversations.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5).length
                if (total > 0) setMentionActiveIndex(prev => (prev + 1) % total)
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                const q = mentionQuery.toLowerCase()
                const total = workspaces.filter(w => w.name.toLowerCase().includes(q)).slice(0, 5).length
                    + conversations.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5).length
                if (total > 0) setMentionActiveIndex(prev => prev <= 0 ? total - 1 : prev - 1)
                return
            }
            if (e.key === 'Enter') {
                e.preventDefault()
                const q = mentionQuery.toLowerCase()
                const filteredWs = workspaces.filter(w => w.name.toLowerCase().includes(q)).slice(0, 5)
                const filteredConvs = conversations.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5)
                const all = [...filteredWs, ...filteredConvs]
                if (mentionActiveIndex >= 0 && all[mentionActiveIndex]) {
                    handleMentionSelect(all[mentionActiveIndex])
                } else {
                    setMentionOpen(false)
                    setMentionActiveIndex(-1)
                }
                return
            }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
        }
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain')
        const el = editorRef.current
        if (!el) return

        // Close dropdown if open
        if (mentionOpen) { setMentionOpen(false); setMentionActiveIndex(-1); atPositionRef.current = null }

        // If no @word pattern, insert as plain text
        if (!/@\w/.test(text)) {
            document.execCommand('insertText', false, text)
            return
        }

        // Try to auto-convert @Name patterns to mention chips
        const allMentionables = [...workspaces, ...conversations]
        const parts: Array<{ type: 'text'; value: string } | { type: 'mention'; mention: Mention }> = []
        const regex = /@(\w+)/g
        let lastIndex = 0
        let match: RegExpExecArray | null

        while ((match = regex.exec(text)) !== null) {
            const found = allMentionables.find(m => m.name.toLowerCase() === match![1].toLowerCase())
            if (found) {
                if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
                parts.push({ type: 'mention', mention: found })
                lastIndex = match.index + match[0].length
            }
        }
        if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) })

        // If no exact matches found, just insert as plain text
        if (!parts.some(p => p.type === 'mention')) {
            document.execCommand('insertText', false, text)
            return
        }

        // Insert chips + text at cursor
        const sel = window.getSelection()
        if (!sel || !sel.rangeCount) { document.execCommand('insertText', false, text); return }

        const range = sel.getRangeAt(0)
        range.deleteContents()
        let lastNode: Node | null = null

        for (const part of parts) {
            if (part.type === 'text') {
                if (!part.value) continue
                const node = document.createTextNode(part.value)
                range.insertNode(node)
                range.setStartAfter(node)
                range.collapse(true)
                lastNode = node
            } else {
                const chip = document.createElement('span')
                chip.contentEditable = 'false'
                chip.className = 'mention-chip'
                chip.dataset.mentionId = part.mention.id
                chip.dataset.mentionType = part.mention.type
                chip.dataset.mentionName = part.mention.name
                chip.textContent = `@${part.mention.name}`
                range.insertNode(chip)
                range.setStartAfter(chip)
                range.collapse(true)
                const space = document.createTextNode('\u00a0')
                range.insertNode(space)
                range.setStartAfter(space)
                range.collapse(true)
                lastNode = space
            }
        }

        if (lastNode) {
            const newRange = document.createRange()
            newRange.setStartAfter(lastNode)
            newRange.collapse(true)
            sel.removeAllRanges()
            sel.addRange(newRange)
        }

        onTextChange(getPlainText(el))
        onMentionsChange(getChipMentions(el))
    }

    return (
        <div className="relative">
            {mentionOpen && (
                <MentionDropdown
                    ref={mentionDropdownRef}
                    query={mentionQuery}
                    workspaces={workspaces}
                    conversations={conversations}
                    onSelect={handleMentionSelect}
                    onClose={() => { setMentionOpen(false); setMentionActiveIndex(-1) }}
                    activeIndex={mentionActiveIndex}
                />
            )}
            <div
                ref={editorRef}
                contentEditable={!disabled}
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                className="mention-editor chat-composer-textarea"
                data-placeholder={disabled ? '' : placeholder}
                style={{ minHeight: '2.6rem' }}
                aria-label={placeholder}
                aria-multiline="true"
                role="textbox"
            />
        </div>
    )
})

// ── @mention dropdown ─────────────────────────────────────────────────────────
const MentionDropdown = React.forwardRef<HTMLDivElement, {
    query: string
    workspaces: Mention[]
    conversations: Mention[]
    onSelect: (m: Mention) => void
    onClose: () => void
    activeIndex: number
}>(function MentionDropdown({ query, workspaces, conversations, onSelect, onClose, activeIndex }, ref) {
    const q = query.toLowerCase()
    const filteredWs = workspaces.filter(w => w.name.toLowerCase().includes(q)).slice(0, 5)
    const filteredConvs = conversations.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5)
    const all = [...filteredWs, ...filteredConvs]
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref && 'current' in ref && ref.current && !ref.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose, ref])

    // Scroll active item into view when navigating with keyboard
    useEffect(() => {
        if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
            itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
        }
    }, [activeIndex])

    if (all.length === 0) return null

    return (
        <div
            ref={ref}
            className="absolute bottom-full left-0 z-[200] mb-2 w-[min(22rem,90vw)] rounded-xl border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-md overflow-hidden max-h-64 overflow-y-auto"
        >
            {filteredWs.length > 0 && (
                <>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40 sticky top-0 bg-popover/95 backdrop-blur-md z-10">Workspaces</div>
                    {filteredWs.map((w, i) => (
                        <button
                            key={w.id}
                            ref={el => { itemRefs.current[i] = el }}
                            type="button"
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${activeIndex === i ? 'bg-muted/60 text-foreground' : 'hover:bg-muted/40'}`}
                            onMouseDown={e => { e.preventDefault(); onSelect(w) }}
                        >
                            <Network className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                            <span className="truncate">{w.name}</span>
                        </button>
                    ))}
                </>
            )}
            {filteredConvs.length > 0 && (
                <>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40 border-t border-t-border/40 sticky top-0 bg-popover/95 backdrop-blur-md z-10">Chats</div>
                    {filteredConvs.map((c, i) => (
                        <button
                            key={c.id}
                            ref={el => { itemRefs.current[filteredWs.length + i] = el }}
                            type="button"
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${activeIndex === filteredWs.length + i ? 'bg-muted/60 text-foreground' : 'hover:bg-muted/40'}`}
                            onMouseDown={e => { e.preventDefault(); onSelect(c) }}
                        >
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{c.name}</span>
                        </button>
                    ))}
                </>
            )}
        </div>
    )
})

// ── Chat message card ───────────────────────────────────────────────────────
function ChatMessageCard({
    message: msg,
    workspaceId,
    requestVisibility,
    mentionMaps,
}: {
    message: Message
    workspaceId: string
    requestVisibility?: (element: HTMLElement | null) => void
    mentionMaps?: MentionResolutionMaps
}) {
    const [contextMenuOpen, setContextMenuOpen] = useState(false)
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        await navigator.clipboard.writeText(msg.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }
    const navigate = useNavigate()
    const generationSeconds = msg.generation_ms && msg.generation_ms > 0
        ? (msg.generation_ms / 1000).toFixed(msg.generation_ms < 10000 ? 1 : 0)
        : null
    const hasWorkflowSteps = msg.role === 'assistant'

    return (
        <ContextMenu onOpenChange={setContextMenuOpen}>
            <ContextMenuTrigger asChild>
                <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`chat-avatar w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${msg.role === 'user' ? 'bg-accent/24 border-accent/35' : 'bg-muted/45 border-border/70'}`}>
                        {msg.role === 'user' ? <User className="w-4 h-4 text-accent" /> : <Bot className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className={`flex flex-col gap-1.5 max-w-[94%] lg:max-w-[86%] xl:max-w-[80%] 2xl:max-w-[76%] rounded-2xl p-1 transition-shadow ${msg.role === 'user' ? 'items-end' : 'items-start'} ${contextMenuOpen
                        ? 'ring-1 ring-accent/55 bg-accent/[0.04] shadow-[0_0_0_3px_hsla(var(--accent)/0.16),0_10px_26px_hsla(194,100%,40%,0.18)]'
                        : ''
                        }`}>
                        {msg.role === 'user' && (
                            <div className="chat-bubble-user px-4 py-3">
                                <div
                                    className="markdown-content text-sm"
                                    dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.content, workspaceId, mentionMaps) }}
                                    onClick={(e) => {
                                        const a = (e.target as HTMLElement).closest('a')
                                        if (a) { const h = a.getAttribute('href'); if (h?.startsWith('/')) { e.preventDefault(); navigate(h) } }
                                    }}
                                />
                                {msg.provider_metadata?.optimize && (
                                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-accent/70" title="Prompt optimization enabled">
                                        <Sparkles className="h-2.5 w-2.5" />
                                        <span>Optimize</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {hasWorkflowSteps && (
                            <div className="chat-workflow-stack w-full">
                                {(msg.timeline?.length ?? 0) > 0 && (
                                    <div className="text-xs text-muted-foreground/40 p-2 text-center">
                                        Timeline view not available
                                    </div>
                                )}
                                <div className="chat-workflow-step chat-workflow-step--iconic chat-workflow-step--response chat-section-reveal">
                                    <div className="chat-workflow-header">
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        <span>Response</span>
                                        {msg.is_interrupted && (
                                            <span className="chat-workflow-status">Interrupted</span>
                                        )}
                                    </div>
                                    <div className="chat-bubble-assistant px-4 py-3">
                                        {msg.content && (
                                            <div
                                                className="markdown-content text-sm"
                                                dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.content, workspaceId, mentionMaps) }}
                                                onClick={(e) => {
                                                    const a = (e.target as HTMLElement).closest('a')
                                                    if (a) { const h = a.getAttribute('href'); if (h?.startsWith('/')) { e.preventDefault(); navigate(h) } }
                                                }}
                                            />
                                        )}
                                        {msg.is_interrupted && (
                                            <span className={`inline-flex items-center gap-1 text-xs text-muted-foreground/50 italic ${msg.content ? 'mt-1' : ''}`}>
                                                …Interrupted
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="chat-workflow-step chat-workflow-step--iconic chat-section-reveal">
                                    <span className="chat-message-meta flex items-center gap-1.5 pl-1 pt-0.5">
                                        {new Date(msg.created_at).toLocaleTimeString()}
                                        {generationSeconds && ` · Took ${generationSeconds}s`}
                                        <button type="button" onClick={handleCopy} className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors" aria-label="Copy message" title="Copy message">
                                            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                        </button>
                                    </span>
                                </div>
                            </div>
                        )}
                        {msg.role !== 'assistant' && (
                            <span className="chat-message-meta flex items-center gap-1.5">
                                <button type="button" onClick={handleCopy} className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors" aria-label="Copy message" title="Copy message">
                                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                                {new Date(msg.created_at).toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={() => navigator.clipboard.writeText(msg.content)} className="gap-2">
                    <Copy className="w-4 h-4" /> Copy Message
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}
