import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNote, updateNote, summarizeNote, extractInsights, generateTitle } from '@/lib/api'
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
    const qc = useQueryClient()
    const { error: showError } = useToast()
    const { on } = useWorkspaceWebSocket(workspaceId)
    const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split')
    const [content, setContent] = useState('')
    const [title, setTitle] = useState('')
    const [showInsights, setShowInsights] = useState(false)
    const [saving, setSaving] = useState(false)
    const [aiLoading, setAiLoading] = useState<string | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

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
        setAiLoading(action)
        try {
            if (action === 'summarize') await summarizeNote(workspaceId, noteId)
            else if (action === 'insights') { await extractInsights(workspaceId, noteId); setShowInsights(true) }
            else if (action === 'title') {
                const result = await generateTitle(workspaceId, noteId)
                const generatedTitle = (result?.title ?? '').trim()
                if (generatedTitle) {
                    setTitle(generatedTitle)
                }
            }
            qc.invalidateQueries({ queryKey: ['note', noteId] })
            qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'AI action failed.'
            showError('AI action failed', detail)
        }
        setAiLoading(null)
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

    return (
        <div className="flex h-full min-h-0 flex-col rounded-2xl bg-card/20 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-6 py-2.5 border-b border-border/50 flex-shrink-0 flex-wrap gap-y-2">
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
                    {[
                        { id: 'title', icon: <Hash className="w-3.5 h-3.5" />, label: 'Generate Title' },
                        { id: 'summarize', icon: <CornerRightDown className="w-3.5 h-3.5" />, label: 'Summarize' },
                        { id: 'insights', icon: <Brain className="w-3.5 h-3.5" />, label: 'Insights' },
                    ].map(btn => (
                        <button key={btn.id} onClick={() => handleAI(btn.id)} disabled={!!aiLoading} className="btn-ghost text-xs py-1 px-2 gap-1" title={btn.label}>
                            {aiLoading === btn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : btn.icon}
                            <span className="hidden sm:inline">{btn.label}</span>
                        </button>
                    ))}
                    <button onClick={() => setShowInsights(p => !p)} className={`btn-ghost text-xs py-1 px-2 ${showInsights ? 'text-accent' : ''}`}>
                        <Sparkles className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Save indicator */}
                {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving</span>}
            </div>

            {/* AI Summary */}
            {note?.ai_summary && (
                <div className="mx-6 mt-3 p-3 glass-card border-accent/20 bg-accent/5">
                    <div className="flex items-center gap-2 font-medium text-accent text-xs mb-2">
                        <Sparkles className="w-3.5 h-3.5" /> AI Summary
                    </div>
                    <div
                        className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: md.render(note.ai_summary) }}
                    />
                </div>
            )}

            {/* Editor area */}
            <div className="flex flex-1 min-h-0">
                {/* Editor pane */}
                {(mode === 'edit' || mode === 'split') && (
                    <div className={`flex min-h-0 flex-col ${mode === 'split' ? 'w-1/2 border-r border-border/50' : 'w-full'} overflow-hidden`}>
                        <div className="px-6 py-3 border-b border-border/30">
                            <input
                                className="w-full text-xl font-bold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground/50"
                                placeholder={note?.ai_title ?? 'Untitled'}
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                            />
                        </div>
                        <textarea
                            ref={textareaRef}
                            className="min-h-0 flex-1 overflow-y-auto p-6 pt-4 bg-transparent border-none outline-none resize-none font-mono text-sm text-foreground leading-relaxed"
                            placeholder="Start writing… (Markdown supported)"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            style={{ tabSize: 2 }}
                        />
                    </div>
                )}

                {/* Preview pane */}
                {(mode === 'preview' || mode === 'split') && (
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <div className={`${mode === 'split' ? 'w-1/2' : 'w-full'} min-h-0 overflow-y-auto px-8 py-6`}>
                                {previewTitle && (
                                    <h1 className="text-2xl font-bold mb-4 text-foreground">{previewTitle}</h1>
                                )}
                                <div
                                    className="markdown-content"
                                    dangerouslySetInnerHTML={{ __html: md.render(content || '_Start writing to see preview…_') }}
                                />
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-56">
                            <ContextMenuItem onClick={() => handleAI('title')} className="gap-2">
                                <Hash className="w-4 h-4" /> Generate Title
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => handleAI('summarize')} className="gap-2">
                                <CornerRightDown className="w-4 h-4" /> Summarize
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => { setShowInsights(true); handleAI('insights'); }} className="gap-2">
                                <Brain className="w-4 h-4" /> Extract Insights
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => navigator.clipboard.writeText(content)} className="gap-2">
                                <Copy className="w-4 h-4" /> Copy Content
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                )}

                {/* Insights panel */}
                {showInsights && (
                    <div className="w-80 min-h-0 flex-shrink-0 border-l border-border/50 overflow-y-auto p-4">
                        <div className="flex items-center justify-between mb-4">
                            <span className="font-semibold text-sm flex items-center gap-2"><Brain className="w-4 h-4 text-accent" /> Insights</span>
                            <button onClick={() => setShowInsights(false)} className="btn-ghost p-1"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        {!note?.insights ? (
                            <div className="text-center py-8">
                                <p className="text-muted-foreground text-sm mb-3">Extract AI insights from this note.</p>
                                <button className="btn-primary text-xs" onClick={() => handleAI('insights')} disabled={!!aiLoading}>
                                    {aiLoading === 'insights' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                                    Extract Insights
                                </button>
                            </div>
                        ) : (
                            <InsightsDisplay insights={note.insights} tags={note.tags ?? []} />
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function InsightsDisplay({ insights, tags }: { insights: Record<string, unknown[]>; tags: string[] }) {
    const sections = [
        { key: 'tasks', label: 'Tasks', icon: <CheckSquare className="w-3.5 h-3.5" /> },
        { key: 'timelines', label: 'Timelines', icon: <Calendar className="w-3.5 h-3.5" /> },
        { key: 'facts', label: 'Facts', icon: <FileText className="w-3.5 h-3.5" /> },
        { key: 'crucial_things', label: 'Crucial Things', icon: <Star className="w-3.5 h-3.5" /> },
    ] as const

    return (
        <div className="space-y-4">
            {sections.map(({ key, label, icon }) => {
                const items = (insights[key] as string[]) ?? []
                if (!items.length) return null
                return (
                    <div key={key} className="glass-card p-3">
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
                <div className="glass-card p-3">
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
