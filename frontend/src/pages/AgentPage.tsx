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
    saveAttachmentToKnowledge,
    exportConversation,
    approveHITL,
    denyHITL,
    bulkTrashConversations,
    bulkRestoreConversations,
    bulkPermanentlyDeleteConversations,
} from '@/lib/api'
import { useStreamingChat, type Mention, type TimelineToolCall, type TimelineSubagentInvocation, type TimelineHITLRequest, type SubagentTimelineStep } from '@/hooks/useStreamingChat'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Plus, Send, Square, Loader2, MessageSquare, Trash2, Bot, User,
    ChevronDown, ChevronRight, ChevronLeft, ChevronUp, ChevronsUp, ExternalLink, Check, Pencil,
    Paperclip, X, Copy, Search, Brain, Wrench, BookmarkPlus, Network, ShieldAlert, ShieldCheck, ShieldX, AtSign,
    CheckCircle2, XCircle, RotateCcw, Trash
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator
} from '@/components/ui/context-menu'
import MarkdownIt from 'markdown-it'
import { sanitizeProviderDisplayName } from '@/lib/provider-display'
import { ToolCallCard } from '@/components/shared/ToolCallCard'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

// Knowledge subtype display labels (matches TYPE_META in SearchPage)
const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
    note: 'Note', fleeting: 'Fleeting', bookmark: 'Bookmark', gist: 'Gist',
    image: 'Image', audio: 'Audio', pdf: 'PDF', document: 'Document', sheet: 'Sheet', slides: 'Slides',
}

interface MentionResolutionMaps {
    workspacesById: Map<string, string>    // id → name
    chatsById: Map<string, string>         // id → title
    knowledgeById: Map<string, string>     // id → title
    knowledgeTypeById: Map<string, string> // id → knowledge_type
    knowledgeWorkspaceById: Map<string, { workspaceId: string; workspaceName: string }> // id → workspace info
    workspacesByName: Map<string, string>  // name (lower) → id
    chatsByName: Map<string, string>       // title (lower) → id
}

// Encode knowledge entity as label with embedded type + workspace: "K|{type}|{wsName}|{title}"
// Workspace/Chat labels stay as "Workspace: {name}" / "Chat: {title}" for @mention compat
function knLabel(title: string, type?: string, wsName?: string) {
    return `K\u200b${type || ''}\u200b${wsName || ''}\u200b${title}`
}

/** Pre-process agent response content to turn contextual IDs into markdown links. */
function injectIdLinks(
    content: string,
    workspaceId: string,
    maps?: MentionResolutionMaps,
): string {
    const U = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    // knowledge_id / knowledge: <uuid>
    let out = content.replace(
        new RegExp(`(knowledge_id\\s*[:=]\\s*\`?)(${U})(\`?)`, 'gi'),
        (_, pre, uuid, post) => {
            const lc = uuid.toLowerCase()
            const title = maps?.knowledgeById.get(lc)
            const type = maps?.knowledgeTypeById.get(lc)
            const knWs = maps?.knowledgeWorkspaceById.get(lc)
            const targetWs = knWs?.workspaceId || workspaceId
            const crossWsName = knWs && knWs.workspaceId !== workspaceId ? knWs.workspaceName : undefined
            const label = title ? knLabel(title, type, crossWsName) : knLabel(uuid.slice(0, 8) + '…')
            return `${pre}[${label}](/w/${targetWs}/knowledge/${uuid})${post}`
        }
    )
    // conversation_id / chat_id: <uuid>
    out = out.replace(
        new RegExp(`((?:conversation_id|chat_id)\\s*[:=]\\s*\`?)(${U})(\`?)`, 'gi'),
        (_, pre, uuid, post) => {
            const title = maps?.chatsById.get(uuid)
            const label = title ? `Chat: ${title}` : `Chat: ${uuid.slice(0, 8)}…`
            return `${pre}[${label}](/w/${workspaceId}/agent/${uuid})${post}`
        }
    )
    // workspace_id: <uuid>
    out = out.replace(
        new RegExp(`(workspace_id\\s*[:=]\\s*\`?)(${U})(\`?)`, 'gi'),
        (_, pre, uuid, post) => {
            const name = maps?.workspacesById.get(uuid)
            const label = name ? `Workspace: ${name}` : `Workspace: ${uuid.slice(0, 8)}…`
            return `${pre}[${label}](/w/${uuid})${post}`
        }
    )
    // @MentionName → clickable link (workspace or chat)
    if (maps) {
        const wsNames = [...maps.workspacesByName.entries()].sort((a, b) => b[0].length - a[0].length)
        for (const [nameLower, wsId] of wsNames) {
            const escapedName = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            out = out.replace(
                new RegExp(`@(${escapedName})(?![^[]*\\])`, 'gi'),
                (_, matched) => `[@${matched}](/w/${wsId})`
            )
        }
        const chatNames = [...maps.chatsByName.entries()].sort((a, b) => b[0].length - a[0].length)
        for (const [nameLower, chatId] of chatNames) {
            const escapedName = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            out = out.replace(
                new RegExp(`@(${escapedName})(?![^[]*\\])`, 'gi'),
                (_, matched) => `[@${matched}](/w/${workspaceId}/agent/${chatId})`
            )
        }
    }
    // Final pass: bare UUIDs → link if they match known entities; default to knowledge.
    if (maps) {
        out = out.replace(
            new RegExp(`(?<![/\\w-])(${U})(?![/\\w-])`, 'gi'),
            (uuid) => {
                const lc = uuid.toLowerCase()
                const wsName = maps.workspacesById.get(lc)
                if (wsName) return `[Workspace: ${wsName}](/w/${uuid})`
                const chatTitle = maps.chatsById.get(lc)
                if (chatTitle) return `[Chat: ${chatTitle}](/w/${workspaceId}/agent/${uuid})`
                const knTitle = maps.knowledgeById.get(lc)
                const knType = maps.knowledgeTypeById.get(lc)
                const knWs = maps.knowledgeWorkspaceById.get(lc)
                const targetWs = knWs?.workspaceId || workspaceId
                const crossWsName = knWs && knWs.workspaceId !== workspaceId ? knWs.workspaceName : undefined
                const label = knTitle ? knLabel(knTitle, knType, crossWsName) : knLabel(uuid.slice(0, 8) + '…')
                return `[${label}](/w/${targetWs}/knowledge/${uuid})`
            }
        )
    }
    return out
}

