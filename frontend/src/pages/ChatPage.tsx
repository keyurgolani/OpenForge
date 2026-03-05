import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listConversations, createConversation, getConversation, deleteConversation, updateConversation, listProviders, getWorkspace } from '@/lib/api'
import { useStreamingChat } from '@/hooks/useStreamingChat'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Plus, Send, Loader2, MessageSquare, Trash2, Bot, User,
    ChevronDown, ChevronRight, ChevronLeft, ExternalLink, Check, Pencil,
    Paperclip, X, Copy, Search, Brain
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator
} from '@/components/ui/context-menu'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })
const MIN_CHAT_LIST_WIDTH = 280
const MAX_CHAT_LIST_WIDTH = 560
const DEFAULT_CHAT_LIST_WIDTH = 320
const CHAT_LIST_COLLAPSED_WIDTH = 56
const CHAT_LIST_WIDTH_STORAGE_KEY = 'openforge.shell.chat.list.width'
const CHAT_LIST_COLLAPSED_STORAGE_KEY = 'openforge.shell.chat.list.collapsed'

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
    context_sources?: { note_id: string; title: string; snippet: string; score: number }[]
    created_at: string
}

interface Conversation {
    id: string
    title: string | null
    title_locked?: boolean
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
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [chatListWidth, setChatListWidth] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_CHAT_LIST_WIDTH
        const raw = window.localStorage.getItem(CHAT_LIST_WIDTH_STORAGE_KEY)
        const parsed = raw ? parseInt(raw, 10) : NaN
        return Number.isFinite(parsed) ? clampChatListWidth(parsed) : DEFAULT_CHAT_LIST_WIDTH
    })
    const [isChatListCollapsed, setIsChatListCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.localStorage.getItem(CHAT_LIST_COLLAPSED_STORAGE_KEY) === '1'
    })
    const shouldRestoreTextareaFocusRef = useRef(false)
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

    const { data: conversationData } = useQuery({
        queryKey: ['conversation', activeCid],
        queryFn: () => getConversation(workspaceId, activeCid!),
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
        sources,
        sendMessage,
        isConnected,
        lastError,
        clearLastError,
        thinkingByMessageId,
    } = useStreamingChat(activeCid)

    const messages: Message[] = conversationData?.messages ?? []

    // Build model options from providers (provider + enabled model pairs)
    const modelOptions = useMemo(() => {
        const options: ModelOption[] = []
        const seen = new Set<string>()

        for (const provider of providers as ProviderRecord[]) {
            const enabled = provider.enabled_models ?? []
            const candidateModels = enabled.length > 0
                ? enabled
                : (provider.default_model ? [{ id: provider.default_model, name: provider.default_model }] : [])

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
                    providerLabel: provider.display_name,
                    modelLabel: modelName,
                    label: `${provider.display_name} · ${modelName}`,
                    searchText: `${provider.display_name} ${provider.provider_name} ${modelName} ${modelId}`.toLowerCase(),
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
            if (key) map[key] = provider.display_name
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
                return `${dp.display_name} · ${modelName} (Workspace default)`
            }
        }
        const sys = (providers as ProviderRecord[]).find(p => p.is_system_default)
        if (sys) return `${sys.display_name} · ${sys.default_model || 'provider default'} (System default)`
        return 'Default model'
    }, [workspace, providers])

    useEffect(() => {
        if (conversationId !== activeCid) setActiveCid(conversationId ?? null)
    }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setStickToBottom(true)
    }, [activeCid])

    useEffect(() => {
        setStreamThinkingExpanded(true)
    }, [activeCid])

    useEffect(() => {
        if (!stickToBottom) return
        const container = messagesContainerRef.current
        if (!container) return
        container.scrollTo({ top: container.scrollHeight, behavior: streamingContent ? 'auto' : 'smooth' })
    }, [messages.length, streamingContent, stickToBottom])

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

    const focusComposer = () => {
        const textarea = textareaRef.current
        if (!textarea || textarea.disabled) return false
        textarea.focus({ preventScroll: true })
        const caretPos = textarea.value.length
        textarea.setSelectionRange(caretPos, caretPos)
        return true
    }

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
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
        setActiveCid(conv.id)
        navigate(`/w/${workspaceId}/chat/${conv.id}`)
    }

    const handleDeleteConv = async (cid: string) => {
        await deleteConversation(workspaceId, cid)
        qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
        if (activeCid === cid) {
            setActiveCid(null)
            navigate(`/w/${workspaceId}/chat`)
        }
    }

    const handleSend = async () => {
        if (!input.trim() || isStreaming || uploadingFiles) return
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
                focusComposer()
                return
            } finally {
                setUploadingFiles(false)
            }
        }

        let targetCid = activeCid
        if (!targetCid) {
            const conv = await createConversation(workspaceId)
            targetCid = conv.id
            qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
            setActiveCid(conv.id)
            navigate(`/w/${workspaceId}/chat/${conv.id}`)
        }

        const override = selectedOption
            ? { provider_id: selectedOption.providerId, model_id: selectedOption.modelId, attachment_ids: attachmentIds }
            : attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : undefined

        const sent = sendMessage(msg, override, targetCid)
        if (!sent) {
            showError('Message not sent', 'Chat socket is disconnected. Wait for reconnect and try again.')
            focusComposer()
            return
        }

        pushOptimisticUserMessage(targetCid, msg)
        setInput('')
        if (attachments.length > 0) setAttachments([])
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
        setStreamThinkingExpanded(true)
        shouldRestoreTextareaFocusRef.current = true
        focusComposer()
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

    const hasStreamingPayload = Boolean(streamingThinking || streamingContent)

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
                            <p className="text-muted-foreground text-sm mb-4">Ask questions about your notes or anything else.</p>
                            <button className="btn-primary" onClick={handleNewChat}>
                                <Plus className="w-4 h-4" /> New Chat
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div
                            ref={messagesContainerRef}
                            className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4"
                            onScroll={handleMessagesScroll}
                        >
                            {messages.map(msg => (
                                <ChatMessageCard
                                    key={msg.id}
                                    message={msg}
                                    workspaceId={workspaceId}
                                    thinking={thinkingByMessageId[msg.id] ?? msg.thinking ?? undefined}
                                    providerDisplayByName={providerDisplayByName}
                                />
                            ))}
                            {isStreaming && (
                                <div className="flex gap-3">
                                    <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-1">
                                        <Bot className="w-4 h-4 text-accent" />
                                    </div>
                                    <div className="max-w-[92%] lg:max-w-[84%] xl:max-w-[78%] 2xl:max-w-[72%] space-y-2">
                                        <div className="agent-generation-pill">
                                            <span className="agent-generation-orb" aria-hidden />
                                            Agent generating response...
                                        </div>
                                        {!hasStreamingPayload && (
                                            <div className="glass-card px-4 py-3 text-sm text-muted-foreground/90">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent/70" />
                                                    Preparing the response
                                                </span>
                                            </div>
                                        )}
                                        {sources.length > 0 && (
                                            <div className="glass-card px-4 py-3">
                                                <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                    Sources
                                                </div>
                                                <div className="space-y-2">
                                                    {sources.map(src => (
                                                        <div key={src.note_id} className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2">
                                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                                <span className="truncate text-xs font-medium text-foreground/90">{src.title}</span>
                                                                <span className="text-[10px] text-muted-foreground">{Math.round(src.score * 100)}%</span>
                                                            </div>
                                                            <p className="line-clamp-2 text-xs text-muted-foreground">{src.snippet}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {streamingThinking && (
                                            <div className="rounded-2xl border border-accent/25 bg-accent/8 px-4 py-3">
                                                <button
                                                    type="button"
                                                    className="mb-1.5 flex w-full items-center gap-1.5 text-left text-[11px] uppercase tracking-wide text-accent/90"
                                                    onClick={() => setStreamThinkingExpanded(prev => !prev)}
                                                    aria-label={streamThinkingExpanded ? 'Collapse thinking' : 'Expand thinking'}
                                                >
                                                    {streamThinkingExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                    <Brain className="h-3.5 w-3.5" />
                                                    Thinking
                                                </button>
                                                {streamThinkingExpanded && (
                                                    <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                                                        {streamingThinking}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {streamingContent && (
                                            <div className="glass-card px-4 py-3">
                                                <div className="markdown-content streaming-cursor" dangerouslySetInnerHTML={{ __html: md.render(streamingContent) }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input area */}
                        <div className="border-t border-border/45 px-4 py-4 md:px-6 md:py-5">
                            {activeCid && !isConnected && (
                                <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-300">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Reconnecting to server…
                                </p>
                            )}
                            {lastError && (
                                <div className="mb-3 flex items-start justify-between gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
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

                            <div className="rounded-2xl border border-border/70 bg-[linear-gradient(160deg,hsla(222,35%,18%,0.62),hsla(223,35%,11%,0.78))] px-3 py-3 shadow-[0_14px_28px_hsla(225,65%,5%,0.34)] md:px-4">
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
                                    className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/80"
                                    rows={1}
                                    placeholder="Ask a question about your notes..."
                                    value={input}
                                    onChange={handleTextareaChange}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleSend()
                                        }
                                    }}
                                    disabled={isStreaming || uploadingFiles}
                                    style={{ maxHeight: '160px' }}
                                />

                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {modelOptions.length > 0 && (
                                            <div ref={modelPickerRef} className="relative">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/35 hover:text-foreground"
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
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/35 hover:text-foreground disabled:opacity-50"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isStreaming || uploadingFiles || attachments.length >= 5}
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
                                        className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-accent/45 bg-accent/90 px-3 text-accent-foreground shadow-[0_10px_24px_hsla(194,100%,44%,0.35)] transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                                        onClick={handleSend}
                                        disabled={isStreaming || uploadingFiles || !input.trim()}
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
                            {(conversations as Conversation[]).length}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="px-4">
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-accent" />
                                        <h3 className="font-semibold text-sm tracking-tight">Conversations</h3>
                                    </div>
                                    <p className="text-xs text-muted-foreground/90">Recent workspace chats and context trails.</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="flex-shrink-0 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                        {(conversations as Conversation[]).length}
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

                            <button className="btn-primary w-full justify-center text-sm py-2" onClick={handleNewChat}>
                                <Plus className="w-4 h-4" /> New Chat
                            </button>
                        </div>

                        <div className="my-4 border-t border-border/50" />

                        <div className="flex-1 overflow-y-auto px-2 pb-2">
                            {(conversations as Conversation[]).length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-8 px-4">No conversations yet. Start a new chat!</p>
                            )}
                            {(conversations as Conversation[]).map(c => (
                                <ConversationRow
                                    key={c.id}
                                    conv={c}
                                    active={activeCid === c.id}
                                    workspaceId={workspaceId}
                                    onSelect={() => { setActiveCid(c.id); navigate(`/w/${workspaceId}/chat/${c.id}`) }}
                                    onDelete={() => handleDeleteConv(c.id)}
                                    onRename={(title) => updateConversation(workspaceId, c.id, { title, title_locked: true }).then(() => qc.invalidateQueries({ queryKey: ['conversations', workspaceId] }))}
                                />
                            ))}
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

    const startEdit = (e: React.MouseEvent) => {
        e.stopPropagation(); setDraft(conv.title ?? ''); setEditing(true)
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
    }

    const commitEdit = () => {
        if (draft.trim() && draft.trim() !== conv.title) onRename(draft.trim())
        setEditing(false)
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    className={`group flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${active
                        ? 'border-accent/35 bg-accent/12'
                        : 'border-transparent hover:border-border/60 hover:bg-muted/35'
                        }`}
                    onClick={onSelect}
                >
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                        {editing ? (
                            <input
                                ref={inputRef}
                                className="w-full text-xs bg-background border border-accent/40 rounded px-1 py-0.5 outline-none"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
                                onClick={e => e.stopPropagation()}
                            />
                        ) : (
                            <p className="text-xs font-medium truncate">{conv.title ?? 'New Chat'}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{conv.message_count} messages</p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                        <button className="btn-ghost p-1" onClick={startEdit} title="Rename">
                            <Pencil className="w-3 h-3" />
                        </button>
                        <button className="btn-ghost p-1" onClick={e => { e.stopPropagation(); onDelete() }}>
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={(e: any) => { e.stopPropagation(); startEdit(e) }} className="gap-2">
                    <Pencil className="w-4 h-4" /> Rename Chat
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={(e: any) => { e.stopPropagation(); onDelete() }} className="gap-2 text-red-500 focus:text-red-400 focus:bg-red-500/10">
                    <Trash2 className="w-4 h-4" /> Delete Chat
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    )
}

// ── Chat message card ───────────────────────────────────────────────────────
function ChatMessageCard({
    message: msg,
    workspaceId,
    thinking,
    providerDisplayByName,
}: {
    message: Message
    workspaceId: string
    thinking?: string
    providerDisplayByName?: Record<string, string>
}) {
    const [sourcesOpen, setSourcesOpen] = useState(false)
    const [thinkingOpen, setThinkingOpen] = useState(false)
    const navigate = useNavigate()
    const hasThinking = !!thinking?.trim()
    const generationSeconds = msg.generation_ms && msg.generation_ms > 0
        ? (msg.generation_ms / 1000).toFixed(msg.generation_ms < 10000 ? 1 : 0)
        : null
    const providerText = msg.provider_used
        ? (providerDisplayByName?.[msg.provider_used] || msg.provider_used)
        : null
    const modelText = msg.model_used?.trim() || null
    const modelLabel = providerText && modelText
        ? `${providerText} · ${modelText}`
        : (modelText || providerText)

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${msg.role === 'user' ? 'bg-accent/30' : 'bg-muted/60'}`}>
                        {msg.role === 'user' ? <User className="w-4 h-4 text-accent" /> : <Bot className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-[92%] lg:max-w-[84%] xl:max-w-[78%] 2xl:max-w-[72%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {msg.role === 'user' && (
                            <div className="px-4 py-3 rounded-2xl bg-accent/20 border border-accent/30">
                                <p className="text-sm">{msg.content}</p>
                            </div>
                        )}
                        {msg.role === 'assistant' && msg.context_sources && msg.context_sources.length > 0 && (
                            <button
                                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                                onClick={() => setSourcesOpen(p => !p)}
                            >
                                {sourcesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                {msg.context_sources.length} source{msg.context_sources.length !== 1 ? 's' : ''} used
                            </button>
                        )}
                        {sourcesOpen && msg.context_sources && (
                            <div className="space-y-2 w-full">
                                {msg.context_sources.map(src => (
                                    <div key={src.note_id} className="glass-card p-3 text-xs group">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium text-foreground">{src.title}</span>
                                            <button className="opacity-0 group-hover:opacity-100 text-accent" onClick={() => navigate(`/w/${workspaceId}/notes/${src.note_id}`)}>
                                                <ExternalLink className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <p className="text-muted-foreground line-clamp-2">{src.snippet}</p>
                                        <div className="mt-1.5 flex items-center gap-1">
                                            <div className="flex-1 h-1 rounded bg-border overflow-hidden">
                                                <div className="h-full bg-accent rounded" style={{ width: `${Math.round(src.score * 100)}%` }} />
                                            </div>
                                            <span className="text-muted-foreground">{Math.round(src.score * 100)}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {msg.role === 'assistant' && hasThinking && (
                            <button
                                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                                onClick={() => setThinkingOpen(p => !p)}
                            >
                                {thinkingOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                <Brain className="w-3 h-3" />
                                Thinking
                            </button>
                        )}
                        {msg.role === 'assistant' && hasThinking && thinkingOpen && (
                            <div className="w-full rounded-2xl border border-accent/20 bg-accent/6 px-4 py-3">
                                <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                                    {thinking}
                                </div>
                            </div>
                        )}
                        {msg.role === 'assistant' && (
                            <div className="px-4 py-3 rounded-2xl glass-card">
                                <div className="markdown-content text-sm" dangerouslySetInnerHTML={{ __html: md.render(msg.content) }} />
                            </div>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {new Date(msg.created_at).toLocaleTimeString()}
                            {msg.role === 'assistant' && generationSeconds && ` · ${generationSeconds}s`}
                            {msg.role === 'assistant' && modelLabel && ` · ${modelLabel}`}
                        </span>
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
