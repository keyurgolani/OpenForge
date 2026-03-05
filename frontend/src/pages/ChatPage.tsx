import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listConversations, createConversation, getConversation, deleteConversation, updateConversation, listProviders, getWorkspace } from '@/lib/api'
import { useStreamingChat } from '@/hooks/useStreamingChat'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Plus, Send, Loader2, MessageSquare, Trash2, Bot, User,
    ChevronDown, ChevronRight, ExternalLink, Check, Pencil,
    Paperclip, X, Copy, Search
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator
} from '@/components/ui/context-menu'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
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
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

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

    const { streamingContent, isStreaming, sendMessage, isConnected, lastError, clearLastError } = useStreamingChat(activeCid)

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
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length, streamingContent])

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
            return
        }

        pushOptimisticUserMessage(targetCid, msg)
        setInput('')
        if (attachments.length > 0) setAttachments([])
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
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

    return (
        <div className="flex h-full gap-4 p-4">
            {/* Conversation list */}
            <div className="w-72 flex-shrink-0 glass-card overflow-hidden flex flex-col">
                <div className="p-4 border-b border-border/50 bg-card/30">
                    <button className="btn-primary w-full justify-center text-sm py-2" onClick={handleNewChat}>
                        <Plus className="w-4 h-4" /> New Chat
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
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
            </div>

            {/* Chat thread */}
            <div className="flex-1 flex flex-col min-w-0 glass-card overflow-hidden">
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
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-card/20">
                            {messages.map(msg => (
                                <ChatMessageCard key={msg.id} message={msg} workspaceId={workspaceId} />
                            ))}
                            {isStreaming && streamingContent && (
                                <div className="flex gap-3">
                                    <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-1">
                                        <Bot className="w-4 h-4 text-accent" />
                                    </div>
                                    <div className="glass-card px-4 py-3 max-w-2xl">
                                        <div className="markdown-content streaming-cursor" dangerouslySetInnerHTML={{ __html: md.render(streamingContent) }} />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input area */}
                        <div className="border-t border-border/45 bg-card/35 px-4 py-4 md:px-6 md:py-5">
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
                    className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${active ? 'bg-muted/60' : 'hover:bg-muted/30'}`}
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
function ChatMessageCard({ message: msg, workspaceId }: { message: Message; workspaceId: string }) {
    const [sourcesOpen, setSourcesOpen] = useState(false)
    const navigate = useNavigate()

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${msg.role === 'user' ? 'bg-accent/30' : 'bg-muted/60'}`}>
                        {msg.role === 'user' ? <User className="w-4 h-4 text-accent" /> : <Bot className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-2xl ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-accent/20 border border-accent/30' : 'glass-card'}`}>
                            {msg.role === 'user' ? (
                                <p className="text-sm">{msg.content}</p>
                            ) : (
                                <div className="markdown-content text-sm" dangerouslySetInnerHTML={{ __html: md.render(msg.content) }} />
                            )}
                        </div>
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
                        <span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleTimeString()}</span>
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
