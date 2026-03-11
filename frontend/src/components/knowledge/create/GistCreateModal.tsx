import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Maximize2 } from 'lucide-react'
import ModalShell from '@/components/knowledge/shared/ModalShell'
import TagInput from '@/components/knowledge/shared/TagInput'
import { createKnowledge } from '@/lib/api'

const GIST_LANGUAGES = [
    'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust',
    'HTML', 'CSS', 'SQL', 'Bash', 'JSON', 'YAML', 'Markdown',
]

interface GistCreateModalProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onCreated?: (knowledge: any) => void
}

export default function GistCreateModal({ isOpen, onClose, workspaceId, onCreated }: GistCreateModalProps) {
    const navigate = useNavigate()
    const qc = useQueryClient()

    const [language, setLanguage] = useState('typescript')
    const [code, setCode] = useState('')
    const [title, setTitle] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setLanguage('typescript')
        setCode('')
        setTitle('')
        setTags([])
        setError(null)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const buildPayload = () => ({
        type: 'gist',
        title: title.trim() || null,
        content: code,
        gist_language: language,
        tags,
    })

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        try {
            const result = await createKnowledge(workspaceId, buildPayload())
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
            const result = await createKnowledge(workspaceId, buildPayload())
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
            title="New Code Gist"
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
            <div className="flex items-center gap-3">
                <select
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="input text-sm w-48"
                >
                    {GIST_LANGUAGES.map(l => (
                        <option key={l} value={l.toLowerCase()}>{l}</option>
                    ))}
                </select>
                <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Gist title (optional)"
                    className="flex-1 input text-sm"
                />
            </div>

            <textarea
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Paste code here..."
                className="w-full bg-muted/20 border border-border/40 rounded-xl p-3 text-sm font-mono resize-none outline-none focus:border-accent/50 transition-colors"
                rows={12}
                spellCheck={false}
                autoFocus
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
