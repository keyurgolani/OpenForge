import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createNote, updateNote, deleteNote } from '@/lib/api'
import {
    X, Expand, Loader2, Tag, Save, FileText, Zap, Bookmark, Code2, Plus
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type NoteType = 'standard' | 'fleeting' | 'bookmark' | 'gist'

const TYPE_CONFIG: Record<NoteType, {
    label: string
    Icon: React.ComponentType<{ className?: string }>
    color: string
    titlePlaceholder: string
    contentPlaceholder: string
}> = {
    standard: {
        label: 'Note',
        Icon: FileText,
        color: 'text-blue-400',
        titlePlaceholder: 'Note title…',
        contentPlaceholder: 'Start writing… (markdown supported)',
    },
    fleeting: {
        label: 'Fleeting',
        Icon: Zap,
        color: 'text-yellow-400',
        titlePlaceholder: 'Quick thought…',
        contentPlaceholder: 'Capture it fast…',
    },
    bookmark: {
        label: 'Bookmark',
        Icon: Bookmark,
        color: 'text-purple-400',
        titlePlaceholder: 'Bookmark title…',
        contentPlaceholder: 'Notes about this link…',
    },
    gist: {
        label: 'Gist',
        Icon: Code2,
        color: 'text-green-400',
        titlePlaceholder: 'Gist title…',
        contentPlaceholder: 'Paste code here…',
    },
}

const GIST_LANGUAGES = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'SQL', 'Bash', 'JSON', 'YAML', 'Other']

interface Props {
    open: boolean
    defaultType?: NoteType
    onClose: () => void
}