// Zero-width space U+200B is used as separator in knowledge labels — safe since it
// never appears in user-generated titles and survives markdown-it rendering unchanged.
const ENTITY_CARD_RE = /<a href="([^"]*)">(Workspace: [^<]+|Chat: [^<]+|K\u200b[^<]+)<\/a>/g

function entityCardHtml(href: string, label: string): string {
    if (label.startsWith('Workspace: ')) {
        const name = label.slice('Workspace: '.length)
        return `<a href="${href}" class="entity-link entity-link--workspace">` +
            `<span class="entity-link-meta"><span class="entity-link-badge">Workspace</span></span>` +
            `<span class="entity-link-name">${name}</span></a>`
    }
    if (label.startsWith('Chat: ')) {
        const title = label.slice('Chat: '.length)
        return `<a href="${href}" class="entity-link entity-link--chat">` +
            `<span class="entity-link-meta"><span class="entity-link-badge">Chat</span></span>` +
            `<span class="entity-link-name">${title}</span></a>`
    }
    // Knowledge — label is "K\u200b{type}\u200b{wsName}\u200b{title}"
    const zw = '\u200b'
    const parts = label.split(zw)
    // parts[0] = "K", parts[1] = type, parts[2] = wsName, parts[3] = title
    const knType = parts[1] || ''
    const wsName = parts[2] || ''
    const knTitle = parts.slice(3).join(zw) || parts.slice(2).join(zw) || label
    const typeLabel = knType ? (KNOWLEDGE_TYPE_LABELS[knType] || knType) : ''
    const typeChip = typeLabel
        ? `<span class="entity-link-subtype">${typeLabel}</span>`
        : ''
    const wsChip = wsName
        ? `<span class="entity-link-subtype entity-link-workspace-chip">@ ${wsName}</span>`
        : ''
    return `<a href="${href}" class="entity-link entity-link--knowledge">` +
        `<span class="entity-link-meta"><span class="entity-link-badge">Knowledge</span>${typeChip}${wsChip}</span>` +
        `<span class="entity-link-name">${knTitle}</span></a>`
}

function renderMessageContent(
    content: string,
    workspaceId: string,
    maps?: MentionResolutionMaps,
): string {
    const html = md.render(injectIdLinks(content, workspaceId, maps))
    return html.replace(ENTITY_CARD_RE, (_, href, label) => entityCardHtml(href, label))
}

const MIN_CHAT_LIST_PCT = 15
const MAX_CHAT_LIST_PCT = 40
const DEFAULT_CHAT_LIST_PCT = 25
const CHAT_LIST_COLLAPSED_WIDTH = 56
const CHAT_LIST_WIDTH_STORAGE_KEY = 'openforge.shell.chat.list.pct'
const CHAT_LIST_COLLAPSED_STORAGE_KEY = 'openforge.shell.chat.list.collapsed'
const CHAT_STREAMING_SAFE_GAP = 10

const clampChatListPct = (value: number) =>
    Math.max(MIN_CHAT_LIST_PCT, Math.min(MAX_CHAT_LIST_PCT, value))

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
    timeline?: Array<
        | { type: 'thinking'; content: string }
        | { type: 'tool_call'; call_id: string; tool_name: string; arguments: Record<string, unknown>; success?: boolean; output?: unknown; error?: string }
        | TimelineSubagentInvocation
        | TimelineHITLRequest
    > | null
    is_interrupted?: boolean
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

