/**
 * KnowledgeModal — slide-up sheet preview for a single knowledgeRecord.
 * Opening: triggered by clicking a knowledgeRecord card.
 * Features:
 *  - Title, type badge, tags, word count, dates
 *  - Read-only markdown preview of full content
 *  - AI summary / insights panel (if available)
 *  - Quick actions: Pin, Archive, Delete
 *  - "Open knowledgeRecord" button → navigates to full KnowledgePage editor
 *  - Keyboard shortcut: Escape closes
 *  - Click backdrop → closes
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import {
    getKnowledge,
    togglePin,
    toggleArchive,
    deleteKnowledge,
    generateKnowledgeIntelligence,
} from '@/lib/api'
import { useWorkspaceWebSocket } from '@/hooks/useWorkspaceWebSocket'
import {
    X, ExternalLink, Pin, PinOff, Archive, ArchiveX, Trash2, Sparkles,
    FileText, Bookmark, Code2, Zap, Clock, Tag, Hash, Loader2,
    Brain, Star, ChevronRight, ChevronDown,
} from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { motion, AnimatePresence } from 'framer-motion'
import { CopyButton } from '@/components/shared/CopyButton'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    standard: { icon: FileText, label: 'Note', color: 'text-blue-400' },
    fleeting: { icon: Zap, label: 'Fleeting', color: 'text-yellow-400' },
    bookmark: { icon: Bookmark, label: 'Bookmark', color: 'text-purple-400' },
    gist: { icon: Code2, label: 'Gist', color: 'text-green-400' },
}

interface KnowledgeModalProps {
    knowledgeId: string
    workspaceId: string
    onClose: () => void
}

export function KnowledgeModal({ knowledgeId, workspaceId, onClose }: KnowledgeModalProps) {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const backdropRef = useRef<HTMLDivElement>(null)
    const [aiLoading, setAiLoading] = useState<string | null>(null)
    const [aiIntelligenceOpen, setAiIntelligenceOpen] = useState(false)
    const { on } = useWorkspaceWebSocket(workspaceId)

    const { data: knowledgeRecord, isLoading } = useQuery({
        queryKey: ['knowledge-item', knowledgeId],
        queryFn: () => getKnowledge(workspaceId, knowledgeId),
        enabled: !!knowledgeId,
        refetchOnMount: 'always',
    })

    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [])

    useEffect(() => {
        return on('knowledge_updated', (msg: Record<string, unknown>) => {
            if (msg.knowledge_id !== knowledgeId) return
            qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        })
    }, [knowledgeId, on, qc, workspaceId])

    const handlePin = async () => {
        await togglePin(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
    }

    const handleArchive = async () => {
        await toggleArchive(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        onClose()
    }

    const handleDelete = async () => {
        if (!confirm('Delete this knowledge item?')) return
        await deleteKnowledge(workspaceId, knowledgeId)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        onClose()
    }

    const handleGenerateIntelligence = async () => {
        if (aiLoading) return
        setAiLoading('intelligence')
        try {
            const result = await generateKnowledgeIntelligence(workspaceId, knowledgeId)
            qc.setQueryData(['knowledge-item', knowledgeId], (prev: any) => {
                if (!prev) return prev
                const next: any = { ...prev }
                const generatedTitle = (result?.ai_title ?? result?.title ?? '').trim()
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
            setAiIntelligenceOpen(true)
            qc.invalidateQueries({ queryKey: ['knowledge-item', knowledgeId] })
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        } finally {
            setAiLoading(null)
        }
    }

    const openKnowledge = () => {
        navigate(`/w/${workspaceId}/knowledge/${knowledgeId}`)
        onClose()
    }

    const meta = knowledgeRecord ? (TYPE_META[knowledgeRecord.type] ?? TYPE_META.standard) : TYPE_META.standard
    const TypeIcon = meta.icon
    const displayTitle = knowledgeRecord?.title?.trim() || knowledgeRecord?.ai_title?.trim() || null
    const hasInsights = !!knowledgeRecord?.insights && Object.keys(knowledgeRecord.insights).length > 0
    const hasAiIntelligence = !!knowledgeRecord?.ai_summary || hasInsights
    const knowledgeAiAction = { id: 'intelligence', icon: Brain, label: 'Generate Intelligence' } as const
    const renderedKnowledgeContent = knowledgeRecord
        ? knowledgeRecord.type === 'gist'
            ? md.render(
                `\`\`\`${knowledgeRecord.gist_language ?? ''}\n${knowledgeRecord.content ?? ''}\n\`\`\``,
            )
            : md.render(knowledgeRecord.content ?? '')
        : ''

    const modalContent = (
        <AnimatePresence>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                ref={backdropRef}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md dark:bg-black/40"
                onClick={onClose}
            />

            {/* Sheet — slides up from bottom */}
            <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none">
                <motion.div
                    initial={{ y: '100%', scale: 0.95, opacity: 0.5 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ y: '100%', scale: 0.95, opacity: 0 }}
                    transition={{
                        type: 'spring',
                        damping: 25,
                        stiffness: 300,
                        mass: 0.8
                    }}
                    className="pointer-events-auto w-[90vw] max-w-[90vw] bg-card/90 backdrop-blur-3xl border-t border-white/10 rounded-t-[32px] shadow-glass-lg flex flex-col"
                    style={{ maxHeight: '70vh' }}
                    onClick={e => e.stopPropagation()}
                >
                {/* Inner Glow Line */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-border/70" />
                </div>

                {/* Header */}
                <div className="flex items-start gap-3 px-5 pt-2 pb-3 border-b border-border/50 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                        {isLoading ? (
                            <div className="h-5 w-48 skeleton rounded mb-2" />
                        ) : (
                            <>
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide ${meta.color}`}>
                                        <TypeIcon className="w-3 h-3" />
                                        {knowledgeRecord?.type === 'fleeting' && <Clock className="w-3 h-3" />}
                                        {meta.label}
                                    </span>
                                    {knowledgeRecord?.is_pinned && <Pin className="w-3 h-3 text-amber-400" />}
                                    {knowledgeRecord?.embedding_status === 'done' && <Sparkles className="w-3 h-3 text-accent/60" />}
                                    {knowledgeRecord?.gist_language && (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                                            {knowledgeRecord.gist_language}
                                        </span>
                                    )}
                                </div>
                                <h2 className={`text-lg font-bold leading-snug ${displayTitle ? '' : 'text-muted-foreground/50 italic'}`}>
                                    {displayTitle ?? 'Untitled'}
                                </h2>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                    <span>{knowledgeRecord?.word_count ?? 0} words</span>
                                    <span>Updated {knowledgeRecord ? new Date(knowledgeRecord.updated_at).toLocaleDateString() : '—'}</span>
                                    <span>Created {knowledgeRecord ? new Date(knowledgeRecord.created_at).toLocaleDateString() : '—'}</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {knowledgeRecord && (
                            <>
                                <button
                                    className="btn-ghost text-xs py-1.5 px-2.5 gap-1.5"
                                    onClick={handleGenerateIntelligence}
                                    disabled={!!aiLoading}
                                    title={knowledgeAiAction.label}
                                >
                                    {aiLoading === knowledgeAiAction.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <knowledgeAiAction.icon className="w-3 h-3" />}
                                    {knowledgeAiAction.label}
                                </button>
                                <button
                                    className="btn-ghost p-1.5"
                                    onClick={handlePin}
                                    title={knowledgeRecord.is_pinned ? 'Unpin' : 'Pin'}
                                >
                                    {knowledgeRecord.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                                </button>
                                <button
                                    className="btn-ghost p-1.5"
                                    onClick={handleArchive}
                                    title={knowledgeRecord.is_archived ? 'Unarchive' : 'Archive'}
                                >
                                    {knowledgeRecord.is_archived ? <ArchiveX className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                                </button>
                                <button
                                    className="btn-ghost p-1.5 text-red-400 hover:bg-red-500/10"
                                    onClick={handleDelete}
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="w-px h-5 bg-border/50 mx-1" />
                            </>
                        )}
                        <button
                            className="btn-primary text-xs py-1.5 px-3 gap-1.5"
                            onClick={openKnowledge}
                            title="Open in full editor"
                        >
                            <ExternalLink className="w-3.5 h-3.5" /> Open knowledge
                        </button>
                        <button className="btn-ghost p-1.5 ml-1" onClick={onClose} title="Close (Esc)">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {isLoading && (
                        <div className="space-y-3">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className={`h-4 skeleton rounded`} style={{ width: `${70 + (i % 3) * 10}%` }} />
                            ))}
                        </div>
                    )}

                    {!isLoading && knowledgeRecord && (
                        <>
                            {/* Bookmark URL bar */}
                            {knowledgeRecord.type === 'bookmark' && knowledgeRecord.url && (
                                <div className="flex items-center gap-2">
                                    <a
                                        href={knowledgeRecord.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="min-w-0 flex-1 flex items-center gap-2 text-xs text-muted-foreground bg-muted/20 border border-border/40 rounded-lg px-3 py-2 hover:bg-muted/40 hover:text-foreground transition-colors"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate">{knowledgeRecord.url}</span>
                                    </a>
                                    <CopyButton
                                        content={knowledgeRecord.url}
                                        label="Copy URL"
                                        copiedLabel="Copied"
                                        iconOnly
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-muted/25 text-foreground/85 hover:bg-muted/45 hover:border-border transition-colors"
                                    />
                                </div>
                            )}

                            {/* Tags */}
                            {knowledgeRecord.tags && knowledgeRecord.tags.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                    {knowledgeRecord.tags.map((t: string) => (
                                        <span key={t} className="chip-accent text-xs">
                                            <Hash className="w-2.5 h-2.5 inline mr-0.5" />{t}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Content preview */}
                            <div>
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Content</p>
                                {knowledgeRecord.content ? (
                                    <div
                                        className={`markdown-content max-w-none text-sm leading-relaxed ${knowledgeRecord.type === 'gist' ? '[&_pre]:text-[12px] [&_code]:text-[12px]' : ''}`}
                                        dangerouslySetInnerHTML={{ __html: renderedKnowledgeContent }}
                                    />
                                ) : (
                                    <p className="text-muted-foreground/50 italic text-sm">No content yet.</p>
                                )}
                            </div>

                        </>
                    )}
                </div>

                {/* Sticky AI intelligence strip (stays at bottom when collapsed) */}
                {!isLoading && knowledgeRecord && hasAiIntelligence && (
                    <div className="sticky bottom-0 z-10 px-5 pt-2 pb-3 border-t border-border/50 bg-card/90 backdrop-blur-md flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => setAiIntelligenceOpen(prev => !prev)}
                            className="w-full flex items-center justify-between rounded-lg border border-border/55 bg-card/20 px-3 py-2 text-left"
                            aria-expanded={aiIntelligenceOpen}
                            aria-label={aiIntelligenceOpen ? 'Collapse AI intelligence' : 'Expand AI intelligence'}
                        >
                            <span className="inline-flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-accent/80" />
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">AI Intelligence</span>
                            </span>
                            {aiIntelligenceOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                        </button>

                        {aiIntelligenceOpen && (
                            <div className="mt-3 max-h-[28vh] overflow-y-auto pr-1 space-y-3">
                                {knowledgeRecord.ai_summary && (
                                    <div className="rounded-xl border border-border/50 bg-card/35 p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Brain className="w-3.5 h-3.5 text-accent" />
                                            <span className="text-xs font-medium text-accent">Summary</span>
                                        </div>
                                        <div
                                            className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-muted-foreground"
                                            dangerouslySetInnerHTML={{ __html: md.render(knowledgeRecord.ai_summary) }}
                                        />
                                    </div>
                                )}

                                {hasInsights && (
                                    <div className="rounded-xl border border-border/50 bg-card/30 p-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Star className="w-3.5 h-3.5 text-amber-400" />
                                            <span className="text-xs font-medium">Insights</span>
                                        </div>
                                        {knowledgeRecord.insights.tasks?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Tasks</p>
                                                <ul className="space-y-0.5">
                                                    {knowledgeRecord.insights.tasks.map((t: string, i: number) => (
                                                        <li key={i} className="text-xs flex items-start gap-1.5">
                                                            <span className="mt-0.5 w-3 h-3 rounded-sm border border-border/60 flex-shrink-0" />
                                                            {t}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {knowledgeRecord.insights.timelines?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Timelines</p>
                                                <ul className="space-y-0.5">
                                                    {knowledgeRecord.insights.timelines.map((h: any, i: number) => (
                                                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                            <span className="text-accent mt-0.5 font-bold">{h.date}</span> {h.event}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {knowledgeRecord.insights.facts?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Facts</p>
                                                <ul className="space-y-0.5">
                                                    {knowledgeRecord.insights.facts.map((h: string, i: number) => (
                                                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                            <span className="text-accent mt-0.5">•</span> {h}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {knowledgeRecord.insights.crucial_things?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Crucial Things</p>
                                                <ul className="space-y-0.5">
                                                    {knowledgeRecord.insights.crucial_things.map((h: string, i: number) => (
                                                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                            <span className="text-red-400 mt-0.5">!</span> {h}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                </motion.div>
            </div>
        </AnimatePresence>
    )

    if (typeof document === 'undefined') return null
    return createPortal(modalContent, document.body)
}
