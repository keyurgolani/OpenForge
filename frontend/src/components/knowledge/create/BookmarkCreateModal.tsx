import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Link2 } from 'lucide-react'
import ModalShell from '@/components/knowledge/shared/ModalShell'
import TagInput from '@/components/knowledge/shared/TagInput'
import { createKnowledge, updateKnowledgeTags } from '@/lib/api'

interface BookmarkCreateModalProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onCreated?: (knowledge: any) => void
}

export default function BookmarkCreateModal({ isOpen, onClose, workspaceId, onCreated }: BookmarkCreateModalProps) {
    const qc = useQueryClient()

    const [url, setUrl] = useState('')
    const [title, setTitle] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setUrl('')
        setTitle('')
        setTags([])
        setError(null)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const handleSave = async () => {
        if (!url.trim()) {
            setError('Please enter a URL.')
            return
        }
        setSaving(true)
        setError(null)
        try {
            const result = await createKnowledge(workspaceId, {
                type: 'bookmark',
                url: url.trim(),
                title: title.trim() || null,
                content: '',
            })
            if (tags.length > 0 && result?.id) {
                await updateKnowledgeTags(workspaceId, result.id, tags)
            }
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

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={handleClose}
            title="New Bookmark"
            size="md"
            footer={
                <>
                    <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={handleClose}>
                        Discard
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
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-muted/20">
                <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 bg-transparent text-sm placeholder-muted-foreground/50 outline-none"
                    autoFocus
                />
            </div>

            <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title (optional)"
                className="w-full input text-sm"
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
