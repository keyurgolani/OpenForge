import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
    getWorkspace,
} from '@/lib/api'
import { useStreamingChat } from '@/hooks/useStreamingChat'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Plus, Send, Loader2, MessageSquare, Trash2, Bot, User,
    ChevronDown, ChevronRight, ChevronLeft, ChevronUp, ExternalLink, Check, Pencil,
    Paperclip, X, Copy, Search, Brain
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator
} from '@/components/ui/context-menu'
import MarkdownIt from 'markdown-it'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })
const MIN_CHAT_LIST_WIDTH = 280
const MAX_CHAT_LIST_WIDTH = 560
const DEFAULT_CHAT_LIST_WIDTH = 320
const CHAT_LIST_COLLAPSED_WIDTH = 56
const CHAT_LIST_WIDTH_STORAGE_KEY = 'openforge.shell.chat.list.width'
const CHAT_LIST_COLLAPSED_STORAGE_KEY = 'openforge.shell.chat.list.collapsed'
const CHAT_STREAMING_SAFE_GAP = 10

const clampChatListWidth = (value: number) =>
    Math.max(MIN_CHAT_LIST_WIDTH, Math.min(MAX_CHAT_LIST_WIDTH, value))

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
    created_at: string
}

interface AttachmentProcessed {
    id: string
    filename: string
    status: string
    pipeline: string
    details?: string
}

interface Conversation {
    id: string
    title: string | null
    title_locked?: boolean
    is_archived?: boolean
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

export default function ChatPage() {
    const { workspaceId = '', conversationId } = useParams<{ workspaceId: string; conversationId?: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const { error: showError } = useToast()
    const [input, setInput] = useState('')
    const [activeCid, setActiveCid] = useState(conversationId ?? null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const streamingMessageRef = useRef<HTMLDivElement>(null)
    const streamingResponseViewportRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const composerShellRef = useRef<HTMLDivElement>(null)
    const [composerHeight, setComposerHeight] = useState(188)
    const [messagesViewportHeight, setMessagesViewportHeight] = useState(0)
    const [chatListWidth, setChatListWidth] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_CHAT_LIST_WIDTH
        const raw = window.localStorage.getItem(CHAT_LIST_WIDTH_STORAGE_KEY)
        const parsed = raw ? parseInt(raw, 10) : NaN
        return Number.isFinite(parsed) ? clampChatListWidth(parsed) : DEFAULT_CHAT_LIST_WIDTH
    })
    const [activeChatRailSection, setActiveChatRailSection] = useState<'conversations' | 'trash' | null>('conversations')
    const [isChatListCollapsed, setIsChatListCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.localStorage.getItem(CHAT_LIST_COLLAPSED_STORAGE_KEY) === '1'
    })
    const shouldRestoreTextareaFocusRef = useRef(false)
    const suppressAutoSelectRef = useRef(false)
    const [stickToBottom, setStickToBottom] = useState(true)

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
    const [streamThinkingExpanded, setStreamThinkingExpanded] = useState(true)
    const [streamResponseExpanded, setStreamResponseExpanded] = useState(false)
    const [streamResponseHasHiddenTop, setStreamResponseHasHiddenTop] = useState(false)

    const { data: workspace } = useQuery({
        queryKey: ['workspace', workspaceId],
        queryFn: () => getWorkspace(workspaceId),
        enabled: !!workspaceId,
    })

    const { data: conversations = [] } = useQuery({
        queryKey: ['conversations', workspaceId],
        queryFn: () => listConversations(workspaceId),
        enabled: !!workspaceId,
    })
    const { data: conversationsWithArchived = [] } = useQuery({
        queryKey: ['conversations', workspaceId, 'archived'],
        queryFn: () => listConversations(workspaceId, { include_archived: true }),
        enabled: !!workspaceId,
    })

    const { data: conversationData } = useQuery({
        queryKey: ['conversation', activeCid],
        queryFn: () => getConversation(workspaceId, activeCid!, { include_archived: true }),
        enabled: !!activeCid,
    })

