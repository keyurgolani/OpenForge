import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createNote } from '@/lib/api'
import {
    X, Maximize2, FileText, Hash, Loader2, Check
} from 'lucide-react'

interface QuickNotePanelProps {
    workspaceId: string
    onClose: () => void
}

export default function QuickNotePanel({ workspaceId, onClose }: QuickNotePanelProps) {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [tagInput, setTagInput] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [saved, setSaved] = useState(false)
    const [createdNoteId, setCreatedNoteId] = useState<string | null>(null)

    // Focus textarea on mount
    useEffect(() => {
        setTimeout(() => textareaRef.current?.focus(), 50)
    }, [])

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    const create = useMutation({
        mutationFn: () => createNote(workspaceId, {
            title: title.trim() || null,
            content: content.trim(),
            tags,
            note_type: 'note',
        }),
        onSuccess: (note: { id: string }) => {
            setCreatedNoteId(note.id)
            setSaved(true)
            qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
            setTimeout(onClose, 900)
        },
    })

    const handleSave = useCallback(() => {
        if (!content.trim() && !title.trim()) return
        create.mutate()
    }, [content, title, create])

    // Save on Ctrl/Cmd+Enter
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [handleSave])

    const handleExpandToFull = async () => {
        // Save first if unsaved, then navigate to the full note page
        if (createdNoteId) {
            navigate(`/w/${workspaceId}/notes/${createdNoteId}`)
            onClose()
        } else if (content.trim() || title.trim()) {
            try {
                const note = await createNote(workspaceId, {
                    title: title.trim() || null,
                    content: content.trim(),
                    tags,
                    note_type: 'note',
                })
                qc.invalidateQueries({ queryKey: ['notes', workspaceId] })
                navigate(`/w/${workspaceId}/notes/${note.id}`)
                onClose()
            } catch { /* ignore */ }
        } else {
            // Empty note — just navigate to new note
            const note = await createNote(workspaceId, { content: '', note_type: 'note' })
            navigate(`/w/${workspaceId}/notes/${note.id}`)
            onClose()
        }
    }

    const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
            e.preventDefault()
            const tag = tagInput.trim().toLowerCase().replace(/^#/, '')
            if (tag && !tags.includes(tag)) setTags(t => [...t, tag])
            setTagInput('')
        }
        if (e.key === 'Backspace' && !tagInput && tags.length) {
            setTags(t => t.slice(0, -1))
        }
    }

    const hasContent = content.trim() || title.trim()

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-fade-in"
                onClick={onClose}
            />

            {/* Panel — slides up from below the top bar */}
            <div className="fixed left-1/2 -translate-x-1/2 top-16 z-50 w-full max-w-2xl px-4 animate-slide-up">
                <div className="glass-card border border-border/60 shadow-2xl shadow-black/40 overflow-hidden">
                    {/* Toolbar row */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Quick note</span>
                        <span className="text-[10px] text-muted-foreground/50 ml-1 hidden sm:block">
                            ⌘Enter to save · Esc to close
                        </span>
                        <div className="flex-1" />
                        <button
                            className="btn-ghost p-1.5 text-xs gap-1.5 flex items-center"
                            onClick={handleExpandToFull}
                            title="Expand to full page"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:block">Expand</span>
                        </button>
                        <button className="btn-ghost p-1.5" onClick={onClose}>
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Title */}
                    <input
                        className="w-full px-4 pt-3 pb-1 text-base font-semibold bg-transparent border-none outline-none placeholder-muted-foreground/40"
                        placeholder="Title (optional)"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />

                    {/* Content */}
                    <textarea
                        ref={textareaRef}
                        className="w-full px-4 py-2 min-h-[140px] max-h-[45vh] bg-transparent border-none outline-none resize-none text-sm text-foreground leading-relaxed placeholder-muted-foreground/40 font-mono"
                        placeholder="Start writing… (Markdown supported)"
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        style={{ tabSize: 2 }}
                    />

                    {/* Footer row — tags + save */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border/40 bg-muted/10 flex-wrap">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        {tags.map(t => (
                            <span
                                key={t}
                                className="chip-accent text-[10px] cursor-pointer hover:opacity-70 transition-opacity"
                                onClick={() => setTags(ts => ts.filter(x => x !== t))}
                            >
                                {t} ×
                            </span>
                        ))}
                        <input
                            className="text-xs bg-transparent border-none outline-none text-muted-foreground placeholder-muted-foreground/40 min-w-[80px] flex-1"
                            placeholder="Add tag…"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                        />
                        <div className="flex-1" />
                        <button
                            className="btn-primary text-xs py-1.5 px-3"
                            onClick={handleSave}
                            disabled={!hasContent || create.isPending || saved}
                        >
                            {saved
                                ? <><Check className="w-3.5 h-3.5" /> Saved</>
                                : create.isPending
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : 'Save note'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
