import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Maximize2 } from 'lucide-react'
import ModalShell from '@/components/knowledge/shared/ModalShell'
import TagInput from '@/components/knowledge/shared/TagInput'
import { createKnowledge } from '@/lib/api'

interface NoteCreateModalProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onCreated?: (knowledge: any) => void
}

export default function NoteCreateModal({ isOpen, onClose, workspaceId, onCreated }: NoteCreateModalProps) {
    const navigate = useNavigate()
    const qc = useQueryClient()

    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setTitle('')
        setContent('')
        setTags([])
        setError(null)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            const result = await createKnowledge(workspaceId, {
                type: 'note',
                title: title.trim() || null,
                content,
                tags,
            })
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onCreated?.(result)
            reset()
            onClose()
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to save. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const handleExpand = async () => {
        setSaving(true)
        setError(null)
        try {
            const result = await createKnowledge(workspaceId, {
                type: 'note',
                title: title.trim() || null,
                content,
                tags,
            })
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            onCreated?.(result)
            reset()
            onClose()
            navigate(`/w/${workspaceId}/knowledge/${result.id}?edit=1&draft=1`)
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to save. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={handleClose}
            title="New Note"
            size="lg"
            footer={
                <>
                    <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={handleClose}>
                        Discard
                    </button>
                    <button
                        type="button"
                        className="btn-ghost text-xs py-1.5 px-3 gap-1.5"
                        onClick={handleExpand}
                        disabled={saving}
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                        Expand
                    </button>
                    <button
                        type="button"
                        className="btn-primary text-xs py-1.5 px-4 gap-1.5"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                    </button>
                </>
            }
        >
            <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Give your note a title..."
                className="w-full bg-transparent text-lg font-semibold placeholder-muted-foreground/40 outline-none border-none"
                autoFocus
            />

            <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Start writing..."
                className="w-full bg-muted/20 border border-border/40 rounded-xl p-3 text-sm resize-none outline-none focus:border-accent/50 transition-colors min-h-[160px]"
                rows={8}
            />

            <TagInput tags={tags} onChange={setTags} placeholder="Add tags..." />

            {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}
        </ModalShell>
    )
}