    const { data: providers = [] } = useQuery({
        queryKey: ['providers'],
        queryFn: listProviders,
    })

    const {
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
    } = useStreamingChat(activeCid)

    const messages: Message[] = conversationData?.messages ?? []
    const activeConversations = useMemo(
        () => (conversations as Conversation[]).filter(conv => !conv.is_archived),
        [conversations]
    )
    const trashedConversations = useMemo(
        () => (conversationsWithArchived as Conversation[]).filter(conv => conv.is_archived),
        [conversationsWithArchived]
    )
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

    // Build model options from providers (provider + enabled model pairs)
    const modelOptions = useMemo(() => {
        const options: ModelOption[] = []
        const seen = new Set<string>()

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
    }, [providers])

    const selectedOption = modelOptions.find(o => o.key === selectedModelKey)
    const filteredModelOptions = useMemo(() => {
        const q = modelPickerQuery.trim().toLowerCase()
        if (!q) return modelOptions
        return modelOptions.filter(opt => opt.searchText.includes(q))
    }, [modelOptions, modelPickerQuery])

    const providerDisplayByName = useMemo(() => {
        const map: Record<string, string> = {}
        for (const provider of providers as ProviderRecord[]) {
            const key = (provider.provider_name || '').trim()
            if (key) map[key] = sanitizeProviderDisplayName(provider.display_name) || key
        }
        return map
    }, [providers])