export default function AgentPage() {
    const { workspaceId = '', conversationId } = useParams<{ workspaceId: string; conversationId?: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()
    const { error: showError } = useToast()
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
    const [chatListPct, setChatListPct] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_CHAT_LIST_PCT
        const raw = window.localStorage.getItem(CHAT_LIST_WIDTH_STORAGE_KEY)
        const parsed = raw ? parseFloat(raw) : NaN
        return Number.isFinite(parsed) ? clampChatListPct(parsed) : DEFAULT_CHAT_LIST_PCT
    })
    const [activeChatRailSection, setActiveChatRailSection] = useState<'conversations' | 'subagent' | 'trash' | null>('conversations')
    const [isChatListCollapsed, setIsChatListCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.localStorage.getItem(CHAT_LIST_COLLAPSED_STORAGE_KEY) === '1'
    })
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
        attachmentsProcessed,
        sources,
        timeline: streamingTimeline,
        sendMessage,
        cancelStream,
        isConnected,
        lastError,
        clearLastError,
        thinkingByMessageId,
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

    // Track subagent live content length for scroll updates during subagent execution
    const subagentLiveContentLength = useMemo(() => {
        return streamingTimeline.reduce((sum, entry) => {
            const e = entry as unknown as Record<string, unknown>
            const tl = e._liveTimeline as unknown[] | undefined
            const resp = e._liveResponse as string | undefined
            return sum + (tl?.length ?? 0) + (resp?.length ?? 0)
        }, 0)
    }, [streamingTimeline])

    useEffect(() => {
        if (!stickToBottomRef.current) return
        const container = messagesContainerRef.current
        if (!container) return
        container.scrollTo({ top: container.scrollHeight, behavior: isStreaming ? 'auto' : 'smooth' })
    }, [messages.length, streamingContent, streamingTimeline.length, subagentLiveContentLength, sources.length, isStreaming, stickToBottom])

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
        attachmentsProcessed.length,
        sources.length,
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
        if (!rawText.trim() || isStreaming || uploadingFiles) return
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

        const override: { provider_id?: string; model_id?: string; attachment_ids?: string[]; mentions?: Mention[] } = {}
        if (selectedOption) {
            override.provider_id = selectedOption.providerId
            override.model_id = selectedOption.modelId
        }
        if (attachmentIds.length > 0) override.attachment_ids = attachmentIds
        if (activeMentions.length > 0) override.mentions = activeMentions

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

    const handleMessagesScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const el = event.currentTarget
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        const atBottom = distanceFromBottom <= 50
        stickToBottomRef.current = atBottom
        setStickToBottom(atBottom)
    }

    const handleChatListResizeStart = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        const startX = e.clientX
        const startPct = chatListPct
        const containerWidth = e.currentTarget.parentElement?.parentElement?.offsetWidth || window.innerWidth
        let currentPct = startPct

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaPx = startX - moveEvent.clientX
            const deltaPct = (deltaPx / containerWidth) * 100
            currentPct = clampChatListPct(startPct + deltaPct)
            setChatListPct(currentPct)
        }

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.localStorage.setItem(CHAT_LIST_WIDTH_STORAGE_KEY, String(currentPct))
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
    // Input box stays editable while streaming so the user can compose their next message
    const inputDisabled = uploadingFiles || activeConversationIsArchived
    const composerDisabled = isStreaming || uploadingFiles || activeConversationIsArchived
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
                                            mentionMaps={mentionMaps}
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
                                                    <StreamingAttachmentsBadge
                                                        atts={attachmentsProcessed}
                                                        workspaceId={workspaceId}
                                                    />
                                                )}
                                                {sources.length > 0 && (
                                                    <StreamingSourcesBadge
                                                        sources={sources}
                                                        workspaceId={workspaceId}
                                                    />
                                                )}
                                                {streamingModelLabel && (
                                                    <div className="chat-workflow-step chat-section-reveal w-fit">
                                                        <span className="chat-subsection-toggle" style={{ cursor: 'default' }}>
                                                            <Bot className="h-3 w-3" />
                                                            <span>LLM</span>
                                                            <span className="text-muted-foreground/40">·</span>
                                                            <span className="truncate">{streamingModelLabel}</span>
                                                        </span>
                                                    </div>
                                                )}
                                                {streamingTimeline.map((entry, i) =>
                                                    entry.type === 'thinking' ? (
                                                        <ThinkingBlock
                                                            key={i}
                                                            content={entry.content}
                                                            requestVisibility={() => ensureExpandedBlockVisible(streamingMessageRef.current)}
                                                            isActiveStream={isStreaming && i === streamingTimeline.length - 1 && !entry.done}
                                                            durationMs={entry.durationMs}
                                                        />
                                                    ) : entry.type === 'subagent_invocation' ? (
                                                        <SubagentCard
                                                            key={entry.call_id}
                                                            callId={entry.call_id}
                                                            toolName={entry.tool_name}
                                                            arguments={entry.arguments}
                                                            entry={entry}
                                                            requestVisibility={() => ensureExpandedBlockVisible(streamingMessageRef.current)}
                                                            workspaceId={workspaceId}
                                                            mentionMaps={mentionMaps}
                                                        />
                                                    ) : entry.type === 'tool_call' && (entry as TimelineToolCall).tool_name.startsWith('agent.') ? (
                                                        <SubagentCard
                                                            key={(entry as TimelineToolCall).call_id}
                                                            callId={(entry as TimelineToolCall).call_id}
                                                            toolName={(entry as TimelineToolCall).tool_name}
                                                            arguments={(entry as TimelineToolCall).arguments}
                                                            entry={(entry as TimelineToolCall).success !== undefined ? {
                                                                type: 'subagent_invocation',
                                                                call_id: (entry as TimelineToolCall).call_id,
                                                                tool_name: (entry as TimelineToolCall).tool_name,
                                                                arguments: (entry as TimelineToolCall).arguments,
                                                                success: (entry as TimelineToolCall).success!,
                                                                subagent_response: (entry as TimelineToolCall).error || '',
                                                                subagent_timeline: [],
                                                            } : undefined}
                                                            liveTimeline={((entry as any)._liveTimeline as SubagentTimelineStep[] | undefined)}
                                                            liveResponse={((entry as any)._liveResponse as string | undefined)}
                                                            requestVisibility={() => ensureExpandedBlockVisible(streamingMessageRef.current)}
                                                            workspaceId={workspaceId}
                                                            mentionMaps={mentionMaps}
                                                        />
                                                    ) : entry.type === 'hitl_request' ? (
                                                        <HITLCard
                                                            key={entry.hitl_id}
                                                            entry={entry}
                                                            workspaceId={workspaceId}
                                                            conversationId={activeCid ?? ''}
                                                        />
                                                    ) : (
                                                        <div key={entry.call_id} className="chat-workflow-step chat-section-reveal">
                                                            <ToolCallCard
                                                                callId={entry.call_id}
                                                                toolName={entry.tool_name}
                                                                arguments={entry.arguments}
                                                                result={entry.success !== undefined ? { success: entry.success, output: entry.output, error: entry.error } : undefined}
                                                                isRunning={entry.success === undefined}
                                                            />
                                                        </div>
                                                    )
                                                )}
                                                {(streamingContent || isInterrupted) && (
                                                <div className={`chat-workflow-step chat-section-reveal ${streamingContent ? 'chat-workflow-step-live' : ''}`}>
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
                                                accept=".pdf,.txt,.md,.json,.csv,.xml,.yaml,.yml,.png,.jpg,.jpeg,.gif,.webp,image/*,text/*,application/pdf"
                                                className="hidden"
                                                onChange={handleFileSelect}
                                            />
                                            <button
                                                type="button"
                                                className="chat-control-pill disabled:opacity-50"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={(uploadingFiles || activeConversationIsArchived) || attachments.length >= 5}
                                                title="Attach files (PDF, images, text)"
                                            >
                                                <Paperclip className="h-3.5 w-3.5" />
                                                Attach
                                                {attachments.length > 0 && (
                                                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{attachments.length}</span>
                                                )}
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

            {/* Conversation list rail (right edge, similar to workspace insights position) */}
            <aside
                className="relative z-10 flex-shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card/28 py-4 flex flex-col transition-[width] duration-200 ease-out"
                style={{ width: isChatListCollapsed ? `${CHAT_LIST_COLLAPSED_WIDTH}px` : `${chatListPct}%` }}
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
                                    <p className="text-xs text-muted-foreground/90">Chats, subagent threads, and trash.</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="flex-shrink-0 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                        {activeConversations.length + subagentConversations.length + trashedConversations.length}
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
            </aside>
        </div>
    )
}

