import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getKnowledge,
    updateKnowledge,
    generateKnowledgeIntelligence,
    deleteKnowledge,
    listSettings,
} from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Split, Eye, Edit3, Sparkles, Brain, Tag, Loader2,
    ChevronRight, ChevronLeft, CheckSquare, Calendar, Star,
    Copy, FileText
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator
} from '@/components/ui/context-menu'
import { CopyButton } from '@/components/shared/CopyButton'
import { isModKey } from '@/lib/keyboard'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

const MIN_KNOWLEDGE_INTELLIGENCE_WIDTH = 280
const MAX_KNOWLEDGE_INTELLIGENCE_WIDTH = 620
const DEFAULT_KNOWLEDGE_INTELLIGENCE_WIDTH = 340
const KNOWLEDGE_INTELLIGENCE_COLLAPSED_WIDTH = 56
const KNOWLEDGE_INTELLIGENCE_WIDTH_STORAGE_KEY = 'openforge.knowledge.intelligence.width'
const KNOWLEDGE_INTELLIGENCE_COLLAPSED_STORAGE_KEY = 'openforge.knowledge.intelligence.collapsed'
const KNOWLEDGE_EDITOR_HISTORY_LIMIT = 300
const MIN_KNOWLEDGE_SPLIT_RATIO = 0.24
const MAX_KNOWLEDGE_SPLIT_RATIO = 0.76
type KnowledgeIntelligenceSectionKey = 'summary' | 'tasks' | 'facts' | 'crucial_things' | 'timelines'
const DISCARDABLE_DRAFT_CLEANUP_DELAY_MS = 700
const pendingDiscardableDraftCleanup = new Map<string, number>()
const pendingKnowledgeExitIntelligence = new Map<string, number>()
const AUTO_KNOWLEDGE_INTELLIGENCE_KEY = 'automation.auto_knowledge_intelligence_enabled'

const clampKnowledgeIntelligenceWidth = (value: number) =>
    Math.max(MIN_KNOWLEDGE_INTELLIGENCE_WIDTH, Math.min(MAX_KNOWLEDGE_INTELLIGENCE_WIDTH, value))
const clampKnowledgeSplitRatio = (value: number) => Math.max(MIN_KNOWLEDGE_SPLIT_RATIO, Math.min(MAX_KNOWLEDGE_SPLIT_RATIO, value))
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