    // Determine the default model label
    const defaultLabel = useMemo(() => {
        if (!workspace) return 'Default model'
        if (workspace.llm_provider_id) {
            const dp = (providers as ProviderRecord[]).find(p => p.id === workspace.llm_provider_id)
            if (dp) {
                const modelName = workspace.llm_model || dp.default_model || 'provider default'
                return `${sanitizeProviderDisplayName(dp.display_name) || dp.provider_name} · ${modelName} (Workspace default)`
            }
        }
        const sys = (providers as ProviderRecord[]).find(p => p.is_system_default)
        if (sys) return `${sanitizeProviderDisplayName(sys.display_name) || sys.provider_name} · ${sys.default_model || 'provider default'} (System default)`
        return 'Default model'
    }, [workspace, providers])

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
        navigate(`/w/${workspaceId}/chat/${mostRecentConversationId}`, { replace: true })
    }, [activeCid, conversationId, mostRecentConversationId, navigate, workspaceId])

    useEffect(() => {
        setStickToBottom(true)
    }, [activeCid])

    useEffect(() => {
        setStreamThinkingExpanded(true)
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

    useEffect(() => {
        if (!stickToBottom) return
        const container = messagesContainerRef.current
        if (!container) return
        container.scrollTo({ top: container.scrollHeight, behavior: isStreaming ? 'auto' : 'smooth' })
    }, [messages.length, streamingContent, streamingThinking, sources.length, isStreaming, stickToBottom])

    useEffect(() => {
        if (!stickToBottom) return
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
        if (!streamingThinking || !streamingContent) return
        setStreamThinkingExpanded(false)
    }, [streamingThinking, streamingContent])

    useEffect(() => {
        if (!activeCid) return
        const element = composerShellRef.current
        if (!element) return

        const updateHeight = () => {
            setComposerHeight(Math.max(104, Math.ceil(element.getBoundingClientRect().height)))
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
    }, [activeCid, attachments.length, lastError, isConnected, input, modelPickerOpen, uploadingFiles])

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
        const textarea = textareaRef.current
        if (!textarea || textarea.disabled) return false
        textarea.focus({ preventScroll: true })
        const caretPos = textarea.value.length
        textarea.setSelectionRange(caretPos, caretPos)
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
        attachmentsProcessed.length,
        sources.length,
        streamingThinking,
        streamingContent,
        streamThinkingExpanded,
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
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'archived'] })
        scheduleComposerFocus(40)
        setActiveCid(conv.id)
        navigate(`/w/${workspaceId}/chat/${conv.id}`)
    }

    const handleDeleteConv = async (cid: string) => {
        await deleteConversation(workspaceId, cid)
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'archived'] })
        if (activeCid === cid) {
            suppressAutoSelectRef.current = true
            setActiveCid(null)
            navigate(`/w/${workspaceId}/chat`)
        }
    }

    const handleRestoreConv = async (cid: string) => {
        try {
            await updateConversation(workspaceId, cid, { is_archived: false })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'archived'] })
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
        if (!window.confirm('Permanently delete this chat? This cannot be undone.')) return
        try {
            await permanentlyDeleteConversation(workspaceId, cid)
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'archived'] })
            qc.removeQueries({ queryKey: ['conversation', cid], exact: true })
            if (activeCid === cid) {
                suppressAutoSelectRef.current = true
                setActiveCid(null)
                navigate(`/w/${workspaceId}/chat`)
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'Unable to permanently delete conversation.'
            showError('Permanent delete failed', detail)
        }
    }

    const handleSelectConversation = (cid: string) => {
        setActiveChatRailSection('conversations')
        suppressAutoSelectRef.current = false
        scheduleComposerFocus(20)
        setActiveCid(cid)
        navigate(`/w/${workspaceId}/chat/${cid}`)
    }

    const handleSelectTrashedConversation = (cid: string) => {
        setActiveChatRailSection('trash')
        suppressAutoSelectRef.current = false
        setActiveCid(cid)
        navigate(`/w/${workspaceId}/chat/${cid}`)
    }

    const handleSend = async () => {
        if (!input.trim() || isStreaming || uploadingFiles) return
        if (conversationData?.is_archived || activeConversationRecord?.is_archived) {
            showError('Chat is archived', 'Restore this chat from Trash to continue messaging.')
            return
        }
        const msg = input.trim()
        clearLastError()
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
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'archived'] })
            setActiveCid(conv.id)
            navigate(`/w/${workspaceId}/chat/${conv.id}`)
        }

        const override = selectedOption
            ? { provider_id: selectedOption.providerId, model_id: selectedOption.modelId, attachment_ids: attachmentIds }
            : attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : undefined

        const sent = sendMessage(msg, override, targetCid)
        if (!sent) {
            showError('Message not sent', 'Chat socket is disconnected. Wait for reconnect and try again.')
            scheduleComposerFocus()
            return
        }

        pushOptimisticUserMessage(targetCid, msg)
        setInput('')
        if (attachments.length > 0) setAttachments([])
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
        setStreamThinkingExpanded(true)
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
                ['pdf', 'txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)
            )
        })
        setAttachments(prev => [...prev, ...allowed].slice(0, 5)) // Max 5 files
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index))
    }

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (lastError) clearLastError()
        setInput(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
    }

    const handleMessagesScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const el = event.currentTarget
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        setStickToBottom(distanceFromBottom <= 64)
    }

    const handleChatListResizeStart = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        const startX = e.clientX
        const startWidth = chatListWidth
        let currentWidth = startWidth

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = startX - moveEvent.clientX
            currentWidth = clampChatListWidth(startWidth + delta)
            setChatListWidth(currentWidth)
        }

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.localStorage.setItem(CHAT_LIST_WIDTH_STORAGE_KEY, String(currentWidth))
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    const toggleChatListSidebar = () => {
        setIsChatListCollapsed(prev => {
            const next = !prev
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(CHAT_LIST_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
            }
            return next
        })
    }

    const activeConversationIsArchived = Boolean(conversationData?.is_archived || activeConversationRecord?.is_archived)
    const composerDisabled = isStreaming || uploadingFiles || activeConversationIsArchived
    const streamingModelLabel = selectedOption?.label ?? defaultLabel
    const streamingBubbleMaxHeight = useMemo(() => {
        if (messagesViewportHeight <= 0) return 280
        return Math.max(180, Math.floor(messagesViewportHeight * 0.5))
    }, [messagesViewportHeight])
    const isConversationsSectionExpanded = activeChatRailSection === 'conversations'
    const isTrashSectionExpanded = activeChatRailSection === 'trash'
    const toggleChatRailSection = (section: 'conversations' | 'trash') => {
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
                                {messages.map((msg, index) => {
                                    const previousMessage = index > 0 ? messages[index - 1] : undefined
                                    const previousUserAttachments = (
                                        msg.role === 'assistant' &&
                                        previousMessage?.role === 'user' &&
                                        Array.isArray(previousMessage.attachments_processed)
                                    )
                                        ? previousMessage.attachments_processed
                                        : []

                                    return (
                                        <ChatMessageCard
                                            key={msg.id}
                                            message={msg}
                                            workspaceId={workspaceId}
                                            thinking={thinkingByMessageId[msg.id] ?? msg.thinking ?? undefined}
                                            providerDisplayByName={providerDisplayByName}
                                            requestVisibility={ensureExpandedBlockVisible}
                                            attachmentsProcessed={previousUserAttachments}
                                        />
                                    )
                                })}
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
                                                {attachmentsProcessed.length > 0 && (
                                                    <div className="chat-workflow-step">
                                                        <div className="glass-card chat-section-reveal px-4 py-3">
                                                            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                                {`Processed ${attachmentsProcessed.length} Attachment${attachmentsProcessed.length === 1 ? '' : 's'}`}
                                                            </div>
                                                            <div className="space-y-2">
                                                                {attachmentsProcessed.map(att => (
                                                                    <div key={att.id} className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-xs">
                                                                        <div className="mb-1 flex items-center justify-between gap-2">
                                                                            <span className="truncate font-medium text-foreground/90">{att.filename}</span>
                                                                            <span className={`text-[10px] ${att.status === 'processed' ? 'text-emerald-300' : att.status === 'deferred' ? 'text-amber-300' : 'text-muted-foreground'}`}>
                                                                                {att.pipeline}
                                                                            </span>
                                                                        </div>
                                                                        {att.details && (
                                                                            <p className="text-[11px] text-muted-foreground">{att.details}</p>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                {sources.length > 0 && (
                                                    <div className="chat-workflow-step">
                                                        <div className="glass-card chat-section-reveal px-4 py-3">
                                                            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                                Sources
                                                            </div>
                                                            <div className="space-y-2">
                                                                {sources.map(src => (
                                                                    <div key={src.knowledge_id} className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
                                                                        <div className="mb-1 flex items-center justify-between gap-2">
                                                                            <span className="truncate text-xs font-medium text-foreground/90">{src.title}</span>
                                                                            <span className="text-[10px] text-muted-foreground">{Math.round(src.score * 100)}%</span>
                                                                        </div>
                                                                        <div
                                                                            className="markdown-content max-h-20 overflow-hidden text-xs leading-relaxed text-muted-foreground [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1 [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_pre]:text-[11px] [&_code]:text-[11px]"
                                                                            dangerouslySetInnerHTML={{ __html: md.render(src.snippet || '') }}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                {streamingModelLabel && (
                                                    <div className="chat-workflow-step chat-section-reveal">
                                                        <div className="chat-llm-inline">
                                                            <Bot className="h-3.5 w-3.5" />
                                                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">LLM</span>
                                                            <span className="text-accent/65">·</span>
                                                            <span className="truncate">{streamingModelLabel}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                {streamingThinking && (
                                                    <div className="chat-workflow-step">
                                                        <div className="chat-section-reveal rounded-2xl border border-accent/25 bg-accent/8 px-4 py-3">
                                                            <button
                                                                type="button"
                                                                className="mb-1.5 flex w-full items-center gap-1.5 text-left text-[11px] uppercase tracking-wide text-accent/90"
                                                                onClick={() => {
                                                                    setStreamThinkingExpanded(prev => {
                                                                        const next = !prev
                                                                        if (next) {
                                                                            window.requestAnimationFrame(() => {
                                                                                window.requestAnimationFrame(() => {
                                                                                    ensureExpandedBlockVisible(streamingMessageRef.current)
                                                                                })
                                                                            })
                                                                            window.setTimeout(() => {
                                                                                ensureExpandedBlockVisible(streamingMessageRef.current)
                                                                            }, 220)
                                                                        }
                                                                        return next
                                                                    })
                                                                }}
                                                                aria-label={streamThinkingExpanded ? 'Collapse thinking' : 'Expand thinking'}
                                                            >
                                                                {streamThinkingExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                                <Brain className="h-3.5 w-3.5" />
                                                                {streamThinkingExpanded ? 'Thinking' : 'Thought'}
                                                            </button>
                                                            <div className={`chat-collapse ${streamThinkingExpanded ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                                                                <div className="chat-collapse-inner">
                                                                    <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                                                                        {streamingThinking}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className={`chat-workflow-step chat-section-reveal ${streamingContent ? 'chat-workflow-step-live' : ''}`}>
                                                    <div className="chat-workflow-header">
                                                        <MessageSquare className="h-3.5 w-3.5" />
                                                        <span>Response</span>
                                                        <span className="chat-workflow-status">{streamingContent ? 'Streaming' : 'Preparing'}</span>
                                                    </div>
                                                    {streamingContent && (
                                                        <div className="chat-bubble-assistant relative mt-1.5 px-4 py-3">
                                                            {!streamResponseExpanded && streamResponseHasHiddenTop && (
                                                                <>
                                                                    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-10 rounded-t-2xl bg-gradient-to-b from-card/92 via-card/66 to-transparent" />
                                                                    <div className="pointer-events-none absolute left-4 top-1.5 z-[2] text-[10px] uppercase tracking-wide text-muted-foreground/85">
                                                                        Earlier streamed text folded above
                                                                    </div>
                                                                </>
                                                            )}
                                                            {!streamResponseExpanded && streamResponseHasHiddenTop && (
                                                                <button
                                                                    type="button"
                                                                    className="absolute right-3 top-0 z-[3] -translate-y-1/2 rounded-full border border-accent/35 bg-card/95 p-1 text-accent hover:border-accent/60 hover:text-accent/90"
                                                                    onClick={() => {
                                                                        setStreamResponseExpanded(true)
                                                                        window.requestAnimationFrame(() => {
                                                                            ensureExpandedBlockVisible(streamingMessageRef.current, 'auto')
                                                                        })
                                                                    }}
                                                                    aria-label="Expand streaming response"
                                                                    title="Show full response while streaming"
                                                                >
                                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}
                                                            <div
                                                                ref={streamingResponseViewportRef}
                                                                onScroll={handleStreamingBubbleScroll}
                                                                className={`min-h-0 ${streamResponseExpanded ? 'overflow-visible' : 'overflow-y-auto'}`}
                                                                style={streamResponseExpanded ? undefined : { maxHeight: `${streamingBubbleMaxHeight}px` }}
                                                            >
                                                                <div className="markdown-content streaming-cursor" dangerouslySetInnerHTML={{ __html: md.render(streamingContent) }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div ref={composerShellRef} className="chat-composer-shell pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 py-2 md:px-6 md:py-3">
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

                                    <textarea
                                        ref={textareaRef}
                                        className="chat-composer-textarea"
                                        rows={1}
                                        value={input}
                                        onChange={handleTextareaChange}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleSend()
                                            }
                                        }}
                                        disabled={composerDisabled}
                                        placeholder={activeConversationIsArchived ? 'Restore this chat to continue messaging...' : 'Ask a question about your knowledge...'}
                                        style={{ maxHeight: '160px' }}
                                    />

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
                                                        <span className="max-w-[220px] truncate">{selectedOption?.label ?? defaultLabel}</span>
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
                                                accept=".pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml,.png,.jpg,.jpeg,.gif,.webp,image/*,text/*,application/pdf"
                                                className="hidden"
                                                onChange={handleFileSelect}
                                            />
                                            <button
                                                type="button"
                                                className="chat-control-pill disabled:opacity-50"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={composerDisabled || attachments.length >= 5}
                                                title="Attach files (PDF, images, text)"
                                            >
                                                <Paperclip className="h-3.5 w-3.5" />
                                                Attach
                                                {attachments.length > 0 && (
                                                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{attachments.length}</span>
                                                )}
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            className="chat-send-button disabled:cursor-not-allowed disabled:opacity-50"
                                            onClick={handleSend}
                                            disabled={composerDisabled || !input.trim()}
                                        >
                                            {uploadingFiles || isStreaming ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Send className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Conversation list rail (right edge, similar to workspace insights position) */}
            <aside
                className="relative z-10 flex-shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card/28 py-4 flex flex-col transition-[width] duration-200 ease-out"
                style={{ width: isChatListCollapsed ? `${CHAT_LIST_COLLAPSED_WIDTH}px` : `${chatListWidth}px` }}
            >
                {!isChatListCollapsed && (
                    <button
                        type="button"
                        onMouseDown={handleChatListResizeStart}
                        className="absolute -left-1 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-accent/25 active:bg-accent/35 transition-colors hidden md:block"
                        aria-label="Resize chat list sidebar"
                        title="Drag to resize"
                    />
                )}

                {isChatListCollapsed ? (
                    <div className="h-full flex flex-col items-center gap-3 px-2 py-2">
                        <button
                            type="button"
                            onClick={toggleChatListSidebar}
                            className="w-8 h-8 rounded-lg border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                            aria-label="Expand conversations sidebar"
                            title="Expand conversations"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={handleNewChat}
                            className="w-8 h-8 rounded-lg border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                            aria-label="Create new chat"
                            title="New chat"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                        <div className="w-6 h-px bg-border/70" />
                        <MessageSquare className="w-4 h-4 text-accent mt-1" />
                        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                            Chats
                        </span>
                        <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-1 text-[10px] font-semibold text-foreground/90">
                            {activeConversations.length}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="px-4">
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-accent" />
                                        <h3 className="font-semibold text-sm tracking-tight">Chat Threads</h3>
                                    </div>
                                    <p className="text-xs text-muted-foreground/90">Active and Trashed chat threads for this workspace.</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="flex-shrink-0 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                        {activeConversations.length + trashedConversations.length}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={toggleChatListSidebar}
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
                                        <button className="btn-primary w-full justify-center text-sm py-2" onClick={handleNewChat}>
                                            <Plus className="w-4 h-4" /> New Chat
                                        </button>
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
                                                        onRename={(title) => updateConversation(workspaceId, c.id, { title, title_locked: true }).then(() => {
                                                            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
                                                            qc.invalidateQueries({ queryKey: ['conversations', workspaceId, 'archived'] })
                                                        })}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>

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
                                    <div className="mt-2 min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-1">
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
                                                />
                                            ))
                                        )}
                                    </div>
                                )}
                            </section>
                        </div>
                    </>
                )}
            </aside>
        </div>
    )
}

// ── Conversation row with inline rename ─────────────────────────────────────
function ConversationRow({ conv, active, workspaceId, onSelect, onDelete, onRename }: {
    conv: Conversation; active: boolean; workspaceId: string
    onSelect: () => void; onDelete: () => void; onRename: (title: string) => void
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(conv.title ?? '')
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
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                        <button
                            className="btn-ghost h-6 w-6 p-0 justify-center"
                            onClick={startEdit}
                            title="Rename chat"
                            aria-label="Rename chat"
                        >
                            <Pencil className="w-2.5 h-2.5" />
                        </button>
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
                <ContextMenuItem
                    onSelect={(e) => {
                        e.preventDefault()
                        openRename()
                    }}
                    className="gap-2"
                >
                    <Pencil className="w-4 h-4" /> Rename Chat
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onSelect={(e) => {
                        e.preventDefault()
                        onDelete()
                    }}
                    className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10"
                >
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
}: {
    conv: Conversation
    active: boolean
    onSelect: () => void
    onRestore: () => void
    onPermanentDelete: () => void
}) {
    return (
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
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onRestore()
                }}
                className="btn-ghost h-6 px-2 py-0 text-[10px] rounded-md"
                aria-label="Restore chat"
            >
                Restore
            </button>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    onPermanentDelete()
                }}
                className="btn-ghost h-6 w-6 p-0 justify-center text-red-400 hover:bg-red-500/10"
                aria-label="Delete permanently"
                title="Delete permanently"
            >
                <Trash2 className="w-3 h-3" />
            </button>
        </div>
    )
}

// ── Chat message card ───────────────────────────────────────────────────────
function ChatMessageCard({
    message: msg,
    workspaceId,
    thinking,
    providerDisplayByName,
    requestVisibility,
    attachmentsProcessed = [],
}: {
    message: Message
    workspaceId: string
    thinking?: string
    providerDisplayByName?: Record<string, string>
    requestVisibility?: (element: HTMLElement | null) => void
    attachmentsProcessed?: AttachmentProcessed[]
}) {
    const [attachmentsOpen, setAttachmentsOpen] = useState(false)
    const [sourcesOpen, setSourcesOpen] = useState(false)
    const [thinkingOpen, setThinkingOpen] = useState(false)
    const [contextMenuOpen, setContextMenuOpen] = useState(false)
    const attachmentsBlockRef = useRef<HTMLDivElement>(null)
    const sourcesBlockRef = useRef<HTMLDivElement>(null)
    const thinkingBlockRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()
    const hasThinking = !!thinking?.trim()
    const generationSeconds = msg.generation_ms && msg.generation_ms > 0
        ? (msg.generation_ms / 1000).toFixed(msg.generation_ms < 10000 ? 1 : 0)
        : null
    const providerText = msg.provider_used
        ? sanitizeProviderDisplayName(providerDisplayByName?.[msg.provider_used] || msg.provider_used)
        : null
    const modelText = msg.model_used?.trim() || null
    const modelLabel = providerText && modelText
        ? `${providerText} · ${modelText}`
        : (modelText || providerText)
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
                                <p className="text-sm">{msg.content}</p>
                            </div>
                        )}
                        {hasWorkflowSteps && (
                            <div className="chat-workflow-stack w-full">
                                {attachmentsProcessed.length > 0 && (
                                    <div className="chat-workflow-step">
                                        <button
                                            className="chat-subsection-toggle"
                                            onClick={() => {
                                                setAttachmentsOpen(prev => {
                                                    const next = !prev
                                                    if (next) {
                                                        window.requestAnimationFrame(() => {
                                                            window.requestAnimationFrame(() => {
                                                                requestVisibility?.(attachmentsBlockRef.current)
                                                            })
                                                        })
                                                        window.setTimeout(() => {
                                                            requestVisibility?.(attachmentsBlockRef.current)
                                                        }, 220)
                                                    }
                                                    return next
                                                })
                                            }}
                                        >
                                            {attachmentsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                            {`Processed ${attachmentsProcessed.length} Attachment${attachmentsProcessed.length === 1 ? '' : 's'}`}
                                        </button>
                                        <div ref={attachmentsBlockRef} className={`chat-collapse w-full ${attachmentsOpen ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                                            <div className="chat-collapse-inner">
                                                <div className="chat-section-reveal space-y-2 w-full pt-0.5">
                                                    {attachmentsProcessed.map(att => (
                                                        <div key={att.id} className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-xs">
                                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                                <span className="truncate font-medium text-foreground/90">{att.filename}</span>
                                                                <span className={`text-[10px] ${att.status === 'processed' ? 'text-emerald-300' : att.status === 'deferred' ? 'text-amber-300' : 'text-muted-foreground'}`}>
                                                                    {att.pipeline}
                                                                </span>
                                                            </div>
                                                            {att.details && (
                                                                <p className="text-[11px] text-muted-foreground">{att.details}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {msg.context_sources && msg.context_sources.length > 0 && (
                                    <div className="chat-workflow-step">
                                        <button
                                            className="chat-subsection-toggle"
                                            onClick={() => {
                                                setSourcesOpen(prev => {
                                                    const next = !prev
                                                    if (next) {
                                                        window.requestAnimationFrame(() => {
                                                            window.requestAnimationFrame(() => {
                                                                requestVisibility?.(sourcesBlockRef.current)
                                                            })
                                                        })
                                                        window.setTimeout(() => {
                                                            requestVisibility?.(sourcesBlockRef.current)
                                                        }, 220)
                                                    }
                                                    return next
                                                })
                                            }}
                                        >
                                            {sourcesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                            {`Used ${msg.context_sources.length} Knowledge ${msg.context_sources.length === 1 ? 'Record' : 'Records'}`}
                                        </button>
                                        <div ref={sourcesBlockRef} className={`chat-collapse w-full ${sourcesOpen ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                                            <div className="chat-collapse-inner">
                                                <div className="chat-section-reveal space-y-2 w-full pt-0.5">
                                                    {msg.context_sources.map(src => (
                                                        <div key={src.knowledge_id} className="chat-source-card p-3 text-xs group">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-medium text-foreground">{src.title}</span>
                                                                <button className="opacity-0 group-hover:opacity-100 text-accent" onClick={() => navigate(`/w/${workspaceId}/knowledge/${src.knowledge_id}`)}>
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                            <div
                                                                className="markdown-content max-h-20 overflow-hidden text-xs leading-relaxed text-muted-foreground [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1 [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_pre]:text-[11px] [&_code]:text-[11px]"
                                                                dangerouslySetInnerHTML={{ __html: md.render(src.snippet || '') }}
                                                            />
                                                            <div className="mt-1.5 flex items-center gap-1">
                                                                <div className="flex-1 h-1 rounded bg-border overflow-hidden">
                                                                    <div className="h-full bg-accent rounded" style={{ width: `${Math.round(src.score * 100)}%` }} />
                                                                </div>
                                                                <span className="text-muted-foreground">{Math.round(src.score * 100)}%</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {modelLabel && (
                                    <div className="chat-workflow-step chat-section-reveal">
                                        <div className="chat-llm-inline">
                                            <Bot className="h-3.5 w-3.5" />
                                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">LLM</span>
                                            <span className="text-accent/65">·</span>
                                            <span className="truncate">{modelLabel}</span>
                                        </div>
                                    </div>
                                )}
                                {hasThinking && (
                                    <div className="chat-workflow-step">
                                        <button
                                            className="chat-subsection-toggle"
                                            onClick={() => {
                                                setThinkingOpen(prev => {
                                                    const next = !prev
                                                    if (next) {
                                                        window.requestAnimationFrame(() => {
                                                            window.requestAnimationFrame(() => {
                                                                requestVisibility?.(thinkingBlockRef.current)
                                                            })
                                                        })
                                                        window.setTimeout(() => {
                                                            requestVisibility?.(thinkingBlockRef.current)
                                                        }, 220)
                                                    }
                                                    return next
                                                })
                                            }}
                                        >
                                            {thinkingOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                            <Brain className="w-3 h-3" />
                                            {thinkingOpen ? 'Thinking' : 'Thought'}
                                        </button>
                                        <div ref={thinkingBlockRef} className={`chat-collapse w-full ${thinkingOpen ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                                            <div className="chat-collapse-inner">
                                                <div className="chat-section-reveal w-full rounded-2xl border border-accent/20 bg-accent/6 px-4 py-3">
                                                    <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                                                        {thinking}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div className="chat-workflow-step chat-section-reveal">
                                    <div className="chat-workflow-header">
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        <span>Response</span>
                                    </div>
                                    <div className="chat-bubble-assistant mt-1.5 px-4 py-3">
                                        <div className="markdown-content text-sm" dangerouslySetInnerHTML={{ __html: md.render(msg.content) }} />
                                    </div>
                                </div>
                                <div className="chat-workflow-step chat-section-reveal">
                                    <span className="chat-message-meta">
                                        {new Date(msg.created_at).toLocaleTimeString()}
                                        {generationSeconds && ` · Took ${generationSeconds}s`}
                                    </span>
                                </div>
                            </div>
                        )}
                        {msg.role !== 'assistant' && (
                            <span className="chat-message-meta">
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
