import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, BookOpen } from 'lucide-react'
import ModalShell from '@/components/knowledge/shared/ModalShell'
import { addJournalEntry } from '@/lib/api'

interface JournalCreateModalProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onCreated?: (knowledge: any) => void
}

export default function JournalCreateModal({ isOpen, onClose, workspaceId, onCreated }: JournalCreateModalProps) {
    const qc = useQueryClient()
    const [content, setContent] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => { setContent(''); setError(null) }
    const handleClose = () => { reset(); onClose() }

    const handleSave = async () => {
        if (!content.trim()) { setError('Please write something.'); return }
        setSaving(true); setError(null)
        try {
            const result = await addJournalEntry(workspaceId, content.trim())
            qc.invalidateQueries({ queryKey: ['knowledge', workspaceId] })
            qc.invalidateQueries({ queryKey: ['journals', workspaceId] })
            onCreated?.(result)
            reset(); onClose()
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'Failed to save. Please try again.')
        } finally { setSaving(false) }
    }

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    return (
        <ModalShell isOpen={isOpen} onClose={handleClose} title="Journal Entry" size="md"
            footer={<>
                <button type="button" className="btn-ghost text-xs py-1.5 px-3" onClick={handleClose}>Discard</button>
                <button type="button" className="btn-primary text-xs py-1.5 px-4 gap-1.5" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                    Add Entry
                </button>
            </>}
        >
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span className="font-medium text-foreground">{today}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
                This entry will be added to today's journal. Entries are editable for 5 minutes.
            </p>
            <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="What's on your mind..."
                className="w-full bg-muted/20 border border-border/25 rounded-xl p-3 text-sm resize-none outline-none focus:border-amber-500/50 transition-colors min-h-[160px]"
                rows={8} autoFocus
            />
            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        </ModalShell>
    )
}