export function QuickNotePanel({ open, defaultType = 'standard', onClose }: Props) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()

    const [type, setType] = useState<NoteType>(defaultType)
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [url, setUrl] = useState('')
    const [gistLang, setGistLang] = useState('TypeScript')
    const [tagInput, setTagInput] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [noteId, setNoteId] = useState<string | null>(null) // draft note id

    const titleRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    // Focus title on open
    useEffect(() => {
        if (open) {
            setType(defaultType)
            setTimeout(() => titleRef.current?.focus(), 80)
        }
        if (!open) {
            // reset state
            setTitle(''); setContent(''); setUrl(''); setTagInput(''); setTags([])
            setGistLang('TypeScript'); setNoteId(null)
        }
    }, [open, defaultType])

    const isEmpty = !title.trim() && !content.trim() && !url.trim()

    // Close: if empty discard draft; if has content and no noteId yet — don't save (user explicitly closed)
    const handleClose = useCallback(async () => {
        if (noteId && isEmpty) {
            // a draft was created but user cleared it — delete it
            await deleteNote(workspaceId, noteId).catch(() => { })
            qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
        }
        onClose()
    }, [noteId, isEmpty, workspaceId, qc, onClose])

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!open) return
            if (e.key === 'Escape') { handleClose(); return }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [open, handleClose]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async () => {
        if (isEmpty) { handleClose(); return }
        setSaving(true)
        try {
            const payload = {
                type,
                title: title.trim() || null,
                content: content.trim() || null,
                url: url.trim() || null,
                tags,
                gist_language: type === 'gist' ? gistLang : undefined,
            }
            if (noteId) {
                await updateNote(workspaceId, noteId, payload)
            } else {
                const n = await createNote(workspaceId, payload)
                setNoteId(n.id)
            }
            qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
            handleClose()
        } finally {
            setSaving(false)
        }
    }

    const handleExpand = async () => {
        if (isEmpty) { handleClose(); return }
        setSaving(true)
        try {
            let id = noteId
            if (!id) {
                const n = await createNote(workspaceId, {
                    type,
                    title: title.trim() || null,
                    content: content.trim() || null,
                    url: url.trim() || null,
                    tags,
                    gist_language: type === 'gist' ? gistLang : undefined,
                })
                id = n.id
                qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
            }
            onClose()
            navigate(`/w/${workspaceId}/notes/${id}`)
        } finally {
            setSaving(false)
        }
    }

    const handleAddTag = () => {
        const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
        if (t && !tags.includes(t)) setTags(p => [...p, t])
        setTagInput('')
    }

    if (!open) return null

    const cfg = TYPE_CONFIG[type]

    return (
        <AnimatePresence>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md"
                onClick={handleClose}
            />

            {/* Panel */}
            <motion.div
                ref={panelRef}
                initial={{ scale: 0.95, opacity: 0, x: '-50%', y: '-48%' }}
                animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }}
                exit={{ scale: 0.95, opacity: 0, x: '-50%', y: '-50%' }}
                transition={{
                    type: 'spring',
                    damping: 25,
                    stiffness: 300,
                    mass: 0.8
                }}
                className="fixed z-50 top-1/2 left-1/2 w-full max-w-lg glass-card border border-white/10 shadow-glass-lg overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Inner Glow Line */}
                <div className="absolute inset-0 border border-white/5 rounded-[inherit] pointer-events-none mix-blend-overlay" />
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                    {/* Type selector */}
                    <div className="flex gap-1">
                        {(Object.entries(TYPE_CONFIG) as [NoteType, typeof TYPE_CONFIG[NoteType]][]).map(([t, c]) => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${type === t ? `bg-muted ${c.color}` : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                title={c.label}
                            >
                                <c.Icon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{c.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex-1" />

                    <button className="btn-ghost p-1.5" onClick={handleExpand} title="Expand to full editor">
                        <Expand className="w-3.5 h-3.5" />
                    </button>
                    <button className="btn-ghost p-1.5" onClick={handleClose} title="Close (Esc)">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    {/* Bookmark URL field */}
                    {type === 'bookmark' && (
                        <input
                            className="input text-sm"
                            placeholder="https://… (required for bookmark)"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            autoFocus={type === 'bookmark'}
                        />
                    )}

                    {/* Gist language selector */}
                    {type === 'gist' && (
                        <select className="input text-sm" value={gistLang} onChange={e => setGistLang(e.target.value)}>
                            {GIST_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    )}

                    {/* Title — only standard, bookmark, gist (fleeting = no title) */}
                    {type !== 'fleeting' && (
                        <input
                            ref={titleRef}
                            className="w-full bg-transparent text-base font-semibold placeholder-muted-foreground/50 outline-none"
                            placeholder={cfg.titlePlaceholder}
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                    )}

                    {/* Content */}
                    <textarea
                        ref={type === 'fleeting' ? textareaRef : undefined}
                        className={`w-full bg-transparent text-sm placeholder-muted-foreground/50 outline-none resize-none leading-relaxed ${type === 'gist' ? 'font-mono text-xs' : ''
                            }`}
                        placeholder={cfg.contentPlaceholder}
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        rows={type === 'gist' ? 8 : 5}
                    />

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {tags.map(t => (
                            <span
                                key={t}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent/80 cursor-pointer hover:bg-destructive/20 hover:text-red-400 transition-colors"
                                onClick={() => setTags(p => p.filter(x => x !== t))}
                            >
                                {t} <X className="w-2.5 h-2.5" />
                            </span>
                        ))}
                        <div className="flex items-center gap-1 flex-1 min-w-28">
                            <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <input
                                className="flex-1 bg-transparent text-xs placeholder-muted-foreground/50 outline-none"
                                placeholder="Add tag…"
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag() }
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/10">
                    <span className="text-[10px] text-muted-foreground opacity-60">
                        ⌘↵ save · Esc close  ·  Click type to switch
                    </span>
                    <div className="flex gap-2">
                        <button className="btn-ghost text-xs py-1.5 px-3" onClick={handleClose}>
                            {isEmpty ? 'Discard' : 'Cancel'}
                        </button>
                        <button
                            className="btn-primary text-xs py-1.5 px-3"
                            onClick={handleSave}
                            disabled={saving || isEmpty}
                        >
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Save
                        </button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
