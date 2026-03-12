import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    getKnowledge,
    updateKnowledge,
    generateKnowledgeIntelligence,
    deleteKnowledge,
    listSettings,
    getKnowledgeFileUrl,
} from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Sparkles, Brain, Tag, Loader2,
    ChevronRight, ChevronLeft, CheckSquare, Calendar, Star,
    FileText, ChevronDown, Pencil, Check, Link2, ExternalLink,
    Download, File, FileImage, FileAudio, Music,
} from 'lucide-react'
// EditorDispatcher available at @/components/knowledge/editors/EditorDispatcher for full CM6 editing
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

function RenderedContent({ content, className }: { content: string; className?: string }) {
    const html = md.render(content || '')
    return (
        <div
            className={`prose prose-sm prose-invert max-w-none text-foreground/85 leading-relaxed ${className ?? ''}`}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}

const MIN_KNOWLEDGE_INTELLIGENCE_PCT = 15
const MAX_KNOWLEDGE_INTELLIGENCE_PCT = 40
const DEFAULT_KNOWLEDGE_INTELLIGENCE_PCT = 25
const KNOWLEDGE_INTELLIGENCE_COLLAPSED_WIDTH = 56
const KNOWLEDGE_INTELLIGENCE_WIDTH_STORAGE_KEY = 'openforge.knowledge.intelligence.pct'
const KNOWLEDGE_INTELLIGENCE_COLLAPSED_STORAGE_KEY = 'openforge.knowledge.intelligence.collapsed'
type KnowledgeIntelligenceSectionKey = 'summary' | 'tasks' | 'facts' | 'crucial_things' | 'timelines'
const DISCARDABLE_DRAFT_CLEANUP_DELAY_MS = 700
const pendingDiscardableDraftCleanup = new Map<string, number>()
const pendingKnowledgeExitIntelligence = new Map<string, number>()
const AUTO_KNOWLEDGE_INTELLIGENCE_KEY = 'automation.auto_knowledge_intelligence_enabled'

const clampKnowledgeIntelligencePct = (value: number) =>
    Math.max(MIN_KNOWLEDGE_INTELLIGENCE_PCT, Math.min(MAX_KNOWLEDGE_INTELLIGENCE_PCT, value))

const parseBooleanSetting = (value: unknown, fallback: boolean) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
        if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
    }
    return fallback
}

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(timer)
    }, [value, delay])
    return debouncedValue
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const GIST_LANGUAGES = [
    'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'c', 'cpp',
    'csharp', 'php', 'ruby', 'swift', 'kotlin', 'scala', 'shell', 'sql',
    'html', 'css', 'json', 'yaml', 'toml', 'markdown', 'plaintext',
]

