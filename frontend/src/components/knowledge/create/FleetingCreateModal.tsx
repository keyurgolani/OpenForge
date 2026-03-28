import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import ModalShell from '@/components/knowledge/shared/ModalShell'
import { createKnowledge } from '@/lib/api'

interface FleetingCreateModalProps {
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onCreated?: (knowledge: any) => void
}

export default function FleetingCreateModal({ isOpen, onClose, workspaceId, onCreated }: FleetingCreateModalProps) {
    const qc = useQueryClient()
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const [content, setContent] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (isOpen) {
            // Focus with a short delay to let the modal animate in
            const t = setTimeout(() => textareaRef.current?.focus(), 100)
            return () => clearTimeout(t)
        }
    }, [isOpen])

    const reset = () => {
        setContent('')
        setError(null)
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    const handleSave = async () => {
        if (!content.trim()) return
        setSaving(true)
        setError(null)
        try {
            const result = await createKnowledge(workspaceId, {
                type: 'fleeting',
                title: null,
                content,
                tags: [],
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSave()
        }
    }

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={handleClose}
            title="Fleeting Note"
            size="sm"
        >
            <textarea
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind?"
                className="w-full bg-muted/20 border border-border/60 rounded-xl p-3 text-sm resize-none outline-none focus:border-accent/50 transition-colors min-h-[160px]"
                rows={6}
            />

            <p className="text-[11px] text-muted-foreground/60 text-center">
                Press <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/50 text-[10px] font-mono">Enter</kbd> to save
                {' '}&middot;{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/50 text-[10px] font-mono">Shift+Enter</kbd> for new line
            </p>

            {saving && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                </div>
            )}

            {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                </p>
            )}
        </ModalShell>
    )
}