// ── Conversation row with inline rename ─────────────────────────────────────
function ConversationRow({ conv, active, workspaceId, onSelect, onDelete, onDownload, onRename }: {
    conv: Conversation; active: boolean; workspaceId: string
    onSelect: () => void; onDelete: () => void
    onDownload: (format: 'json' | 'markdown' | 'txt') => void
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
}: {
    conv: Conversation
    active: boolean
    onSelect: () => void
    onRestore: () => void
    onPermanentDelete: () => void
    onDownload: (format: 'json' | 'markdown' | 'txt') => void
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

// ── Reusable thinking block ──────────────────────────────────────────────────
const THINKING_STREAM_MAX_HEIGHT = 160

function ThinkingBlock({
    content,
    requestVisibility,
    isActiveStream = false,
    durationMs,
}: {
    content: string
    requestVisibility?: (el: HTMLElement | null) => void
    isActiveStream?: boolean
    durationMs?: number
}) {
    // Start open when streaming, closed when static (persisted)
    const [open, setOpen] = useState(isActiveStream)
    // True once user explicitly clicks the expand-height button
    const [fullyExpanded, setFullyExpanded] = useState(false)
    // True if the user interacted with this block — prevents auto-collapse
    const [userInteracted, setUserInteracted] = useState(false)
    // True if the scrollable content has hidden content at the top
    const [hasHiddenTop, setHasHiddenTop] = useState(false)

    const blockRef = useRef<HTMLDivElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    // Tracks whether this block has ever been in streaming mode
    const wasStreaming = useRef(isActiveStream)
    const thinkingCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Auto-scroll to show the latest thinking text while streaming
    useEffect(() => {
        if (!isActiveStream || fullyExpanded) return
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [content, isActiveStream, fullyExpanded])

    // When streaming ends: auto-collapse after 3s if user never interacted
    useEffect(() => {
        if (isActiveStream) {
            wasStreaming.current = true
            if (thinkingCollapseTimer.current) {
                clearTimeout(thinkingCollapseTimer.current)
                thinkingCollapseTimer.current = null
            }
            return
        }
        if (wasStreaming.current && !userInteracted) {
            thinkingCollapseTimer.current = setTimeout(() => {
                setOpen(false)
                thinkingCollapseTimer.current = null
            }, 3000)
        }
    }, [isActiveStream]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => { if (thinkingCollapseTimer.current) clearTimeout(thinkingCollapseTimer.current) }
    }, [])

    // Reset hasHiddenTop when not streaming or when fully expanded
    useEffect(() => {
        if (!isActiveStream || fullyExpanded) {
            setHasHiddenTop(false)
        }
    }, [isActiveStream, fullyExpanded])

    const toggle = () => {
        if (thinkingCollapseTimer.current) {
            clearTimeout(thinkingCollapseTimer.current)
            thinkingCollapseTimer.current = null
        }
        setUserInteracted(true)
        setOpen(prev => {
            const next = !prev
            if (next) {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => requestVisibility?.(blockRef.current))
                })
                window.setTimeout(() => requestVisibility?.(blockRef.current), 220)
            }
            return next
        })
    }

    const expandFully = () => {
        setFullyExpanded(true)
        setUserInteracted(true)
        window.requestAnimationFrame(() => requestVisibility?.(blockRef.current))
    }

    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        if (fullyExpanded) return
        const viewport = event.currentTarget
        const hasOverflow = viewport.scrollHeight - viewport.clientHeight > 2
        const hiddenTop = hasOverflow && viewport.scrollTop > 2
        setHasHiddenTop(prev => (prev === hiddenTop ? prev : hiddenTop))
    }

    return (
        <div className="chat-workflow-step">
            <button className={`chat-subsection-toggle ${open ? 'chat-subsection-toggle-open' : ''}`} onClick={toggle}>
                {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Brain className="w-3 h-3" />
                {isActiveStream
                    ? <><span>Thinking</span><span className="animate-pulse text-accent/50">•••</span></>
                    : open
                    ? 'Thinking'
                    : durationMs != null
                    ? `Thought for ${durationMs >= 60000 ? Math.round(durationMs / 60000) + 'm' : durationMs >= 1000 ? (durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0) + 's' : durationMs + 'ms'}`
                    : 'Thought'
                }
            </button>
            <div ref={blockRef} className={`chat-collapse w-full ${open ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                <div className="chat-collapse-inner">
                    <div className="relative w-full chat-step-detail-card chat-section-reveal">
                        {isActiveStream && !fullyExpanded && hasHiddenTop && (
                            <>
                                <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-10 rounded-t-xl bg-gradient-to-b from-accent/6 via-accent/6/66 to-transparent" />
                                <button
                                    type="button"
                                    className="absolute left-1/2 top-0 z-[3] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full border border-accent/30 bg-card/95 px-2.5 py-0.5 text-[11px] text-accent/80 hover:border-accent/55 hover:text-accent shadow-sm"
                                    onClick={expandFully}
                                    aria-label="Expand thinking"
                                    title="Show full thinking while streaming"
                                >
                                    <ChevronsUp className="h-3 w-3" />
                                    Expand
                                </button>
                            </>
                        )}
                        <div
                            ref={scrollRef}
                            onScroll={handleScroll}
                            className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words"
                            style={isActiveStream && !fullyExpanded ? { maxHeight: `${THINKING_STREAM_MAX_HEIGHT}px`, overflowY: 'auto' } : undefined}
                        >
                            {content}
                            {/* Spacer so the last line of text is never clipped by the max-height boundary */}
                            {isActiveStream && !fullyExpanded && <div className="h-6" aria-hidden />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Subagent invocation card ─────────────────────────────────────────────────
// Unified subagent node — handles both the "pending" phase (tool_call while running)
// and the "completed" phase (subagent_invocation with full details). React reuses the
// same component instance (same key) when the timeline entry is promoted in-place.
function SubagentCard({
    callId: _callId,
    toolName,
    arguments: agentArgs,
    entry,
    liveTimeline,
    liveResponse,
    requestVisibility,
    workspaceId,
    mentionMaps,
}: {
    callId: string
    toolName: string
    arguments: Record<string, unknown>
    entry?: TimelineSubagentInvocation   // undefined = still running
    liveTimeline?: SubagentTimelineStep[]   // streamed steps while running
    liveResponse?: string                  // streaming response text while running
    requestVisibility?: (el: HTMLElement | null) => void
    workspaceId: string
    mentionMaps?: MentionResolutionMaps
}) {
    const isRunning = entry === undefined
    // Start open while running; start closed for already-completed (history) entries
    const [open, setOpen] = useState(isRunning)
    const [userInteracted, setUserInteracted] = useState(false)
    const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const blockRef = useRef<HTMLDivElement>(null)
    // Track whether the entry was defined on last render to detect transition
    const prevEntryRef = useRef<TimelineSubagentInvocation | undefined>(entry)

    const instruction = (agentArgs?.instruction as string) || 'Subagent task'
    const targetWorkspaceId = agentArgs?.workspace_id as string | undefined

    const timelineSource = entry?.subagent_timeline ?? liveTimeline ?? []
    const toolSteps = timelineSource.filter(
        (s): s is SubagentTimelineStep & { type: 'tool_call' } => s.type === 'tool_call'
    )
    const thinkingSteps = timelineSource.filter(s => s.type === 'thinking')
    const hasSteps = toolSteps.length > 0 || thinkingSteps.length > 0

    // When entry transitions from undefined → defined (subagent just finished):
    // re-open the card so the result is visible, then auto-collapse after 2s
    useEffect(() => {
        if (entry && !prevEntryRef.current) {
            setOpen(true)
            if (!userInteracted && !autoCollapseTimer.current) {
                autoCollapseTimer.current = setTimeout(() => {
                    setOpen(false)
                    autoCollapseTimer.current = null
                }, 3000)
            }
        }
        prevEntryRef.current = entry
    }, [entry]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => { if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current) }
    }, [])

    const toggle = () => {
        if (autoCollapseTimer.current) {
            clearTimeout(autoCollapseTimer.current)
            autoCollapseTimer.current = null
        }
        setUserInteracted(true)
        setOpen(prev => {
            const next = !prev
            if (next) {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => requestVisibility?.(blockRef.current))
                })
                window.setTimeout(() => requestVisibility?.(blockRef.current), 220)
            }
            return next
        })
    }

    const statusIcon = isRunning
        ? <Loader2 className="w-3 h-3 animate-spin text-accent/70" />
        : entry?.success
            ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            : <XCircle className="w-3 h-3 text-red-400" />

    return (
        <div className="chat-workflow-step chat-section-reveal">
            <button className={`chat-subsection-toggle ${open ? 'chat-subsection-toggle-open' : ''}`} onClick={toggle}>
                {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Network className="w-3 h-3" />
                <span>Subagent</span>
                <span className="text-muted-foreground/40 mx-0.5">·</span>
                <span className="text-accent/60 text-[11px] font-mono">{toolName}</span>
                {statusIcon}
            </button>
            <div ref={blockRef} className={`chat-collapse w-full ${open ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                <div className="chat-collapse-inner">
                    <div className="chat-step-detail-card chat-section-reveal overflow-hidden !p-0">

                        {/* Request */}
                        <div className="px-4 pt-3 pb-2 border-b border-accent/10">
                            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">Request</div>
                            <pre className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-sans">
                                {instruction}
                            </pre>
                            {targetWorkspaceId && (
                                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                                    <span className="uppercase tracking-wide">workspace</span>
                                    <span className="font-mono text-accent/60">{targetWorkspaceId}</span>
                                </div>
                            )}
                        </div>

                        {/* Running placeholder */}
                        {isRunning && !hasSteps && !liveResponse && (
                            <div className="px-4 py-3">
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Subagent running…</span>
                                </div>
                            </div>
                        )}

                        {/* Subagent timeline steps (thinking + tool calls) */}
                        {hasSteps && (
                            <div className="px-4 py-2 border-b border-accent/10">
                                <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/60">Steps</div>
                                <div className="chat-workflow-stack">
                                    {timelineSource.map((step, idx) =>
                                        step.type === 'thinking' ? (
                                            <ThinkingBlock
                                                key={`thinking-${idx}`}
                                                content={step.content || ''}
                                                isActiveStream={isRunning && !step.done && idx === timelineSource.length - 1}
                                            />
                                        ) : step.type === 'tool_call' ? (
                                            <div key={step.call_id ?? idx} className="chat-workflow-step">
                                                <ToolCallCard
                                                    callId={step.call_id ?? String(idx)}
                                                    toolName={step.tool_name ?? ''}
                                                    arguments={step.arguments ?? {}}
                                                    result={step.success !== undefined
                                                        ? { success: step.success, output: step.output, error: step.error }
                                                        : undefined
                                                    }
                                                    isRunning={isRunning && step.success === undefined}
                                                />
                                            </div>
                                        ) : null
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Response — live streaming or completed */}
                        {(entry || (isRunning && liveResponse)) && (
                            <div className="px-4 pt-2 pb-3">
                                <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">Response</div>
                                {(entry?.subagent_response || liveResponse) ? (
                                    <div
                                        className="text-xs leading-relaxed text-foreground/85 markdown-content"
                                        dangerouslySetInnerHTML={{ __html: renderMessageContent(entry?.subagent_response || liveResponse || '', targetWorkspaceId || workspaceId, mentionMaps) }}
                                    />
                                ) : (
                                    <span className="text-[11px] text-muted-foreground/40 italic">No response</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── HITL approval card ────────────────────────────────────────────────────────
function HITLCard({
    entry,
    workspaceId: _workspaceId,
    conversationId: _conversationId,
    readonly = false,
}: {
    entry: TimelineHITLRequest
    workspaceId: string
    conversationId: string
    readonly?: boolean
}) {
    const [loading, setLoading] = useState(false)
    const [localStatus, setLocalStatus] = useState<'pending' | 'approved' | 'denied'>(entry.status)
    const [collapsed, setCollapsed] = useState(false)
    const [reason, setReason] = useState('')
    const { success: toastSuccess, error: toastError } = useToast()

    // Keep local status in sync when entry status changes (e.g. from WS event)
    useEffect(() => { setLocalStatus(entry.status) }, [entry.status])

    // Auto-collapse 3 seconds after resolution
    useEffect(() => {
        if (localStatus === 'pending') return
        const timer = setTimeout(() => setCollapsed(true), 3000)
        return () => clearTimeout(timer)
    }, [localStatus])

    // Already-resolved entries from persisted messages start collapsed
    useEffect(() => {
        if (readonly && entry.status !== 'pending') setCollapsed(true)
    }, [readonly, entry.status])

    const handleApprove = async () => {
        setLoading(true)
        try {
            await approveHITL(entry.hitl_id, reason || undefined)
            setLocalStatus('approved')
            toastSuccess('Tool approved')
        } catch {
            toastError('Failed to approve')
        } finally {
            setLoading(false)
        }
    }

    const handleDeny = async () => {
        setLoading(true)
        try {
            await denyHITL(entry.hitl_id, reason || undefined)
            setLocalStatus('denied')
            toastSuccess('Tool denied')
        } catch {
            toastError('Failed to deny')
        } finally {
            setLoading(false)
        }
    }

    const [open, setOpen] = useState(localStatus === 'pending')

    // Auto-close detail panel when collapsing into badge
    useEffect(() => {
        if (collapsed) setOpen(false)
    }, [collapsed])

    const toggle = () => {
        setOpen(prev => !prev)
        // If user opens a collapsed badge, un-collapse it
        if (collapsed) setCollapsed(false)
    }

    const statusIcon = localStatus === 'pending'
        ? <Loader2 className="h-3 w-3 animate-spin text-accent/70" />
        : localStatus === 'approved'
            ? <ShieldCheck className="h-3 w-3 text-emerald-400" />
            : <ShieldX className="h-3 w-3 text-red-400" />

    const category = entry.tool_id.split('.')[0] ?? entry.tool_id
    const action = entry.tool_id.split('.').slice(1).join('.')

    return (
        <div className="chat-workflow-step chat-section-reveal">
            <button
                type="button"
                className={`chat-subsection-toggle ${open ? 'chat-subsection-toggle-open' : ''}`}
                onClick={toggle}
            >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <ShieldAlert className="h-3 w-3" />
                <span className="shrink-0">HITL</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex gap-0.5 items-baseline min-w-0">
                    <span className="text-muted-foreground/80 shrink-0">{category}</span>
                    {action && (
                        <>
                            <span className="text-muted-foreground/40">.</span>
                            <span className="text-foreground/70 shrink-0">{action}</span>
                        </>
                    )}
                </span>
                {statusIcon}
            </button>

            <div className={`chat-collapse w-full ${open ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                <div className="chat-collapse-inner">
                    <div className="chat-step-detail-card">
                        {/* Action summary */}
                        {entry.action_summary && (
                            <div className="text-[11px] text-foreground/80">{entry.action_summary}</div>
                        )}

                        {/* Risk + status */}
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-[10px] uppercase tracking-wide text-accent/55 font-medium">Risk</span>
                            <span className="capitalize text-foreground/75">{entry.risk_level || 'low'}</span>
                            <span className="text-muted-foreground/30 mx-1">·</span>
                            <span className="text-[10px] uppercase tracking-wide text-accent/55 font-medium">Status</span>
                            <span className={`capitalize ${localStatus === 'approved' ? 'text-emerald-400' : localStatus === 'denied' ? 'text-red-400' : 'text-foreground/75'}`}>{localStatus}</span>
                        </div>

                        {/* Guidance textarea + action buttons for pending */}
                        {!readonly && localStatus === 'pending' && (
                            <div className="space-y-2">
                                <textarea
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder="Optional: add guidance for the agent..."
                                    rows={2}
                                    className="w-full rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent/40"
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleApprove}
                                        disabled={loading}
                                        className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                                        Approve
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeny}
                                        disabled={loading}
                                        className="flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1 text-[11px] text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldX className="h-3 w-3" />}
                                        Deny
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Resolution confirmation + steering hint for resolved entries */}
                        {localStatus !== 'pending' && (
                            <div className="space-y-1.5">
                                <div className={`flex items-center gap-1.5 text-[11px] ${localStatus === 'approved' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {localStatus === 'approved' ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
                                    {localStatus === 'approved' ? 'Tool execution approved' : 'Tool execution denied'}
                                </div>
                                {reason && (
                                    <div className="text-[11px] text-muted-foreground/70 border-l-2 border-accent/30 pl-2">
                                        <span className="text-[10px] uppercase tracking-wide text-accent/55 font-medium">Guidance: </span>
                                        {reason}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

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

// ── Streaming badges (auto-collapse 3 s after first appearance) ───────────────
type ContextSource = { knowledge_id: string; title: string; snippet: string; score: number }

function StreamingAttachmentsBadge({ atts, workspaceId }: { atts: AttachmentProcessed[]; workspaceId: string }) {
    const [open, setOpen] = useState(true)
    const userInteracted = useRef(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        timer.current = setTimeout(() => {
            if (!userInteracted.current) setOpen(false)
            timer.current = null
        }, 3000)
        return () => { if (timer.current) clearTimeout(timer.current) }
    }, [])
    const toggle = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null }
        userInteracted.current = true
        setOpen(prev => !prev)
    }
    return (
        <div className="chat-workflow-step">
            <button className={`chat-subsection-toggle ${open ? 'chat-subsection-toggle-open' : ''}`} onClick={toggle}>
                {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {`Processed ${atts.length} Attachment${atts.length === 1 ? '' : 's'}`}
            </button>
            <div className={`chat-collapse w-full ${open ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                <div className="chat-collapse-inner">
                    <div className="chat-step-detail-card chat-section-reveal space-y-2 w-full">
                        {atts.map(att => (
                            <AttachmentCard key={att.id} att={att} workspaceId={workspaceId} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

function StreamingSourcesBadge({ sources, workspaceId }: { sources: ContextSource[]; workspaceId: string }) {
    const [open, setOpen] = useState(true)
    const userInteracted = useRef(false)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const navigate = useNavigate()
    useEffect(() => {
        timer.current = setTimeout(() => {
            if (!userInteracted.current) setOpen(false)
            timer.current = null
        }, 3000)
        return () => { if (timer.current) clearTimeout(timer.current) }
    }, [])
    const toggle = () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null }
        userInteracted.current = true
        setOpen(prev => !prev)
    }
    return (
        <div className="chat-workflow-step">
            <button className={`chat-subsection-toggle ${open ? 'chat-subsection-toggle-open' : ''}`} onClick={toggle}>
                {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {`Used ${sources.length} Knowledge ${sources.length === 1 ? 'Record' : 'Records'}`}
            </button>
            <div className={`chat-collapse w-full ${open ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
                <div className="chat-collapse-inner">
                    <div className="chat-step-detail-card chat-section-reveal space-y-2 w-full">
                        {sources.map(src => (
                            <div key={src.knowledge_id} className="chat-source-card p-3 text-xs">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-foreground">{src.title}</span>
                                    {src.knowledge_id && (
                                        <button className="text-accent/60 hover:text-accent transition-colors" onClick={() => navigate(`/w/${workspaceId}/knowledge/${src.knowledge_id}`)}>
                                            <ExternalLink className="w-3 h-3" />
                                        </button>
                                    )}
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
    )
}

// ── Attachment card ──────────────────────────────────────────────────────────
function AttachmentCard({ att, workspaceId }: { att: AttachmentProcessed; workspaceId: string }) {
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const { success: toastSuccess, error: toastError } = useToast()

    const canSave = att.status === 'processed' && !saved
    const hasContent = !!att.extracted_text?.trim()

    async function handleSave() {
        if (saving || saved) return
        setSaving(true)
        try {
            await saveAttachmentToKnowledge(att.id, workspaceId)
            setSaved(true)
            toastSuccess('Saved to workspace knowledge')
        } catch {
            toastError('Failed to save to knowledge')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground/90">{att.filename}</span>
                <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] ${att.status === 'processed' ? 'text-emerald-300' : att.status === 'deferred' ? 'text-amber-300' : 'text-muted-foreground'}`}>
                        {att.pipeline === 'url_extract' ? 'URL Extract' : att.pipeline}
                    </span>
                    {hasContent && (
                        <button
                            onClick={() => setExpanded(p => !p)}
                            title={expanded ? 'Hide content' : 'View extracted content'}
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        >
                            {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                            {expanded ? 'Hide' : 'View'}
                        </button>
                    )}
                    {canSave && (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            title="Save to workspace knowledge"
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-accent/70 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <BookmarkPlus className="h-2.5 w-2.5" />}
                            Save
                        </button>
                    )}
                    {saved && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                            <Check className="h-2.5 w-2.5" />
                            Saved
                        </span>
                    )}
                </div>
            </div>
            {att.details && (
                <p className="text-[11px] text-muted-foreground">{att.details}</p>
            )}
            {expanded && att.extracted_text && (
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border/50 bg-background/60 p-2 text-[11px] text-foreground/80 leading-relaxed">
                    {att.extracted_text}
                </pre>
            )}
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
    mentionMaps,
}: {
    message: Message
    workspaceId: string
    thinking?: string
    providerDisplayByName?: Record<string, string>
    requestVisibility?: (element: HTMLElement | null) => void
    attachmentsProcessed?: AttachmentProcessed[]
    mentionMaps?: MentionResolutionMaps
}) {
    const [attachmentsOpen, setAttachmentsOpen] = useState(false)
    const [sourcesOpen, setSourcesOpen] = useState(false)
    const [contextMenuOpen, setContextMenuOpen] = useState(false)
    const [copied, setCopied] = useState(false)

    const attachmentsUserInteracted = useRef(false)
    const sourcesUserInteracted = useRef(false)
    const attachmentsCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const sourcesCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleCopy = async () => {
        await navigator.clipboard.writeText(msg.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }
    const attachmentsBlockRef = useRef<HTMLDivElement>(null)
    const sourcesBlockRef = useRef<HTMLDivElement>(null)
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
                                <div
                                    className="markdown-content text-sm"
                                    dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.content, workspaceId, mentionMaps) }}
                                    onClick={(e) => {
                                        const a = (e.target as HTMLElement).closest('a')
                                        if (a) { const h = a.getAttribute('href'); if (h?.startsWith('/')) { e.preventDefault(); navigate(h) } }
                                    }}
                                />
                            </div>
                        )}
                        {hasWorkflowSteps && (
                            <div className="chat-workflow-stack w-full">
                                {attachmentsProcessed.length > 0 && (
                                    <div className="chat-workflow-step">
                                        <button
                                            className={`chat-subsection-toggle ${attachmentsOpen ? 'chat-subsection-toggle-open' : ''}`}
                                            onClick={() => {
                                                if (attachmentsCollapseTimer.current) {
                                                    clearTimeout(attachmentsCollapseTimer.current)
                                                    attachmentsCollapseTimer.current = null
                                                }
                                                attachmentsUserInteracted.current = true
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
                                                <div className="chat-step-detail-card chat-section-reveal space-y-2 w-full">
                                                    {attachmentsProcessed.map(att => (
                                                        <AttachmentCard
                                                            key={att.id}
                                                            att={att}
                                                            workspaceId={workspaceId}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {msg.context_sources && msg.context_sources.length > 0 && (
                                    <div className="chat-workflow-step">
                                        <button
                                            className={`chat-subsection-toggle ${sourcesOpen ? 'chat-subsection-toggle-open' : ''}`}
                                            onClick={() => {
                                                if (sourcesCollapseTimer.current) {
                                                    clearTimeout(sourcesCollapseTimer.current)
                                                    sourcesCollapseTimer.current = null
                                                }
                                                sourcesUserInteracted.current = true
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
                                                <div className="chat-step-detail-card chat-section-reveal space-y-2 w-full">
                                                    {msg.context_sources.map(src => (
                                                        <div key={src.knowledge_id} className="chat-source-card p-3 text-xs">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-medium text-foreground">{src.title}</span>
                                                                <button className="text-accent/60 hover:text-accent transition-colors" onClick={() => navigate(`/w/${workspaceId}/knowledge/${src.knowledge_id}`)}>
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
                                    <div className="chat-workflow-step chat-section-reveal w-fit">
                                        <span className="chat-subsection-toggle" style={{ cursor: 'default' }}>
                                            <Bot className="h-3 w-3" />
                                            <span>LLM</span>
                                            <span className="text-muted-foreground/40">·</span>
                                            <span className="truncate">{modelLabel}</span>
                                        </span>
                                    </div>
                                )}
                                {(msg.timeline?.length ?? 0) > 0
                                    ? msg.timeline!.map((entry, i) =>
                                        entry.type === 'thinking' ? (
                                            <ThinkingBlock
                                                key={i}
                                                content={entry.content}
                                                requestVisibility={requestVisibility}
                                            />
                                        ) : entry.type === 'subagent_invocation' ? (
                                            <SubagentCard
                                                key={entry.call_id}
                                                callId={entry.call_id}
                                                toolName={entry.tool_name}
                                                arguments={entry.arguments}
                                                entry={entry}
                                                requestVisibility={requestVisibility}
                                                workspaceId={workspaceId}
                                                mentionMaps={mentionMaps}
                                            />
                                        ) : entry.type === 'hitl_request' ? (
                                            <HITLCard
                                                key={entry.hitl_id}
                                                entry={entry}
                                                workspaceId={workspaceId}
                                                conversationId={msg.id}
                                                readonly
                                            />
                                        ) : (
                                            <div key={entry.call_id} className="chat-workflow-step chat-section-reveal">
                                                <ToolCallCard
                                                    callId={entry.call_id}
                                                    toolName={entry.tool_name}
                                                    arguments={entry.arguments}
                                                    result={entry.success !== undefined ? { success: entry.success, output: entry.output, error: entry.error } : undefined}
                                                    isRunning={false}
                                                />
                                            </div>
                                        )
                                    )
                                    : <>
                                        {(msg.tool_calls?.length ?? 0) > 0 && (
                                            <div className="chat-workflow-step">
                                                <div className="glass-card chat-section-reveal px-4 py-3">
                                                    <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                        <Wrench className="h-3 w-3" />
                                                        Tool Calls
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        {msg.tool_calls!.map(call => (
                                                            <ToolCallCard
                                                                key={call.call_id}
                                                                callId={call.call_id}
                                                                toolName={call.tool_name}
                                                                arguments={call.arguments}
                                                                isRunning={false}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {hasThinking && (
                                            <ThinkingBlock
                                                content={thinking!}
                                                requestVisibility={requestVisibility}
                                            />
                                        )}
                                    </>
                                }
                                <div className="chat-workflow-step chat-section-reveal">
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
                                <div className="chat-workflow-step chat-section-reveal">
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
