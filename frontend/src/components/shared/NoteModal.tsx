/**
 * NoteModal — slide-up sheet preview for a single note.
 * Opening: triggered by clicking a note card.
 * Features:
 *  - Note title, type badge, tags, word count, dates
 *  - Read-only markdown preview of full content
 *  - AI summary / insights panel (if available)
 *  - Quick actions: Pin, Archive, Delete
 *  - "Open note" button → navigates to full NotePage editor
 *  - Keyboard shortcut: Escape closes
 *  - Click backdrop → closes
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getNote, togglePin, toggleArchive, deleteNote, summarizeNote, extractInsights, generateTitle } from '@/lib/api'
import {
    X, ExternalLink, Pin, PinOff, Archive, ArchiveX, Trash2, Sparkles,
    FileText, Bookmark, Code2, Zap, Clock, Tag, Hash, Loader2,
    Brain, Star,
} from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { motion, AnimatePresence } from 'framer-motion'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    standard: { icon: FileText, label: 'Note', color: 'text-blue-400' },
    fleeting: { icon: Zap, label: 'Fleeting', color: 'text-yellow-400' },
    bookmark: { icon: Bookmark, label: 'Bookmark', color: 'text-purple-400' },
    gist: { icon: Code2, label: 'Gist', color: 'text-green-400' },
}

interface NoteModalProps {
    noteId: string
    workspaceId: string
    onClose: () => void
}

export function NoteModal({ noteId, workspaceId, onClose }: NoteModalProps) {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const backdropRef = useRef<HTMLDivElement>(null)

    const { data: note, isLoading } = useQuery({
        queryKey: ['note', noteId],
        queryFn: () => getNote(workspaceId, noteId),
        enabled: !!noteId,
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

    const handlePin = async () => {
        await togglePin(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['note', noteId] })
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
    }

    const handleArchive = async () => {
        await toggleArchive(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        onClose()
    }

    const handleDelete = async () => {
        if (!confirm('Delete this note?')) return
        await deleteNote(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        onClose()
    }

    const handleAI = async (action: string) => {
        if (action === 'summarize') await summarizeNote(workspaceId, noteId)
        else if (action === 'insights') await extractInsights(workspaceId, noteId)
        else if (action === 'title') await generateTitle(workspaceId, noteId)
        qc.invalidateQueries({ queryKey: ['note', noteId] })
    }

    const openNote = () => {
        navigate(`/w/${workspaceId}/notes/${noteId}`)
        onClose()
    }

    const meta = note ? (TYPE_META[note.type] ?? TYPE_META.standard) : TYPE_META.standard
    const TypeIcon = meta.icon
    const displayTitle = note?.title ?? note?.ai_title

    return (
        <AnimatePresence>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                ref={backdropRef}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Sheet — slides up from bottom */}
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
                className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-3xl border-t border-white/10 rounded-t-[32px] shadow-glass-lg flex flex-col mx-auto max-w-4xl"
                style={{ maxHeight: '88vh' }}
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
                                        {note?.type === 'fleeting' && <Clock className="w-3 h-3" />}
                                        {meta.label}
                                    </span>
                                    {note?.is_pinned && <Pin className="w-3 h-3 text-amber-400" />}
                                    {note?.embedding_status === 'done' && <Sparkles className="w-3 h-3 text-accent/60" />}
                                    {note?.gist_language && (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                                            {note.gist_language}
                                        </span>
                                    )}
                                </div>
                                <h2 className={`text-lg font-bold leading-snug ${displayTitle ? '' : 'text-muted-foreground/50 italic'}`}>
                                    {displayTitle ?? 'Untitled'}
                                </h2>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                    <span>{note?.word_count ?? 0} words</span>
                                    <span>Updated {note ? new Date(note.updated_at).toLocaleDateString() : '—'}</span>
                                    <span>Created {note ? new Date(note.created_at).toLocaleDateString() : '—'}</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {note && (
                            <>
                                <button
                                    className="btn-ghost p-1.5"
                                    onClick={handlePin}
                                    title={note.is_pinned ? 'Unpin' : 'Pin'}
                                >
                                    {note.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                                </button>
                                <button
                                    className="btn-ghost p-1.5"
                                    onClick={handleArchive}
                                    title={note.is_archived ? 'Unarchive' : 'Archive'}
                                >
                                    {note.is_archived ? <ArchiveX className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
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
                            onClick={openNote}
                            title="Open in full editor"
                        >
                            <ExternalLink className="w-3.5 h-3.5" /> Open note
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

                    {!isLoading && note && (
                        <>
                            {/* Bookmark URL bar */}
                            {note.type === 'bookmark' && note.url && (
                                <a
                                    href={note.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/20 border border-border/40 rounded-lg px-3 py-2 hover:bg-muted/40 hover:text-foreground transition-colors"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{note.url}</span>
                                </a>
                            )}

                            {/* AI summary */}
                            {note.ai_summary && (
                                <div className="glass-card p-4 border-accent/20 bg-accent/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Brain className="w-3.5 h-3.5 text-accent" />
                                        <span className="text-xs font-medium text-accent">AI Summary</span>
                                    </div>
                                    <div
                                        className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-muted-foreground"
                                        dangerouslySetInnerHTML={{ __html: md.render(note.ai_summary) }}
                                    />
                                </div>
                            )}

                            {/* Tags */}
                            {note.tags && note.tags.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                    {note.tags.map((t: string) => (
                                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent/80 border border-accent/20">
                                            <Hash className="w-2.5 h-2.5 inline mr-0.5" />{t}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Insights */}
                            {note.insights && Object.keys(note.insights).length > 0 && (
                                <div className="glass-card p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Star className="w-3.5 h-3.5 text-amber-400" />
                                        <span className="text-xs font-medium">Insights</span>
                                    </div>
                                    {note.insights.tasks?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Tasks</p>
                                            <ul className="space-y-0.5">
                                                {note.insights.tasks.map((t: string, i: number) => (
                                                    <li key={i} className="text-xs flex items-start gap-1.5">
                                                        <span className="mt-0.5 w-3 h-3 rounded-sm border border-border/60 flex-shrink-0" />
                                                        {t}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {note.insights.timelines?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Timelines</p>
                                            <ul className="space-y-0.5">
                                                {note.insights.timelines.map((h: any, i: number) => (
                                                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                        <span className="text-accent mt-0.5 font-bold">{h.date}</span> {h.event}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {note.insights.facts?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Facts</p>
                                            <ul className="space-y-0.5">
                                                {note.insights.facts.map((h: string, i: number) => (
                                                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                        <span className="text-accent mt-0.5">•</span> {h}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {note.insights.crucial_things?.length > 0 && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Crucial Things</p>
                                            <ul className="space-y-0.5">
                                                {note.insights.crucial_things.map((h: string, i: number) => (
                                                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                                        <span className="text-red-400 mt-0.5">!</span> {h}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Content preview */}
                            <div>
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Content</p>
                                {note.content ? (
                                    <div
                                        className={`prose prose-sm prose-invert max-w-none text-sm leading-relaxed ${note.type === 'gist' ? 'font-mono' : ''}`}
                                        dangerouslySetInnerHTML={{ __html: md.render(note.content) }}
                                    />
                                ) : (
                                    <p className="text-muted-foreground/50 italic text-sm">No content yet.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer — AI quick actions */}
                {!isLoading && note && note.type !== 'fleeting' && (
                    <div className="flex items-center gap-2 px-5 py-3 border-t border-border/50 flex-shrink-0 flex-wrap">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">AI:</span>
                        {!note.ai_summary && (
                            <button
                                className="btn-ghost text-xs py-1 px-2.5 gap-1.5"
                                onClick={() => handleAI('summarize')}
                            >
                                <Brain className="w-3 h-3" /> Summarize
                            </button>
                        )}
                        {(!note.insights || Object.keys(note.insights).length === 0) && (
                            <button
                                className="btn-ghost text-xs py-1 px-2.5 gap-1.5"
                                onClick={() => handleAI('insights')}
                            >
                                <Sparkles className="w-3 h-3" /> Extract insights
                            </button>
                        )}
                        {!note.title && (
                            <button
                                className="btn-ghost text-xs py-1 px-2.5 gap-1.5"
                                onClick={() => handleAI('title')}
                            >
                                <Star className="w-3 h-3" /> Generate title
                            </button>
                        )}
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    )
}
