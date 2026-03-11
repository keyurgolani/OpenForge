import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createKnowledge, updateKnowledge, deleteKnowledge } from '@/lib/api'
import { isModKey, getModSymbol } from '@/lib/keyboard'
import {
    X, Expand, Loader2, Tag, Save, FileText, Zap, Bookmark, Code2, Plus
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type KnowledgeType = 'note' | 'fleeting' | 'bookmark' | 'gist'

const TYPE_CONFIG: Record<KnowledgeType, {
    label: string
    Icon: React.ComponentType<{ className?: string }>
    color: string
    titlePlaceholder: string
    contentPlaceholder: string
}> = {
    note: {
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
        contentPlaceholder: 'Knowledge about this link…',
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
    defaultType?: KnowledgeType
    onClose: () => void
}

export function QuickKnowledgePanel({ open, defaultType = 'note', onClose }: Props) {
    const { workspaceId = '' } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const qc = useQueryClient()

    const [type, setType] = useState<KnowledgeType>(defaultType)
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [url, setUrl] = useState('')
    const [gistLang, setGistLang] = useState('TypeScript')
    const [tagInput, setTagInput] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [knowledgeId, setKnowledgeId] = useState<string | null>(null) // Draft knowledge ID.

    const urlRef = useRef<HTMLInputElement>(null)
    const titleRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    // Set the selected type before paint when opening to avoid transient stale UI state.
    useLayoutEffect(() => {
        if (open) setType(defaultType)
    }, [open, defaultType])

    // Reset draft state after close.
    useEffect(() => {
        if (!open) {
            setTitle('')
            setContent('')
            setUrl('')
            setTagInput('')
            setTags([])
            setGistLang('TypeScript')
            setKnowledgeId(null)
            setType(defaultType)
        }
    }, [open, defaultType])

    // Focus the most relevant field when the modal is open.
    useEffect(() => {
        if (!open) return
        const focusTimer = window.setTimeout(() => {
            if (type === 'bookmark') {
                urlRef.current?.focus()
                return
            }
            if (type === 'fleeting') {
                textareaRef.current?.focus()
                return
            }
            titleRef.current?.focus()
        }, 0)
        return () => window.clearTimeout(focusTimer)
    }, [open, type])

    // If user switches to bookmark type while modal is open, focus URL input.
    useEffect(() => {
        if (!open || type !== 'bookmark') return
        const focusTimer = window.setTimeout(() => urlRef.current?.focus(), 0)
        return () => window.clearTimeout(focusTimer)
    }, [open, type])

    const isEmpty = !title.trim() && !content.trim() && !url.trim()

    const buildPayload = () => {
        const currentTitle = titleRef.current?.value ?? title
        const currentContent = textareaRef.current?.value ?? content
        const currentUrl = urlRef.current?.value ?? url

        return {
            type,
            // Fleeting knowledge does not persist a title field.
            title: type === 'fleeting' ? null : (currentTitle.trim() || null),
            content: currentContent.trim() ? currentContent : '',
            url: currentUrl.trim() || null,
            tags,
            gist_language: type === 'gist' ? gistLang : undefined,
        }
    }

    const isPayloadEmpty = (payload: ReturnType<typeof buildPayload>) =>
        !((payload.title ?? '').trim()) && !payload.content.trim() && !((payload.url ?? '').trim())

    const persistDraft = async (
        allowCreateWhenEmpty: boolean,
        payload: ReturnType<typeof buildPayload> = buildPayload(),
    ): Promise<string | null> => {
        if (knowledgeId) {
            await updateKnowledge(workspaceId, knowledgeId, payload)
            return knowledgeId
        }
        if (isPayloadEmpty(payload) && !allowCreateWhenEmpty) return null
        const createdKnowledge = await createKnowledge(workspaceId, payload)
        setKnowledgeId(createdKnowledge.id)
        qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        return createdKnowledge.id
    }

    // Close: if empty discard draft; if has content and no knowledgeId yet — don't save (user explicitly closed)
    const handleClose = useCallback(async () => {
        const payload = buildPayload()
        if (knowledgeId && isPayloadEmpty(payload)) {
            // a draft was created but user cleared it — delete it
            await deleteKnowledge(workspaceId, knowledgeId).catch(() => { })
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
        }
        onClose()
    }, [knowledgeId, workspaceId, qc, onClose, title, content, url, type, tags, gistLang])

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!open) return
            if (e.key === 'Escape') { handleClose(); return }
            if (isModKey(e) && e.key === 'Enter') { e.preventDefault(); handleSave() }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [open, handleClose]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async () => {
        const payload = buildPayload()
        if (isPayloadEmpty(payload)) { handleClose(); return }
        setSaving(true)
        try {
            await persistDraft(false, payload)
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            handleClose()
        } finally {
            setSaving(false)
        }
    }

    const handleExpand = async () => {
        const payload = buildPayload()
        setSaving(true)
        try {
            const shouldDiscardIfUntouched = isPayloadEmpty(payload)
            const id = await persistDraft(true, payload)
            if (!id) return
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onClose()
            const query = shouldDiscardIfUntouched ? '?draft=1' : ''
            navigate(`/w/${workspaceId}/knowledge/${id}${query}`)
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
                        {(Object.entries(TYPE_CONFIG) as [KnowledgeType, typeof TYPE_CONFIG[KnowledgeType]][]).map(([t, c]) => (
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
                            ref={urlRef}
                            className="input text-sm"
                            placeholder="https://… (required for bookmark)"
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                        />
                    )}

                    {/* Gist language selector */}
                    {type === 'gist' && (
                        <select className="input text-sm" value={gistLang} onChange={e => setGistLang(e.target.value)}>
                            {GIST_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    )}

                    {/* Title — only note, bookmark, gist (fleeting = no title) */}
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
                        ref={textareaRef}
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
                                className="chip-accent text-[10px] cursor-pointer hover:bg-destructive/20 hover:text-red-300 transition-colors"
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
                        {getModSymbol()}+↵ save · Esc close · Click type to switch
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