export default function KnowledgePage() {
    const { workspaceId = '', knowledgeId = '' } = useParams<{ workspaceId: string; knowledgeId: string }>()
    const location = useLocation()
    const qc = useQueryClient()
    const { error: showError } = useToast()
    const { on } = useWorkspaceWebSocket(workspaceId)
    const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split')
    const [content, setContent] = useState('')
    const [title, setTitle] = useState('')
    const [isKnowledgeIntelligenceCollapsed, setIsKnowledgeIntelligenceCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.localStorage.getItem(KNOWLEDGE_INTELLIGENCE_COLLAPSED_STORAGE_KEY) === '1'
    })
    const [activeKnowledgeIntelligenceSection, setActiveKnowledgeIntelligenceSection] = useState<KnowledgeIntelligenceSectionKey | null>('summary')
    const [knowledgeIntelligenceWidth, setKnowledgeIntelligenceWidth] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_KNOWLEDGE_INTELLIGENCE_WIDTH
        const raw = window.localStorage.getItem(KNOWLEDGE_INTELLIGENCE_WIDTH_STORAGE_KEY)
        const parsed = raw ? parseInt(raw, 10) : NaN
        return Number.isFinite(parsed) ? clampKnowledgeIntelligenceWidth(parsed) : DEFAULT_KNOWLEDGE_INTELLIGENCE_WIDTH
    })
    const [splitRatio, setSplitRatio] = useState(0.5)
    const [saving, setSaving] = useState(false)
    const [aiLoading, setAiLoading] = useState<string | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const splitContainerRef = useRef<HTMLDivElement>(null)
    const undoContentStackRef = useRef<string[]>([])
    const redoContentStackRef = useRef<string[]>([])
    const contentMirrorRef = useRef('')
    const hadMeaningfulInputRef = useRef(false)
    const latestDraftStateRef = useRef<{ title: string; content: string; knowledgeRecord: any | null }>({ title: '', content: '', knowledgeRecord: null })
    const isDiscardableDraft = useMemo(
        () => new URLSearchParams(location.search).get('draft') === '1',
        [location.search],
    )

    const { data: knowledgeRecord, isLoading } = useQuery({
        queryKey: ['knowledge-item', knowledgeId],
        queryFn: () => getKnowledge(workspaceId, knowledgeId),
        enabled: !!knowledgeId,
        refetchOnMount: 'always',
    })

    useEffect(() => {
        contentMirrorRef.current = content
    }, [content])

    const pushUndoSnapshot = useCallback((snapshot: string) => {
        const stack = undoContentStackRef.current
        if (stack[stack.length - 1] === snapshot) return
        stack.push(snapshot)
        if (stack.length > KNOWLEDGE_EDITOR_HISTORY_LIMIT) stack.shift()
    }, [])

    const pushRedoSnapshot = useCallback((snapshot: string) => {
        const stack = redoContentStackRef.current
        if (stack[stack.length - 1] === snapshot) return
        stack.push(snapshot)
        if (stack.length > KNOWLEDGE_EDITOR_HISTORY_LIMIT) stack.shift()
    }, [])

    const applyContentFromHistory = useCallback((nextValue: string) => {
        setContent(nextValue)
        contentMirrorRef.current = nextValue
        window.requestAnimationFrame(() => {
            const ta = textareaRef.current
            if (!ta) return
            ta.focus()
            const caretPos = nextValue.length
            ta.selectionStart = caretPos
            ta.selectionEnd = caretPos
        })
    }, [])

    const resetContentHistory = useCallback((currentValue: string) => {
        undoContentStackRef.current = []
        redoContentStackRef.current = []
        contentMirrorRef.current = currentValue
    }, [])

    useEffect(() => {
        if (knowledgeRecord) {
            const incomingContent = knowledgeRecord.content ?? ''
            setContent(incomingContent)
            setTitle(knowledgeRecord.title ?? '')
            if (contentMirrorRef.current !== incomingContent) {
                resetContentHistory(incomingContent)
            }
        }
    }, [knowledgeRecord, resetContentHistory])

    useEffect(() => {
        latestDraftStateRef.current = { title, content, knowledgeRecord: knowledgeRecord ?? null }
    }, [title, content, knowledgeRecord])

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
                latest.knowledgeRecord?.type === 'standard'
                && contentText.length > 20
                && !hasIntelligence

            const isStillEmpty = !titleText && !contentText && !urlText && !aiTitleText && !aiSummaryText && !hasInsights && !hasTags
            const scheduleIntelligenceOnExit = () => {
                const timerId = window.setTimeout(() => {
                    if (pendingKnowledgeExitIntelligence.get(cleanupKey) !== timerId) return
                    pendingKnowledgeExitIntelligence.delete(cleanupKey)
                    void (async () => {
                        try {
                            // Flush latest editor values before intelligence generation.
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

    const debouncedContent = useDebounce(content, 800)
    const debouncedTitle = useDebounce(title, 800)
    const saveRef = useRef({ content: '', title: '' })

    useEffect(() => {
        if (!knowledgeRecord) return
        if (debouncedContent === saveRef.current.content && debouncedTitle === saveRef.current.title) return
        setSaving(true)
        updateKnowledge(workspaceId, knowledgeId, { content: debouncedContent, title: debouncedTitle || null })
            .then(() => {
                saveRef.current = { content: debouncedContent, title: debouncedTitle }
                qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
                qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
            })
            .finally(() => setTimeout(() => setSaving(false), 500))
    }, [debouncedContent, debouncedTitle, knowledgeRecord, knowledgeId, workspaceId, qc])

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

    const insertMarkdown = (before: string, after: string = '') => {
        const ta = textareaRef.current
        if (!ta) return
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const selected = content.substring(start, end)
        const newContent = content.substring(0, start) + before + selected + after + content.substring(end)
        pushUndoSnapshot(content)
        redoContentStackRef.current = []
        setContent(newContent)
        contentMirrorRef.current = newContent
        setTimeout(() => {
            ta.selectionStart = start + before.length
            ta.selectionEnd = start + before.length + selected.length
            ta.focus()
        }, 0)
    }

    const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isModKey(e)) return
        const key = e.key.toLowerCase()
        const isUndo = key === 'z' && !e.shiftKey
        const isRedo = key === 'y' || (key === 'z' && e.shiftKey)
        if (!isUndo && !isRedo) return

        e.preventDefault()

        if (isUndo) {
            const previousValue = undoContentStackRef.current.pop()
            if (previousValue === undefined) return
            pushRedoSnapshot(content)
            applyContentFromHistory(previousValue)
            return
        }

        const nextValue = redoContentStackRef.current.pop()
        if (nextValue === undefined) return
        pushUndoSnapshot(content)
        applyContentFromHistory(nextValue)
    }, [content, applyContentFromHistory, pushRedoSnapshot, pushUndoSnapshot])

    const previewTitle = title.trim() || knowledgeRecord?.ai_title?.trim() || ''
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
        const startWidth = knowledgeIntelligenceWidth
        let currentWidth = startWidth

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = startX - moveEvent.clientX
            currentWidth = clampKnowledgeIntelligenceWidth(startWidth + delta)
            setKnowledgeIntelligenceWidth(currentWidth)
        }

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.localStorage.setItem(KNOWLEDGE_INTELLIGENCE_WIDTH_STORAGE_KEY, String(currentWidth))
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    const handleSplitResizeStart = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        const containerRect = splitContainerRef.current?.getBoundingClientRect()
        if (!containerRect || containerRect.width <= 0) return

        const updateSplitRatio = (clientX: number) => {
            const ratio = (clientX - containerRect.left) / containerRect.width
            setSplitRatio(clampKnowledgeSplitRatio(ratio))
        }

        updateSplitRatio(e.clientX)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const onMouseMove = (moveEvent: MouseEvent) => {
            updateSplitRatio(moveEvent.clientX)
        }

        const onMouseUp = () => {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
        )
    }

    return (
        <div className="flex h-full min-h-0 gap-3">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-5 py-2.5 flex-shrink-0 flex-wrap gap-y-2">
                    {/* View mode toggles */}
                    <div className="flex gap-0.5 glass-card p-0.5">
                        {(['edit', 'split', 'preview'] as const).map(m => (
                            <button key={m} onClick={() => setMode(m)} className={`px-2 py-1 text-xs rounded-md transition-all ${mode === m ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                                {m === 'edit' ? <Edit3 className="w-3.5 h-3.5" /> : m === 'preview' ? <Eye className="w-3.5 h-3.5" /> : <Split className="w-3.5 h-3.5" />}
                            </button>
                        ))}
                    </div>

                    {/* Format buttons */}
                    <div className="flex gap-0.5">
                        {[
                            { label: 'B', before: '**', after: '**' },
                            { label: 'I', before: '*', after: '*' },
                            { label: 'H', before: '## ' },
                            { label: '`', before: '`', after: '`' },
                        ].map(btn => (
                            <button key={btn.label} onClick={() => insertMarkdown(btn.before, btn.after)} className="btn-ghost px-2 py-1 text-xs font-mono">{btn.label}</button>
                        ))}
                    </div>

                    <div className="flex-1" />

                    {/* AI toolbar */}
                    <div className="flex gap-1">
                        <CopyButton
                            content={content}
                            label="Copy"
                            copiedLabel="Copied"
                            className="btn-ghost text-xs py-1 px-2 gap-1"
                        />
                        <button
                            onClick={handleGenerateIntelligence}
                            disabled={!!aiLoading}
                            className="btn-ghost text-xs py-1 px-2 gap-1"
                            title={knowledgeAiAction.label}
                        >
                            {aiLoading === knowledgeAiAction.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <knowledgeAiAction.icon className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{knowledgeAiAction.label}</span>
                        </button>
                    </div>

                    {/* Save indicator */}
                    {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving</span>}
                </div>

                <div ref={splitContainerRef} className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Editor pane */}
                    {(mode === 'edit' || mode === 'split') && (
                        <div
                            className={`flex min-h-0 flex-col ${mode === 'split' ? 'min-w-0' : 'w-full'} overflow-hidden`}
                            style={mode === 'split' ? { width: `${splitRatio * 100}%` } : undefined}
                        >
                            <div className="px-6 pt-5 pb-3">
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Title</p>
                                    <input
                                        className="w-full text-2xl font-bold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground/50"
                                        placeholder={knowledgeRecord?.ai_title ?? 'Untitled'}
                                        value={title}
                                        onChange={e => {
                                            if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                            setTitle(e.target.value)
                                        }}
                                    />
                                </div>
                                <div className="mt-3 pt-3">
                                    <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Tags</p>
                                    {!!knowledgeRecord?.tags?.length ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {knowledgeRecord.tags.map((tag: string) => (
                                                <span key={tag} className="chip-accent text-xs">{tag}</span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground/70">No tags yet.</p>
                                    )}
                                </div>
                            </div>
                            <p className="px-6 pb-2 pt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Content</p>
                            <textarea
                                ref={textareaRef}
                                className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-1 bg-transparent border-none outline-none resize-none font-mono text-sm text-foreground leading-relaxed"
                                placeholder="Start writing… (Markdown supported)"
                                value={content}
                                onKeyDown={handleEditorKeyDown}
                                onChange={e => {
                                    const nextValue = e.target.value
                                    if (nextValue === content) return
                                    pushUndoSnapshot(content)
                                    redoContentStackRef.current = []
                                    if (nextValue.trim().length > 0) hadMeaningfulInputRef.current = true
                                    setContent(nextValue)
                                    contentMirrorRef.current = nextValue
                                }}
                                style={{ tabSize: 2 }}
                            />
                        </div>
                    )}

                    {mode === 'split' && (
                        <button
                            type="button"
                            onMouseDown={handleSplitResizeStart}
                            className="relative z-10 h-full w-3 flex-shrink-0 cursor-col-resize bg-transparent"
                            aria-label="Resize editor and preview panes"
                            title="Drag to resize panes"
                        >
                            <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border/45" />
                        </button>
                    )}

                    {/* Preview pane */}
                    {(mode === 'preview' || mode === 'split') && (
                        <ContextMenu>
                            <ContextMenuTrigger asChild>
                                <div
                                    className={`${mode === 'split' ? 'min-w-0' : 'w-full'} min-h-0 overflow-y-auto px-7 py-6`}
                                    style={mode === 'split' ? { width: `${(1 - splitRatio) * 100}%` } : undefined}
                                >
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Title</p>
                                    {previewTitle ? (
                                        <h1 className="mt-1 text-2xl font-bold text-foreground">{previewTitle}</h1>
                                    ) : (
                                        <p className="mt-1 text-sm text-muted-foreground/70">Untitled</p>
                                    )}
                                    <p className="mb-2 mt-4 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Tags</p>
                                    {!!knowledgeRecord?.tags?.length ? (
                                        <div className="mb-4 flex flex-wrap gap-1.5">
                                            {knowledgeRecord.tags.map((tag: string) => (
                                                <span key={tag} className="chip-accent text-xs">{tag}</span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="mb-4 text-xs text-muted-foreground/70">No tags yet.</p>
                                    )}
                                    <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Content</p>
                                    <div
                                        className="markdown-content"
                                        dangerouslySetInnerHTML={{ __html: md.render(content || '_Start writing to see preview…_') }}
                                    />
                                </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-56">
                                <ContextMenuItem
                                    onClick={handleGenerateIntelligence}
                                    className="gap-2"
                                >
                                    <knowledgeAiAction.icon className="w-4 h-4" /> {knowledgeAiAction.label}
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => navigator.clipboard.writeText(content)} className="gap-2">
                                    <Copy className="w-4 h-4" /> Copy Content
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    )}
                </div>
            </div>

            <aside
                className="relative z-10 flex flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/28 py-4 transition-[width] duration-200 ease-out"
                style={{ width: isKnowledgeIntelligenceCollapsed ? `${KNOWLEDGE_INTELLIGENCE_COLLAPSED_WIDTH}px` : `${knowledgeIntelligenceWidth}px` }}
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