export default function KnowledgePage() {
    const { workspaceId = '', knowledgeId = '' } = useParams<{ workspaceId: string; knowledgeId: string }>()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const qc = useQueryClient()
    const { error: showError } = useToast()
    const { on } = useWorkspaceWebSocket(workspaceId)

    // Intelligence siderail state
    const [isKnowledgeIntelligenceCollapsed, setIsKnowledgeIntelligenceCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.localStorage.getItem(KNOWLEDGE_INTELLIGENCE_COLLAPSED_STORAGE_KEY) === '1'
    })
    const [activeKnowledgeIntelligenceSection, setActiveKnowledgeIntelligenceSection] = useState<KnowledgeIntelligenceSectionKey | null>('summary')
    const [knowledgeIntelligencePct, setKnowledgeIntelligencePct] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_KNOWLEDGE_INTELLIGENCE_PCT
        const raw = window.localStorage.getItem(KNOWLEDGE_INTELLIGENCE_WIDTH_STORAGE_KEY)
        const parsed = raw ? parseFloat(raw) : NaN
        return Number.isFinite(parsed) ? clampKnowledgeIntelligencePct(parsed) : DEFAULT_KNOWLEDGE_INTELLIGENCE_PCT
    })

    // Edit mode state
    const [isEditing, setIsEditing] = useState(searchParams.get('edit') === '1')

    // Content state
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [gistLang, setGistLang] = useState('typescript')
    const [gistCode, setGistCode] = useState('')
    const [initialized, setInitialized] = useState(false)

    // Save/AI state
    const [saving, setSaving] = useState(false)
    const [aiLoading, setAiLoading] = useState<string | null>(null)

    // Refs for auto-intelligence on exit
    const hadMeaningfulInputRef = useRef(false)
    const latestDraftStateRef = useRef<{ title: string; content: string; knowledgeRecord: any | null }>({ title: '', content: '', knowledgeRecord: null })

    const isDiscardableDraft = useMemo(
        () => searchParams.get('draft') === '1',
        [searchParams],
    )

    const { data: knowledgeRecord, isLoading } = useQuery({
        queryKey: ['knowledge-item', knowledgeId],
        queryFn: () => getKnowledge(workspaceId, knowledgeId),
        enabled: !!knowledgeId,
        refetchOnMount: 'always',
    })

    // Initialize state from fetched record (once)
    useEffect(() => {
        if (knowledgeRecord && !initialized) {
            const initTitle = knowledgeRecord.title ?? ''
            const initContent = knowledgeRecord.content ?? ''
            const initGistLang = knowledgeRecord.gist_language ?? 'typescript'
            setTitle(initTitle)
            setContent(initContent)
            setGistCode(initContent)
            setGistLang(initGistLang)
            saveRef.current = { content: initContent, title: initTitle, gistCode: initContent, gistLang: initGistLang }
            setInitialized(true)
        }
    }, [knowledgeRecord, initialized])

    // Keep latest draft ref up to date
    useEffect(() => {
        latestDraftStateRef.current = { title, content, knowledgeRecord: knowledgeRecord ?? null }
    }, [title, content, knowledgeRecord])

    // Auto-intelligence on exit + discardable draft cleanup
    useEffect(() => {
        if (!knowledgeId) return
        const cleanupKey = `${workspaceId}:${knowledgeId}`

        const pendingTimer = pendingDiscardableDraftCleanup.get(cleanupKey)
        if (pendingTimer !== undefined) {
            window.clearTimeout(pendingTimer)
            pendingDiscardableDraftCleanup.delete(cleanupKey)
        }
        const pendingIntelligenceTimer = pendingKnowledgeExitIntelligence.get(cleanupKey)
        if (pendingIntelligenceTimer !== undefined) {
            window.clearTimeout(pendingIntelligenceTimer)
            pendingKnowledgeExitIntelligence.delete(cleanupKey)
        }

        return () => {
            const latest = latestDraftStateRef.current
            const titleText = (latest.title || latest.knowledgeRecord?.title || '').trim()
            const contentText = (latest.content || latest.knowledgeRecord?.content || '').trim()
            const urlText = (latest.knowledgeRecord?.url || '').trim()
            const aiTitleText = (latest.knowledgeRecord?.ai_title || '').trim()
            const aiSummaryText = (latest.knowledgeRecord?.ai_summary || '').trim()
            const hasInsights = !!latest.knowledgeRecord?.insights && Object.keys(latest.knowledgeRecord.insights).length > 0
            const hasTags = Array.isArray(latest.knowledgeRecord?.tags) && latest.knowledgeRecord.tags.length > 0
            const hasIntelligence = !!aiSummaryText && hasInsights
            const shouldGenerateIntelligenceOnExit =
                latest.knowledgeRecord?.type === 'note'
                && contentText.length > 20
                && !hasIntelligence

            const isStillEmpty = !titleText && !contentText && !urlText && !aiTitleText && !aiSummaryText && !hasInsights && !hasTags
            const scheduleIntelligenceOnExit = () => {
                const timerId = window.setTimeout(() => {
                    if (pendingKnowledgeExitIntelligence.get(cleanupKey) !== timerId) return
                    pendingKnowledgeExitIntelligence.delete(cleanupKey)
                    void (async () => {
                        try {
                            await updateKnowledge(workspaceId, knowledgeId, {
                                content: latest.content,
                                title: latest.title || null,
                            })
                        } catch {
                            // Best-effort save before background intelligence run.
                        }
                        try {
                            const settings = await listSettings()
                            const rawAutoFlag = Array.isArray(settings)
                                ? settings.find((item: { key?: string; value?: unknown }) => item?.key === AUTO_KNOWLEDGE_INTELLIGENCE_KEY)?.value
                                : undefined
                            const autoIntelligenceEnabled = parseBooleanSetting(rawAutoFlag, true)
                            if (!autoIntelligenceEnabled) return
                            await generateKnowledgeIntelligence(workspaceId, knowledgeId)
                            qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
                            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
                        } catch {
                            // Best-effort automation on exit.
                        }
                    })()
                }, DISCARDABLE_DRAFT_CLEANUP_DELAY_MS)
                pendingKnowledgeExitIntelligence.set(cleanupKey, timerId)
            }

            if (!isDiscardableDraft) {
                if (shouldGenerateIntelligenceOnExit) {
                    scheduleIntelligenceOnExit()
                }
                return
            }

            if (!isStillEmpty) {
                if (shouldGenerateIntelligenceOnExit) {
                    scheduleIntelligenceOnExit()
                }
                return
            }

            if (hadMeaningfulInputRef.current) return

            const timerId = window.setTimeout(() => {
                if (pendingDiscardableDraftCleanup.get(cleanupKey) !== timerId) return
                pendingDiscardableDraftCleanup.delete(cleanupKey)
                deleteKnowledge(workspaceId, knowledgeId)
                    .then(() => qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] }))
                    .catch(() => { /* best-effort cleanup */ })
            }, DISCARDABLE_DRAFT_CLEANUP_DELAY_MS)
            pendingDiscardableDraftCleanup.set(cleanupKey, timerId)
        }
    }, [isDiscardableDraft, knowledgeId, workspaceId, qc])

    // WebSocket: refresh knowledgeRecord on AI update
    useEffect(() => {
        return on('knowledge_updated', (msg: Record<string, unknown>) => {
            if (msg.knowledge_id === knowledgeId) {
                qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
            }
        })
    }, [knowledgeId, on, qc])

    // Auto-save (debounced) — content + title
    const debouncedContent = useDebounce(content, 800)
    const debouncedTitle = useDebounce(title, 800)
    const debouncedGistCode = useDebounce(gistCode, 800)
    const debouncedGistLang = useDebounce(gistLang, 800)
    const saveRef = useRef({ content: '', title: '', gistCode: '', gistLang: '' })

    useEffect(() => {
        if (!knowledgeRecord || !initialized) return
        const type = knowledgeRecord.type ?? 'note'
        if (type === 'gist') {
            if (
                debouncedGistCode === saveRef.current.gistCode &&
                debouncedGistLang === saveRef.current.gistLang &&
                debouncedTitle === saveRef.current.title
            ) return
            setSaving(true)
            updateKnowledge(workspaceId, knowledgeId, {
                content: debouncedGistCode,
                title: debouncedTitle || null,
                gist_language: debouncedGistLang,
            })
                .then(() => {
                    saveRef.current = { ...saveRef.current, gistCode: debouncedGistCode, gistLang: debouncedGistLang, title: debouncedTitle }
                    qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
                    qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
                })
                .finally(() => setTimeout(() => setSaving(false), 500))
        } else {
            if (debouncedContent === saveRef.current.content && debouncedTitle === saveRef.current.title) return
            setSaving(true)
            updateKnowledge(workspaceId, knowledgeId, { content: debouncedContent, title: debouncedTitle || null })
                .then(() => {
                    saveRef.current = { ...saveRef.current, content: debouncedContent, title: debouncedTitle }
                    qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
                    qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
                })
                .finally(() => setTimeout(() => setSaving(false), 500))
        }
    }, [debouncedContent, debouncedTitle, debouncedGistCode, debouncedGistLang, knowledgeRecord, initialized, knowledgeId, workspaceId, qc])

    const getActionErrorMessage = (reason: unknown) => {
        const err = reason as { response?: { data?: { detail?: string } }, message?: string }
        return err?.response?.data?.detail || err?.message || 'Unknown error'
    }

    const handleGenerateIntelligence = async () => {
        if (aiLoading) return
        setAiLoading('intelligence')
        try {
            const result = await generateKnowledgeIntelligence(workspaceId, knowledgeId)
            const generatedTitle = (result?.ai_title ?? result?.title ?? '').trim()
            if (generatedTitle) {
                setTitle(generatedTitle)
            }
            if (result?.insights) {
                setIsKnowledgeIntelligenceCollapsed(false)
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(KNOWLEDGE_INTELLIGENCE_COLLAPSED_STORAGE_KEY, '0')
                }
            }

            qc.setQueryData(['knowledge-item', knowledgeId], (prev: any) => {
                if (!prev) return prev
                const next: any = { ...prev }
                if (generatedTitle) {
                    const titleWasEmpty = !(prev.title ?? '').trim()
                    next.ai_title = generatedTitle
                    if (titleWasEmpty) {
                        next.title = generatedTitle
                    }
                }
                if (result?.summary) {
                    next.ai_summary = result.summary
                }
                if (result?.insights) {
                    next.insights = result.insights
                }
                if (Array.isArray(result?.tags) && result.tags.length > 0) {
                    const currentTags = Array.isArray(prev.tags) ? prev.tags : []
                    next.tags = Array.from(new Set([...currentTags, ...result.tags]))
                }
                return next
            })

            qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        } catch (err: unknown) {
            showError('Intelligence generation failed', getActionErrorMessage(err))
        } finally {
            setAiLoading(null)
        }
    }

    // Intelligence siderail helpers
    const knowledgeAiAction = { id: 'intelligence', icon: Brain, label: 'Generate Intelligence' } as const
    const summaryText = (knowledgeRecord?.ai_summary ?? '').trim()
    const tasksItems = Array.isArray(knowledgeRecord?.insights?.tasks) ? knowledgeRecord.insights.tasks : []
    const factsItems = Array.isArray(knowledgeRecord?.insights?.facts) ? knowledgeRecord.insights.facts : []
    const crucialThingsItems = Array.isArray(knowledgeRecord?.insights?.crucial_things) ? knowledgeRecord.insights.crucial_things : []
    const timelineItems = Array.isArray(knowledgeRecord?.insights?.timelines) ? knowledgeRecord.insights.timelines : []
    const knowledgeInsightCount = useMemo(() => {
        const insights = knowledgeRecord?.insights ?? {}
        return ['tasks', 'timelines', 'facts', 'crucial_things'].reduce((count, key) => {
            const items = insights[key]
            return count + (Array.isArray(items) ? items.length : 0)
        }, 0)
    }, [knowledgeRecord?.insights])
    const knowledgeIntelligenceSections = useMemo(() => ([
        {
            key: 'summary' as const,
            label: 'Summary',
            icon: Sparkles,
            items: [],
            count: summaryText ? 1 : 0,
            emptyLabel: 'No summary yet. Use the top toolbar to generate it.',
        },
        {
            key: 'tasks' as const,
            label: 'Tasks',
            icon: CheckSquare,
            items: tasksItems,
            count: tasksItems.length,
            emptyLabel: 'No tasks extracted yet.',
        },
        {
            key: 'facts' as const,
            label: 'Facts',
            icon: FileText,
            items: factsItems,
            count: factsItems.length,
            emptyLabel: 'No facts extracted yet.',
        },
        {
            key: 'crucial_things' as const,
            label: 'Crucial Things',
            icon: Star,
            items: crucialThingsItems,
            count: crucialThingsItems.length,
            emptyLabel: 'No crucial things extracted yet.',
        },
        {
            key: 'timelines' as const,
            label: 'Timelines',
            icon: Calendar,
            items: timelineItems,
            count: timelineItems.length,
            emptyLabel: 'No timelines extracted yet.',
        },
    ]), [summaryText, tasksItems, factsItems, crucialThingsItems, timelineItems])

    const toggleKnowledgeIntelligenceSidebar = useCallback(() => {
        setIsKnowledgeIntelligenceCollapsed(prev => {
            const next = !prev
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(KNOWLEDGE_INTELLIGENCE_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
            }
            return next
        })
    }, [])

    const toggleKnowledgeIntelligenceSection = useCallback((section: KnowledgeIntelligenceSectionKey) => {
        setActiveKnowledgeIntelligenceSection(prev => (prev === section ? null : section))
    }, [])

    const formatKnowledgeIntelligenceItem = useCallback((section: KnowledgeIntelligenceSectionKey, item: unknown): string => {
        if (section === 'timelines' && typeof item === 'object' && item !== null && !Array.isArray(item)) {
            const timeline = item as { date?: unknown, event?: unknown }
            const date = typeof timeline.date === 'string' ? timeline.date.trim() : ''
            const event = typeof timeline.event === 'string' ? timeline.event.trim() : ''
            if (date && event) return `${date}: ${event}`
            if (date) return date
            if (event) return event
        }
        if (typeof item === 'string') return item
        try {
            return JSON.stringify(item)
        } catch {
            return String(item ?? '')
        }
    }, [])

    const handleKnowledgeIntelligenceResizeStart = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        const startX = e.clientX
        const startPct = knowledgeIntelligencePct
        const containerWidth = e.currentTarget.parentElement?.parentElement?.offsetWidth || window.innerWidth
        let currentPct = startPct

        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaPx = startX - moveEvent.clientX
            const deltaPct = (deltaPx / containerWidth) * 100
            currentPct = clampKnowledgeIntelligencePct(startPct + deltaPct)
            setKnowledgeIntelligencePct(currentPct)
        }

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.localStorage.setItem(KNOWLEDGE_INTELLIGENCE_WIDTH_STORAGE_KEY, String(currentPct))
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    const type = knowledgeRecord?.type ?? 'note'
    const fileUrl = getKnowledgeFileUrl(workspaceId, knowledgeId)
    const metadata = knowledgeRecord?.file_metadata ?? {}
    const isFileBased = ['image', 'audio', 'pdf', 'document', 'sheet', 'slides'].includes(type)

    return (
        <div className="flex h-full min-h-0 gap-3">
            {/* Main content panel */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0 border-b border-border/30">
                    {/* Collapse / back to modal button */}
                    <button
                        type="button"
                        onClick={() => navigate(`/w/${workspaceId}?k=${knowledgeId}`)}
                        className="btn-ghost p-1.5 gap-1.5 text-xs flex items-center"
                    >
                        <ChevronDown className="w-4 h-4" />
                        <span className="hidden sm:inline">Back to modal</span>
                    </button>

                    <div className="flex-1" />

                    {/* Save indicator */}
                    {saving && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Saving
                        </span>
                    )}

                    {/* Edit / Done toggle — only for non-file types (file types use view-only) */}
                    {initialized && !isFileBased && (
                        <button
                            type="button"
                            onClick={() => setIsEditing(prev => !prev)}
                            className="btn-ghost text-xs py-1 px-2 gap-1 flex items-center"
                            title={isEditing ? 'Done editing' : 'Edit'}
                        >
                            {isEditing
                                ? <><Check className="w-3.5 h-3.5" /><span className="hidden sm:inline">Done</span></>
                                : <><Pencil className="w-3.5 h-3.5" /><span className="hidden sm:inline">Edit</span></>
                            }
                        </button>
                    )}

                    {/* Generate Intelligence button */}
                    <button
                        type="button"
                        onClick={handleGenerateIntelligence}
                        disabled={!!aiLoading}
                        className="btn-ghost text-xs py-1 px-2 gap-1 flex items-center"
                        title={knowledgeAiAction.label}
                    >
                        {aiLoading === knowledgeAiAction.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <knowledgeAiAction.icon className="w-3.5 h-3.5" />
                        }
                        <span className="hidden sm:inline">{knowledgeAiAction.label}</span>
                    </button>
                </div>

                {/* Scrollable content area */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                    {/* Loading skeleton */}
                    {isLoading && (
                        <div className="space-y-3 animate-pulse">
                            <div className="h-8 bg-muted/40 rounded-lg w-2/3" />
                            <div className="h-4 bg-muted/30 rounded w-1/4" />
                            <div className="h-4 bg-muted/20 rounded w-full mt-6" />
                            <div className="h-4 bg-muted/20 rounded w-5/6" />
                            <div className="h-4 bg-muted/20 rounded w-4/6" />
                        </div>
                    )}

                    {initialized && knowledgeRecord && (
                        <>
                            {/* Tags row */}
                            {Array.isArray(knowledgeRecord.tags) && knowledgeRecord.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    <Tag className="w-3.5 h-3.5 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
                                    {knowledgeRecord.tags.map((tag: string) => (
                                        <span key={tag} className="chip-accent text-xs">{tag}</span>
                                    ))}
                                </div>
                            )}

                            {/* ── Standard Note ── */}
                            {type === 'note' && (
                                <div className="flex flex-col min-h-0">
                                    {isEditing ? (
                                        <input
                                            className="w-full text-3xl font-bold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground/40 mb-4"
                                            placeholder={knowledgeRecord.ai_title ?? 'Untitled'}
                                            value={title}
                                            onChange={e => {
                                                if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                                setTitle(e.target.value)
                                            }}
                                        />
                                    ) : (
                                        <h1 className="text-3xl font-bold text-foreground mb-4">
                                            {title.trim() || knowledgeRecord.ai_title || <span className="text-muted-foreground/40">Untitled</span>}
                                        </h1>
                                    )}
                                    {isEditing ? (
                                        <textarea
                                            className="flex-1 min-h-[300px] w-full bg-transparent border border-border/30 rounded-xl p-4 text-sm resize-none outline-none text-foreground leading-relaxed placeholder-muted-foreground/40"
                                            value={content}
                                            onChange={e => {
                                                if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                                setContent(e.target.value)
                                            }}
                                            placeholder="Start writing... (markdown supported)"
                                        />
                                    ) : (
                                        <RenderedContent
                                            content={content}
                                            className="flex-1"
                                        />
                                    )}
                                </div>
                            )}

                            {/* ── Fleeting Note ── */}
                            {type === 'fleeting' && (
                                <div className="flex flex-col min-h-0">
                                    {isEditing ? (
                                        <textarea
                                            className="flex-1 min-h-[400px] w-full bg-transparent border border-border/30 rounded-xl p-4 text-sm resize-none outline-none text-foreground leading-relaxed placeholder-muted-foreground/40"
                                            value={content}
                                            onChange={e => {
                                                if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                                setContent(e.target.value)
                                            }}
                                            placeholder="What's fleeting on your mind?"
                                        />
                                    ) : (
                                        content.trim() ? (
                                            <RenderedContent content={content} className="flex-1" />
                                        ) : (
                                            <p className="text-muted-foreground/40 text-sm italic">Nothing captured yet.</p>
                                        )
                                    )}
                                </div>
                            )}

                            {/* ── Bookmark ── */}
                            {type === 'bookmark' && (
                                <div className="flex flex-col gap-4">
                                    {/* URL bar */}
                                    <div className="bg-muted/20 border border-border/50 rounded-xl px-4 py-3 flex items-center gap-3">
                                        <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                        {isEditing ? (
                                            <input
                                                className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder-muted-foreground/40"
                                                placeholder="https://..."
                                                value={knowledgeRecord.url ?? ''}
                                                readOnly
                                            />
                                        ) : (
                                            <span className="flex-1 text-sm text-foreground truncate">
                                                {knowledgeRecord.url ?? <span className="text-muted-foreground/50">No URL</span>}
                                            </span>
                                        )}
                                        {knowledgeRecord.url && (
                                            <a
                                                href={knowledgeRecord.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                                                title="Open in new tab"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>

                                    {/* Title */}
                                    {isEditing ? (
                                        <input
                                            className="w-full text-2xl font-bold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground/40"
                                            placeholder={knowledgeRecord.ai_title ?? 'Title'}
                                            value={title}
                                            onChange={e => {
                                                if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                                setTitle(e.target.value)
                                            }}
                                        />
                                    ) : (
                                        <h1 className="text-2xl font-bold text-foreground">
                                            {title.trim() || knowledgeRecord.ai_title || <span className="text-muted-foreground/40">Untitled Bookmark</span>}
                                        </h1>
                                    )}

                                    {/* Notes */}
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Notes</p>
                                        {isEditing ? (
                                            <textarea
                                                className="min-h-[200px] w-full bg-transparent border border-border/30 rounded-xl p-4 text-sm resize-none outline-none text-foreground leading-relaxed placeholder-muted-foreground/40"
                                                value={content}
                                                onChange={e => {
                                                    if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                                    setContent(e.target.value)
                                                }}
                                                placeholder="Add notes about this bookmark..."
                                            />
                                        ) : (
                                            content.trim() ? (
                                                <RenderedContent content={content} />
                                            ) : (
                                                <p className="text-muted-foreground/40 text-sm italic">No notes.</p>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── Gist ── */}
                            {type === 'gist' && (
                                <div className="flex flex-col gap-3">
                                    {/* Top row: language + title */}
                                    <div className="flex items-center gap-3">
                                        {isEditing ? (
                                            <select
                                                value={gistLang}
                                                onChange={e => setGistLang(e.target.value)}
                                                className="bg-muted/30 border border-border/50 rounded-lg px-2 py-1 text-xs font-mono text-foreground outline-none"
                                            >
                                                {GIST_LANGUAGES.map(lang => (
                                                    <option key={lang} value={lang}>{lang}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="bg-accent/15 border border-accent/25 text-accent rounded-lg px-2 py-1 text-xs font-mono">
                                                {gistLang}
                                            </span>
                                        )}
                                        {isEditing ? (
                                            <input
                                                className="flex-1 bg-transparent border-none outline-none text-lg font-semibold text-foreground placeholder-muted-foreground/40"
                                                placeholder="Gist title"
                                                value={title}
                                                onChange={e => {
                                                    if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                                    setTitle(e.target.value)
                                                }}
                                            />
                                        ) : (
                                            <h2 className="flex-1 text-lg font-semibold text-foreground">
                                                {title.trim() || knowledgeRecord.ai_title || <span className="text-muted-foreground/40">Untitled Gist</span>}
                                            </h2>
                                        )}
                                    </div>

                                    {/* Code area */}
                                    {isEditing ? (
                                        <textarea
                                            className="flex-1 w-full bg-muted/20 border border-border/40 rounded-xl p-4 text-sm font-mono resize-none outline-none text-foreground leading-relaxed"
                                            rows={20}
                                            spellCheck={false}
                                            value={gistCode}
                                            onChange={e => {
                                                if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                                setGistCode(e.target.value)
                                            }}
                                            placeholder={`// Start writing ${gistLang}...`}
                                        />
                                    ) : (
                                        <pre className="flex-1 overflow-auto text-xs font-mono bg-muted/20 border border-border/40 rounded-xl p-4 leading-relaxed text-foreground whitespace-pre-wrap">
                                            {gistCode || <span className="text-muted-foreground/40">No code yet.</span>}
                                        </pre>
                                    )}
                                </div>
                            )}

                            {/* ── Audio ── */}
                            {/* ── Audio ── */}
                            {type === 'audio' && (
                                <div className="flex flex-col gap-4">
                                    <h1 className="text-2xl font-bold text-foreground">
                                        {title.trim() || knowledgeRecord.ai_title || (
                                            <span className="text-muted-foreground/40 flex items-center gap-2">
                                                <Music className="w-5 h-5" /> Audio Recording
                                            </span>
                                        )}
                                    </h1>

                                    <audio controls src={fileUrl} className="w-full rounded-xl" />

                                    {/* Transcript */}
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Transcript</p>
                                        {isEditing ? (
                                            <textarea
                                                className="min-h-[200px] w-full bg-transparent border border-border/30 rounded-xl p-4 text-sm resize-none outline-none text-foreground leading-relaxed placeholder-muted-foreground/40"
                                                value={content}
                                                onChange={e => setContent(e.target.value)}
                                                placeholder="Transcript content..."
                                            />
                                        ) : content.trim() ? (
                                            <RenderedContent content={content} />
                                        ) : (
                                            <p className="text-muted-foreground/40 text-sm italic">No transcript available.</p>
                                        )}
                                    </div>

                                    {/* Metadata */}
                                    {(metadata.duration != null || metadata.format || metadata.sample_rate != null || metadata.channels != null || metadata.bitrate != null) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                            <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                {metadata.duration != null && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Duration</span>
                                                        <span className="font-mono text-foreground/80">{Math.floor(metadata.duration / 60)}:{String(Math.floor(metadata.duration % 60)).padStart(2, '0')}</span>
                                                    </div>
                                                )}
                                                {metadata.format && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Format</span>
                                                        <span className="font-mono text-foreground/80">{metadata.format}</span>
                                                    </div>
                                                )}
                                                {metadata.sample_rate != null && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Sample Rate</span>
                                                        <span className="font-mono text-foreground/80">{metadata.sample_rate} Hz</span>
                                                    </div>
                                                )}
                                                {metadata.channels != null && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Channels</span>
                                                        <span className="font-mono text-foreground/80">{metadata.channels}</span>
                                                    </div>
                                                )}
                                                {metadata.bitrate != null && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Bitrate</span>
                                                        <span className="font-mono text-foreground/80">{metadata.bitrate} kbps</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Image ── */}
                            {type === 'image' && (
                                <div className="flex flex-col gap-4">
                                    <h1 className="text-2xl font-bold text-foreground">
                                        {title.trim() || knowledgeRecord.ai_title || (
                                            <span className="text-muted-foreground/40 flex items-center gap-2">
                                                <FileImage className="w-5 h-5" /> Image
                                            </span>
                                        )}
                                    </h1>

                                    <img
                                        src={fileUrl}
                                        alt={title || knowledgeRecord.ai_title || 'Image'}
                                        className="max-w-full max-h-[60vh] object-contain rounded-xl border border-border/40 mx-auto block"
                                    />

                                    {/* Content (vision description + OCR) */}
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                        {content.trim() ? (
                                            <RenderedContent content={content} />
                                        ) : (
                                            <p className="text-muted-foreground/40 text-sm italic">No text detected in this image.</p>
                                        )}
                                    </div>

                                    {/* EXIF Metadata */}
                                    {metadata.exif && Object.keys(metadata.exif).length > 0 && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                            <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                {metadata.exif.width && metadata.exif.height && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Dimensions</span>
                                                        <span className="font-mono text-foreground/80">{metadata.exif.width}×{metadata.exif.height}</span>
                                                    </div>
                                                )}
                                                {metadata.exif.format && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Format</span>
                                                        <span className="font-mono text-foreground/80">{metadata.exif.format}</span>
                                                    </div>
                                                )}
                                                {metadata.exif.Make && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Camera</span>
                                                        <span className="font-mono text-foreground/80">{metadata.exif.Make}{metadata.exif.Model ? ` ${metadata.exif.Model}` : ''}</span>
                                                    </div>
                                                )}
                                                {metadata.exif.DateTime && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Date Taken</span>
                                                        <span className="font-mono text-foreground/80">{metadata.exif.DateTime}</span>
                                                    </div>
                                                )}
                                                {metadata.exif.ExposureTime && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Exposure</span>
                                                        <span className="font-mono text-foreground/80">{metadata.exif.ExposureTime}s</span>
                                                    </div>
                                                )}
                                                {metadata.exif.FNumber && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">Aperture</span>
                                                        <span className="font-mono text-foreground/80">f/{metadata.exif.FNumber}</span>
                                                    </div>
                                                )}
                                                {metadata.exif.ISOSpeedRatings && (
                                                    <div className="flex items-center justify-between px-3 py-2 text-sm">
                                                        <span className="text-muted-foreground/70">ISO</span>
                                                        <span className="font-mono text-foreground/80">{metadata.exif.ISOSpeedRatings}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── PDF ── */}
                            {type === 'pdf' && (
                                <div className="flex flex-col gap-4">
                                    <h1 className="text-2xl font-bold text-foreground">
                                        {title.trim() || knowledgeRecord.ai_title || (
                                            <span className="text-muted-foreground/40 flex items-center gap-2">
                                                <File className="w-5 h-5" /> PDF Document
                                            </span>
                                        )}
                                    </h1>

                                    <div className="bg-muted/20 border border-border/50 rounded-xl px-4 py-3 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                                            <File className="w-5 h-5 text-accent" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{knowledgeRecord.original_filename || 'PDF file'}</p>
                                            <div className="flex flex-wrap gap-3 mt-1">
                                                {knowledgeRecord.file_size && <span className="text-xs text-muted-foreground">{formatFileSize(knowledgeRecord.file_size)}</span>}
                                                {metadata.page_count != null && <span className="text-xs text-muted-foreground">{metadata.page_count} pages</span>}
                                            </div>
                                        </div>
                                        <a href={fileUrl} download className="btn-ghost text-xs py-1.5 px-3 gap-1.5 flex items-center flex-shrink-0">
                                            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Download</span>
                                        </a>
                                    </div>

                                    {content.trim() && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                            <RenderedContent content={content} />
                                        </div>
                                    )}

                                    {(metadata.author || metadata.pdf_title || metadata.creation_date || metadata.producer) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                            <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                {metadata.pdf_title && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Title</span><span className="text-foreground/80 text-right max-w-[60%] truncate">{metadata.pdf_title}</span></div>}
                                                {metadata.author && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Author</span><span className="text-foreground/80">{metadata.author}</span></div>}
                                                {metadata.creation_date && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Created</span><span className="font-mono text-foreground/80">{metadata.creation_date}</span></div>}
                                                {metadata.producer && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Producer</span><span className="text-foreground/80 truncate max-w-[60%] text-right">{metadata.producer}</span></div>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Document ── */}
                            {type === 'document' && (
                                <div className="flex flex-col gap-4">
                                    <h1 className="text-2xl font-bold text-foreground">
                                        {title.trim() || knowledgeRecord.ai_title || (
                                            <span className="text-muted-foreground/40 flex items-center gap-2">
                                                <File className="w-5 h-5" /> Document
                                            </span>
                                        )}
                                    </h1>

                                    <div className="bg-muted/20 border border-border/50 rounded-xl px-4 py-3 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                                            <File className="w-5 h-5 text-accent" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{knowledgeRecord.original_filename || 'Document file'}</p>
                                            <div className="flex flex-wrap gap-3 mt-1">
                                                {knowledgeRecord.file_size && <span className="text-xs text-muted-foreground">{formatFileSize(knowledgeRecord.file_size)}</span>}
                                                {metadata.word_count != null && <span className="text-xs text-muted-foreground">{metadata.word_count} words</span>}
                                            </div>
                                        </div>
                                        <a href={fileUrl} download className="btn-ghost text-xs py-1.5 px-3 gap-1.5 flex items-center flex-shrink-0">
                                            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Download</span>
                                        </a>
                                    </div>

                                    {content.trim() && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                            <RenderedContent content={content} />
                                        </div>
                                    )}

                                    {(metadata.author || metadata.doc_title || metadata.paragraph_count != null || metadata.section_count != null) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                            <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                {metadata.doc_title && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Title</span><span className="text-foreground/80 truncate max-w-[60%] text-right">{metadata.doc_title}</span></div>}
                                                {metadata.author && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Author</span><span className="text-foreground/80">{metadata.author}</span></div>}
                                                {metadata.paragraph_count != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Paragraphs</span><span className="font-mono text-foreground/80">{metadata.paragraph_count}</span></div>}
                                                {metadata.section_count != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Sections</span><span className="font-mono text-foreground/80">{metadata.section_count}</span></div>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Sheet ── */}
                            {type === 'sheet' && (
                                <div className="flex flex-col gap-4">
                                    <h1 className="text-2xl font-bold text-foreground">
                                        {title.trim() || knowledgeRecord.ai_title || (
                                            <span className="text-muted-foreground/40 flex items-center gap-2">
                                                <File className="w-5 h-5" /> Sheet
                                            </span>
                                        )}
                                    </h1>

                                    <div className="bg-muted/20 border border-border/50 rounded-xl px-4 py-3 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                                            <File className="w-5 h-5 text-accent" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{knowledgeRecord.original_filename || 'XLSX file'}</p>
                                            <div className="flex flex-wrap gap-3 mt-1">
                                                {knowledgeRecord.file_size && <span className="text-xs text-muted-foreground">{formatFileSize(knowledgeRecord.file_size)}</span>}
                                                {metadata.total_sheets != null && <span className="text-xs text-muted-foreground">{metadata.total_sheets} sheets</span>}
                                                {metadata.total_rows != null && <span className="text-xs text-muted-foreground">{metadata.total_rows} rows</span>}
                                            </div>
                                        </div>
                                        <a href={fileUrl} download className="btn-ghost text-xs py-1.5 px-3 gap-1.5 flex items-center flex-shrink-0">
                                            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Download</span>
                                        </a>
                                    </div>

                                    {content.trim() && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                            <RenderedContent content={content} />
                                        </div>
                                    )}

                                    {(metadata.total_sheets != null || metadata.total_rows != null || (metadata.sheet_names && metadata.sheet_names.length > 0)) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                            <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                {metadata.total_sheets != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Sheets</span><span className="font-mono text-foreground/80">{metadata.total_sheets}</span></div>}
                                                {metadata.total_rows != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Total Rows</span><span className="font-mono text-foreground/80">{metadata.total_rows}</span></div>}
                                                {metadata.sheet_names && metadata.sheet_names.length > 0 && (
                                                    <div className="flex items-start justify-between px-3 py-2 text-sm gap-4">
                                                        <span className="text-muted-foreground/70 shrink-0">Sheet Names</span>
                                                        <span className="text-foreground/80 text-right">{(metadata.sheet_names as string[]).join(', ')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Slides ── */}
                            {type === 'slides' && (
                                <div className="flex flex-col gap-4">
                                    <h1 className="text-2xl font-bold text-foreground">
                                        {title.trim() || knowledgeRecord.ai_title || (
                                            <span className="text-muted-foreground/40 flex items-center gap-2">
                                                <File className="w-5 h-5" /> Slides
                                            </span>
                                        )}
                                    </h1>

                                    <div className="bg-muted/20 border border-border/50 rounded-xl px-4 py-3 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                                            <File className="w-5 h-5 text-accent" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{knowledgeRecord.original_filename || 'Slides file'}</p>
                                            <div className="flex flex-wrap gap-3 mt-1">
                                                {knowledgeRecord.file_size && <span className="text-xs text-muted-foreground">{formatFileSize(knowledgeRecord.file_size)}</span>}
                                                {metadata.slide_count != null && <span className="text-xs text-muted-foreground">{metadata.slide_count} slides</span>}
                                            </div>
                                        </div>
                                        <a href={fileUrl} download className="btn-ghost text-xs py-1.5 px-3 gap-1.5 flex items-center flex-shrink-0">
                                            <Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Download</span>
                                        </a>
                                    </div>

                                    {content.trim() && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Content</p>
                                            <RenderedContent content={content} />
                                        </div>
                                    )}

                                    {(metadata.slide_count != null || (metadata.slide_titles && metadata.slide_titles.length > 0)) && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">Metadata</p>
                                            <div className="rounded-xl border border-border/40 bg-muted/15 divide-y divide-border/30">
                                                {metadata.slide_count != null && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Slides</span><span className="font-mono text-foreground/80">{metadata.slide_count}</span></div>}
                                                {metadata.has_notes && <div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-muted-foreground/70">Speaker Notes</span><span className="text-foreground/80">Yes</span></div>}
                                                {metadata.slide_titles && metadata.slide_titles.length > 0 && (
                                                    <div className="px-3 py-2 text-sm">
                                                        <p className="text-muted-foreground/70 mb-1.5">Slide Titles</p>
                                                        <ol className="list-decimal list-inside space-y-0.5">
                                                            {(metadata.slide_titles as string[]).map((t: string, i: number) => (
                                                                <li key={i} className="text-foreground/75 text-xs truncate">{t}</li>
                                                            ))}
                                                        </ol>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Knowledge Intelligence Siderail ── */}
            <aside
                className="relative z-10 flex flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/28 py-4 transition-[width] duration-200 ease-out"
                style={{ width: isKnowledgeIntelligenceCollapsed ? `${KNOWLEDGE_INTELLIGENCE_COLLAPSED_WIDTH}px` : `${knowledgeIntelligencePct}%` }}
            >
                {!isKnowledgeIntelligenceCollapsed && (
                    <button
                        type="button"
                        onMouseDown={handleKnowledgeIntelligenceResizeStart}
                        className="absolute -left-1 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-accent/25 active:bg-accent/35 transition-colors"
                        aria-label="Resize knowledge intelligence sidebar"
                        title="Drag to resize"
                    />
                )}

                {isKnowledgeIntelligenceCollapsed ? (
                    <div className="h-full flex flex-col items-center gap-3 px-2 py-2">
                        <button
                            type="button"
                            onClick={toggleKnowledgeIntelligenceSidebar}
                            className="w-8 h-8 rounded-lg border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                            aria-label="Expand knowledge intelligence sidebar"
                            title="Expand knowledge intelligence"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="w-6 h-px bg-border/70" />
                        <Brain className="w-4 h-4 text-accent mt-1" />
                        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted-foreground [writing-mode:vertical-rl] rotate-180">
                            Insights
                        </span>
                        <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-1 text-[10px] font-semibold text-foreground/90">
                            {knowledgeInsightCount}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="px-4">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Brain className="w-4 h-4 text-accent" />
                                        <h3 className="font-semibold text-sm tracking-tight">Knowledge Intelligence</h3>
                                    </div>
                                    <p className="text-xs text-muted-foreground/90">Summary and extracted insights for this knowledge item.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleKnowledgeIntelligenceSidebar}
                                    className="w-7 h-7 rounded-md border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                                    aria-label="Collapse knowledge intelligence sidebar"
                                    title="Collapse knowledge intelligence"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2 pb-1">
                                <div className="flex-shrink-0 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                                    {knowledgeInsightCount} item{knowledgeInsightCount === 1 ? '' : 's'}
                                </div>
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-2">
                            {knowledgeIntelligenceSections.map(section => {
                                const SectionIcon = section.icon
                                const isSectionExpanded = activeKnowledgeIntelligenceSection === section.key
                                return (
                                    <section
                                        key={section.key}
                                        className={`rounded-xl border px-2.5 py-2 transition-colors ${isSectionExpanded ? 'flex min-h-0 flex-1 flex-col border-accent/35 bg-card/50' : 'flex-shrink-0 border-border/55 bg-card/22'}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleKnowledgeIntelligenceSection(section.key)}
                                            className="w-full flex items-center justify-between gap-3 py-0.5 text-left"
                                            aria-label={`${isSectionExpanded ? 'Collapse' : 'Expand'} ${section.label}`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isSectionExpanded ? 'rotate-90' : ''}`} />
                                                <div className="w-6 h-6 rounded-md flex items-center justify-center text-accent bg-accent/10 border border-accent/20">
                                                    <SectionIcon className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-foreground truncate">{section.label}</div>
                                                    <div className="text-xs text-muted-foreground/90 leading-5">
                                                        {section.count} item{section.count === 1 ? '' : 's'}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="text-[11px] font-semibold text-foreground/70 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5">
                                                {section.count}
                                            </span>
                                        </button>

                                        {isSectionExpanded && (
                                            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                                                {section.key === 'summary' ? (
                                                    summaryText ? (
                                                        <div
                                                            className="markdown-content knowledge-intelligence-markdown pl-[1.2rem] text-sm text-muted-foreground"
                                                            dangerouslySetInnerHTML={{ __html: md.render(summaryText) }}
                                                        />
                                                    ) : (
                                                        <p className="px-2 text-xs text-muted-foreground">{section.emptyLabel}</p>
                                                    )
                                                ) : section.items.length > 0 ? (
                                                    <ul className="space-y-1.5 pl-[1.2rem]">
                                                        {section.items.map((item, itemIndex) => (
                                                            <li key={itemIndex} className="flex items-start gap-2 rounded-md px-2 py-1.5">
                                                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-border flex-shrink-0" />
                                                                <span className="text-[13px] leading-5 text-foreground/90">
                                                                    {formatKnowledgeIntelligenceItem(section.key, item)}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="px-2 text-xs text-muted-foreground">{section.emptyLabel}</p>
                                                )}
                                            </div>
                                        )}
                                    </section>
                                )
                            })}
                        </div>
                    </>
                )}
            </aside>
        </div>
    )
}
