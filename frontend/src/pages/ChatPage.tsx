import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listConversations, createConversation, getConversation, deleteConversation, updateConversation, listProviders } from '@/lib/api'
import { useStreamingChat } from '@/hooks/useStreamingChat'
import {
    Plus, Send, Loader2, MessageSquare, Trash2, Sparkles, Bot, User,
    ChevronDown, ChevronRight, ExternalLink, Check, Pencil, ChevronDown as ChevronDownIcon,
    Paperclip, X
} from 'lucide-react'
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
}

export default function ChatPage() {
    const { workspaceId = '', conversationId } = useParams<{ workspaceId: string; conversationId?: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [input, setInput] = useState('')
    const [activeCid, setActiveCid] = useState(conversationId ?? null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Per-message model override
    const [selectedProviderId, setSelectedProviderId] = useState('')
    const [modelPickerOpen, setModelPickerOpen] = useState(false)

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

    const { streamingContent, isStreaming, sources, sendMessage, isConnected } = useStreamingChat(activeCid)

    const messages: Message[] = conversationData?.messages ?? []

    // Build model options from providers (flat list of provider + model pairs)
    const modelOptions = useMemo(() => {
        return (providers as ProviderRecord[])
            .filter(p => p.default_model)
            .map(p => ({
                providerId: p.id,
                modelId: p.default_model!,
                label: p.display_name,
            }))
    }, [providers])

    const selectedOption = modelOptions.find(o => o.providerId === selectedProviderId)

    useEffect(() => {
        if (conversationId !== activeCid) setActiveCid(conversationId ?? null)
    }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages.length, streamingContent])

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

    const handleSend = () => {
        if (!input.trim() || isStreaming) return
        const msg = input.trim()
        setInput('')
        if (textareaRef.current) textareaRef.current.style.height = 'auto'

        const override = selectedOption
            ? { provider_id: selectedOption.providerId, model_id: selectedOption.modelId }
            : undefined

        if (!activeCid) {
            createConversation(workspaceId).then(conv => {
                qc.invalidateQueries({ queryKey: ['conversations', workspaceId] })
                setActiveCid(conv.id)
                navigate(`/w/${workspaceId}/chat/${conv.id}`)
                setTimeout(() => sendMessage(msg, override), 500)
            })
        } else {
            sendMessage(msg, override)
        }
    }

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
    }

    return (
        <div className="flex h-full">
            {/* Conversation list */}
            <div className="w-64 flex-shrink-0 border-r border-border/50 flex flex-col">
                <div className="p-3 border-b border-border/50">
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
            <div className="flex-1 flex flex-col min-w-0">
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
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                        <div className="border-t border-border/50 p-4">
                            {/* Only show reconnecting banner when a conversation IS active but WS has dropped */}
                            {activeCid && !isConnected && (
                                <p className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Reconnecting to server…
                                </p>
                            )}
                            <div className="flex gap-3 items-end">
                                <div className="flex-1 glass-card border border-border/60 rounded-xl overflow-hidden">
                                    <textarea
                                        ref={textareaRef}
                                        className="w-full px-4 py-3 bg-transparent resize-none outline-none text-sm placeholder-muted-foreground"
                                        rows={1}
                                        placeholder="Ask a question about your notes…"
                                        value={input}
                                        onChange={handleTextareaChange}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                                        }}
                                        disabled={isStreaming}
                                        style={{ maxHeight: '100px' }}
                                    />
                                    <div className="flex items-center justify-between px-3 pb-2 gap-2">
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Sparkles className="w-3 h-3 text-accent" /> Uses workspace knowledge
                                        </span>

                                        {/* Model override picker */}
                                        {modelOptions.length > 0 && (
                                            <div className="relative">
                                                <button
                                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded-md px-2 py-1 transition-colors"
                                                    onClick={() => setModelPickerOpen(p => !p)}
                                                >
                                                    <Bot className="w-3 h-3" />
                                                    <span className="max-w-[100px] truncate">{selectedOption?.label ?? 'Default model'}</span>
                                                    <ChevronDownIcon className="w-3 h-3" />
                                                </button>
                                                {modelPickerOpen && (
                                                    <div className="absolute bottom-full right-0 mb-1 z-30 glass-card border border-border shadow-xl py-1 min-w-52 max-h-60 overflow-y-auto animate-scale-in">
                                                        <button
                                                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/40 ${!selectedProviderId ? 'text-accent' : 'text-muted-foreground'}`}
                                                            onClick={() => { setSelectedProviderId(''); setModelPickerOpen(false) }}
                                                        >
                                                            {!selectedProviderId && <Check className="w-3 h-3 flex-shrink-0" />}
                                                            <span className={!selectedProviderId ? 'ml-0' : 'ml-5'}>Workspace default</span>
                                                        </button>
                                                        {modelOptions.map(opt => (
                                                            <button
                                                                key={opt.providerId}
                                                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/40 ${selectedProviderId === opt.providerId ? 'text-accent' : 'text-muted-foreground'}`}
                                                                onClick={() => { setSelectedProviderId(opt.providerId); setModelPickerOpen(false) }}
                                                            >
                                                                {selectedProviderId === opt.providerId ? <Check className="w-3 h-3 flex-shrink-0" /> : <span className="w-3" />}
                                                                <span className="truncate">{opt.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <button
                                            className="btn-primary text-xs py-1.5 px-3"
                                            onClick={handleSend}
                                            disabled={isStreaming || !input.trim()}
                                        >
                                            {isStreaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
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
    )
}

// ── Chat message card ───────────────────────────────────────────────────────
function ChatMessageCard({ message: msg, workspaceId }: { message: Message; workspaceId: string }) {
    const [sourcesOpen, setSourcesOpen] = useState(false)
    const navigate = useNavigate()

    return (
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
    )
}
