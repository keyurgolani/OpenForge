import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNote, updateNote, summarizeNote, extractInsights, generateTitle, deleteNote } from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import { useToast } from '@/components/shared/ToastProvider'
import {
    Split, Eye, Edit3, Sparkles, Brain, Tag, Save, Loader2,
    ChevronRight, X, CheckSquare, Bell, Calendar, Star, Hash,
    CornerRightDown, Copy, FileText
} from 'lucide-react'
import {
    ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuShortcut
} from '@/components/ui/context-menu'
import { CopyButton } from '@/components/shared/CopyButton'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

const MIN_NOTE_INTELLIGENCE_WIDTH = 280
const MAX_NOTE_INTELLIGENCE_WIDTH = 620
const DEFAULT_NOTE_INTELLIGENCE_WIDTH = 340
const NOTE_INTELLIGENCE_WIDTH_STORAGE_KEY = 'openforge.note.intelligence.width'

const clampNoteIntelligenceWidth = (value: number) =>
    Math.max(MIN_NOTE_INTELLIGENCE_WIDTH, Math.min(MAX_NOTE_INTELLIGENCE_WIDTH, value))

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(timer)
    }, [value, delay])
    return debouncedValue
}

export default function NotePage() {
    const { workspaceId = '', noteId = '' } = useParams<{ workspaceId: string; noteId: string }>()
    const location = useLocation()
    const qc = useQueryClient()
    const { error: showError } = useToast()
    const { on } = useWorkspaceWebSocket(workspaceId)
    const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split')
    const [content, setContent] = useState('')
    const [title, setTitle] = useState('')
    const [showInsights, setShowInsights] = useState(true)
    const [noteIntelligenceWidth, setNoteIntelligenceWidth] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_NOTE_INTELLIGENCE_WIDTH
        const raw = window.localStorage.getItem(NOTE_INTELLIGENCE_WIDTH_STORAGE_KEY)
        const parsed = raw ? parseInt(raw, 10) : NaN
        return Number.isFinite(parsed) ? clampNoteIntelligenceWidth(parsed) : DEFAULT_NOTE_INTELLIGENCE_WIDTH
    })
    const [saving, setSaving] = useState(false)
    const [aiLoading, setAiLoading] = useState<string | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const hadMeaningfulInputRef = useRef(false)
    const latestDraftStateRef = useRef<{ title: string; content: string; note: any | null }>({ title: '', content: '', note: null })
    const isDiscardableDraft = useMemo(
        () => new URLSearchParams(location.search).get('draft') === '1',
        [location.search],
    )

    const { data: note, isLoading } = useQuery({
        queryKey: ['note', noteId],
        queryFn: () => getNote(workspaceId, noteId),
        enabled: !!noteId,
    })

    useEffect(() => {
        if (note) {
            setContent(note.content ?? '')
            setTitle(note.title ?? '')
        }
    }, [note])

    useEffect(() => {
        latestDraftStateRef.current = { title, content, note: note ?? null }
    }, [title, content, note])

    useEffect(() => {
        if (!isDiscardableDraft || !noteId) return

        return () => {
            if (hadMeaningfulInputRef.current) return

            const latest = latestDraftStateRef.current
            const titleText = (latest.title || latest.note?.title || '').trim()
            const contentText = (latest.content || latest.note?.content || '').trim()
            const urlText = (latest.note?.url || '').trim()
            const aiTitleText = (latest.note?.ai_title || '').trim()
            const aiSummaryText = (latest.note?.ai_summary || '').trim()
            const hasInsights = !!latest.note?.insights && Object.keys(latest.note.insights).length > 0
            const hasTags = Array.isArray(latest.note?.tags) && latest.note.tags.length > 0

            const isStillEmpty = !titleText && !contentText && !urlText && !aiTitleText && !aiSummaryText && !hasInsights && !hasTags
            if (!isStillEmpty) return

            deleteNote(workspaceId, noteId)
                .then(() => qc.invalidateQueries({ queryKey: ['notes', workspaceId] }))
                .catch(() => { /* best-effort cleanup */ })
        }
    }, [isDiscardableDraft, noteId, workspaceId, qc])

    // WebSocket: refresh note on AI update
    useEffect(() => {
        return on('note_updated', (msg: Record<string, unknown>) => {
            if (msg.note_id === noteId) {
                qc.invalidateQueries({ queryKey: ['note', noteId] })
            }
        })
    }, [noteId, on, qc])

    const debouncedContent = useDebounce(content, 800)
    const debouncedTitle = useDebounce(title, 800)
    const saveRef = useRef({ content: '', title: '' })

    useEffect(() => {
        if (!note) return
        if (debouncedContent === saveRef.current.content && debouncedTitle === saveRef.current.title) return
        setSaving(true)
        updateNote(workspaceId, noteId, { content: debouncedContent, title: debouncedTitle || null })
            .then(() => {
                saveRef.current = { content: debouncedContent, title: debouncedTitle }
                qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
            })
            .finally(() => setTimeout(() => setSaving(false), 500))
    }, [debouncedContent, debouncedTitle, note, noteId, workspaceId, qc])

    const handleAI = async (action: string) => {
        if (aiLoading) return
        setAiLoading(action)
        try {
            if (action === 'summarize') {
                const result = await summarizeNote(workspaceId, noteId)
                const summary = (result?.summary ?? '').trim()
                if (summary) {
                    qc.setQueryData(['note', noteId], (prev: any) => prev ? { ...prev, ai_summary: summary } : prev)
                }
            } else if (action === 'insights' || action === 'keywords') {
                const insights = await extractInsights(workspaceId, noteId)
                if (action === 'insights') setShowInsights(true)
                qc.setQueryData(['note', noteId], (prev: any) => {
                    if (!prev) return prev
                    const next: any = { ...prev, insights }
                    if (Array.isArray(insights?.tags) && insights.tags.length > 0) {
                        const currentTags = Array.isArray(prev.tags) ? prev.tags : []
                        next.tags = Array.from(new Set([...currentTags, ...insights.tags]))
                    }
                    return next
                })
            } else if (action === 'title') {
                const result = await generateTitle(workspaceId, noteId)
                const generatedTitle = (result?.title ?? '').trim()
                if (generatedTitle) {
                    setTitle(generatedTitle)
                    qc.setQueryData(['note', noteId], (prev: any) => {
                        if (!prev) return prev
                        const titleWasEmpty = !(prev.title ?? '').trim()
                        return {
                            ...prev,
                            ai_title: generatedTitle,
                            title: titleWasEmpty ? generatedTitle : prev.title,
                        }
                    })
                }
            }
            qc.invalidateQueries({ queryKey: ['note', noteId] })
            qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'AI action failed.'
            showError('AI action failed', detail)
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
        setContent(newContent)
        setTimeout(() => {
            ta.selectionStart = start + before.length
            ta.selectionEnd = start + before.length + selected.length
            ta.focus()
        }, 0)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
        )
    }

    const previewTitle = title.trim() || note?.ai_title?.trim() || ''
    const noteAiActions = [
        { id: 'title', icon: Hash, label: 'Generate Title' },
        { id: 'keywords', icon: Tag, label: 'Generate Keywords' },
        { id: 'insights', icon: Brain, label: 'Extract Insights' },
        { id: 'summarize', icon: CornerRightDown, label: 'Summarize' },
    ] as const
    const noteIntelligenceCanSplitCards = noteIntelligenceWidth >= 560
    const noteIntelligenceWideContent = noteIntelligenceWidth >= 440

    const handleNoteIntelligenceResizeStart = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault()
        const startX = e.clientX
        const startWidth = noteIntelligenceWidth
        let currentWidth = startWidth

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = startX - moveEvent.clientX
            currentWidth = clampNoteIntelligenceWidth(startWidth + delta)
            setNoteIntelligenceWidth(currentWidth)
        }

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            window.localStorage.setItem(NOTE_INTELLIGENCE_WIDTH_STORAGE_KEY, String(currentWidth))
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    return (
        <div className="flex h-full min-h-0 gap-3">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/55 bg-card/20">
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border/40 flex-shrink-0 flex-wrap gap-y-2">
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
                        {noteAiActions.map(btn => (
                            <button key={btn.id} onClick={() => handleAI(btn.id)} disabled={!!aiLoading} className="btn-ghost text-xs py-1 px-2 gap-1" title={btn.label}>
                                {aiLoading === btn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <btn.icon className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">{btn.label}</span>
                            </button>
                        ))}
                        <button onClick={() => setShowInsights(p => !p)} className={`btn-ghost text-xs py-1 px-2 ${showInsights ? 'text-accent' : ''}`} title={showInsights ? 'Hide AI side panel' : 'Show AI side panel'}>
                            <Sparkles className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Save indicator */}
                    {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving</span>}
                </div>

                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Editor pane */}
                    {(mode === 'edit' || mode === 'split') && (
                        <div className={`flex min-h-0 flex-col ${mode === 'split' ? 'w-1/2 border-r border-border/35' : 'w-full'} overflow-hidden`}>
                            <div className="px-6 pt-5 pb-3 border-b border-border/40 bg-muted/10">
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Title</p>
                                    <input
                                        className="w-full text-2xl font-bold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground/50"
                                        placeholder={note?.ai_title ?? 'Untitled'}
                                        value={title}
                                        onChange={e => {
                                            if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                            setTitle(e.target.value)
                                        }}
                                    />
                                </div>
                                <div className="mt-3 pt-3 border-t border-border/35">
                                    <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Tags</p>
                                    {!!note?.tags?.length ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {note.tags.map((tag: string) => (
                                                <span key={tag} className="chip-accent text-xs">{tag}</span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground/70">No tags yet.</p>
                                    )}
                                </div>
                            </div>
                            <textarea
                                ref={textareaRef}
                                className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4 bg-transparent border-none outline-none resize-none font-mono text-sm text-foreground leading-relaxed"
                                placeholder="Start writing… (Markdown supported)"
                                value={content}
                                onChange={e => {
                                    if (e.target.value.trim().length > 0) hadMeaningfulInputRef.current = true
                                    setContent(e.target.value)
                                }}
                                style={{ tabSize: 2 }}
                            />
                        </div>
                    )}

                    {/* Preview pane */}
                    {(mode === 'preview' || mode === 'split') && (
                        <ContextMenu>
                            <ContextMenuTrigger asChild>
                                <div className={`${mode === 'split' ? 'w-1/2' : 'w-full'} min-h-0 overflow-y-auto px-7 py-6`}>
                                    {previewTitle && (
                                        <h1 className="text-2xl font-bold text-foreground">{previewTitle}</h1>
                                    )}
                                    {!!note?.tags?.length && (
                                        <div className="mt-2 mb-4 flex flex-wrap gap-1.5">
                                            {note.tags.map((tag: string) => (
                                                <span key={tag} className="chip-accent text-xs">{tag}</span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="mt-4 mb-4 border-t border-border/45" />
                                    <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">Content</p>
                                    <div
                                        className="markdown-content"
                                        dangerouslySetInnerHTML={{ __html: md.render(content || '_Start writing to see preview…_') }}
                                    />
                                </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-56">
                                {noteAiActions.map(action => (
                                    <ContextMenuItem
                                        key={action.id}
                                        onClick={() => {
                                            if (action.id === 'insights') setShowInsights(true)
                                            handleAI(action.id)
                                        }}
                                        className="gap-2"
                                    >
                                        <action.icon className="w-4 h-4" /> {action.label}
                                    </ContextMenuItem>
                                ))}
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => navigator.clipboard.writeText(content)} className="gap-2">
                                    <Copy className="w-4 h-4" /> Copy Content
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    )}
                </div>
            </div>

            {showInsights && (
                <aside
                    className="relative z-10 flex flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/28 py-4 transition-[width] duration-200 ease-out"
                    style={{ width: `${noteIntelligenceWidth}px` }}
                >
                    <button
                        type="button"
                        onMouseDown={handleNoteIntelligenceResizeStart}
                        className="absolute -left-1 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-accent/25 active:bg-accent/35 transition-colors"
                        aria-label="Resize note intelligence sidebar"
                        title="Drag to resize"
                    />
                    <div className="px-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <Brain className="w-4 h-4 text-accent" />
                                    <h3 className="font-semibold text-sm tracking-tight">Note Intelligence</h3>
                                </div>
                                <p className="text-xs text-muted-foreground/90">Summary and extracted insights for this note.</p>
                            </div>
                            <button onClick={() => setShowInsights(false)} className="w-7 h-7 rounded-md border border-border/70 bg-card/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors" aria-label="Hide note intelligence panel">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div
                            className="grid gap-1.5"
                            style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${noteIntelligenceWideContent ? 130 : 116}px, 1fr))` }}
                        >
                            {noteAiActions.map(action => (
                                <button
                                    key={action.id}
                                    className="btn-ghost w-full justify-start text-xs py-1.5 px-2.5 gap-1.5"
                                    onClick={() => {
                                        if (action.id === 'insights') setShowInsights(true)
                                        handleAI(action.id)
                                    }}
                                    disabled={!!aiLoading}
                                    title={action.label}
                                >
                                    {aiLoading === action.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <action.icon className="w-3.5 h-3.5" />}
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="my-4 border-t border-border/50" />

                    <div className={`flex-1 overflow-y-auto px-4 pb-2 ${noteIntelligenceCanSplitCards ? 'grid grid-cols-2 gap-3 auto-rows-min' : 'space-y-3'}`}>
                        <div className={`glass-card p-3 ${noteIntelligenceCanSplitCards ? 'min-h-0' : ''}`}>
                            <div className="mb-2 flex items-center gap-2 text-accent text-xs font-semibold">
                                <Sparkles className="w-3.5 h-3.5" /> AI Summary
                            </div>
                            {note?.ai_summary ? (
                                <div
                                    className="markdown-content text-sm text-muted-foreground"
                                    dangerouslySetInnerHTML={{ __html: md.render(note.ai_summary) }}
                                />
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">No summary yet. Generate one to get a concise view of this note.</p>
                                    <button className="btn-primary text-xs py-1.5 px-2.5" onClick={() => handleAI('summarize')} disabled={!!aiLoading}>
                                        {aiLoading === 'summarize' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                        Generate Summary
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className={`glass-card p-3 ${noteIntelligenceCanSplitCards ? 'min-h-0' : ''}`}>
                            <div className="mb-2 flex items-center gap-2 text-accent text-xs font-semibold">
                                <Brain className="w-3.5 h-3.5" /> Insights
                            </div>
                            {!note?.insights ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">No insights extracted yet.</p>
                                    <button className="btn-primary text-xs py-1.5 px-2.5" onClick={() => handleAI('insights')} disabled={!!aiLoading}>
                                        {aiLoading === 'insights' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                                        Extract Insights
                                    </button>
                                </div>
                            ) : (
                                <InsightsDisplay insights={note.insights} tags={note.tags ?? []} wideLayout={noteIntelligenceWideContent} />
                            )}
                        </div>
                    </div>
                </aside>
            )}
        </div>
    )
}

function InsightsDisplay({
    insights,
    tags,
    wideLayout = false,
}: {
    insights: Record<string, unknown[]>
    tags: string[]
    wideLayout?: boolean
}) {
    const sections = [
        { key: 'tasks', label: 'Tasks', icon: <CheckSquare className="w-3.5 h-3.5" /> },
        { key: 'timelines', label: 'Timelines', icon: <Calendar className="w-3.5 h-3.5" /> },
        { key: 'facts', label: 'Facts', icon: <FileText className="w-3.5 h-3.5" /> },
        { key: 'crucial_things', label: 'Crucial Things', icon: <Star className="w-3.5 h-3.5" /> },
    ] as const

    return (
        <div className={wideLayout ? 'grid grid-cols-2 gap-3' : 'space-y-4'}>
            {sections.map(({ key, label, icon }) => {
                const items = (insights[key] as string[]) ?? []
                if (!items.length) return null
                return (
                    <div key={key} className="glass-card p-3 h-fit">
                        <div className="flex items-center gap-2 text-accent text-xs font-semibold mb-2">
                            {icon} {label}
                        </div>
                        <ul className="space-y-1.5">
                            {items.map((item: any, i: number) => {
                                let text = typeof item === 'string' ? item : JSON.stringify(item);
                                if (key === 'timelines' && typeof item === 'object' && item !== null) {
                                    text = `${item.date || ''}: ${item.event || ''}`;
                                }
                                return (
                                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                                        <div className="w-1 h-1 rounded-full bg-border mt-1.5 flex-shrink-0" />
                                        <span className="leading-snug">{text}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )
            })}
            {tags.length > 0 && (
                <div className={`glass-card p-3 ${wideLayout ? 'col-span-2' : ''}`}>
                    <div className="flex items-center gap-2 text-accent text-xs font-semibold mb-2">
                        <Hash className="w-3.5 h-3.5" /> Tags
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {tags.map(t => (
                            <span key={t} className="chip-accent text-xs">{t}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
