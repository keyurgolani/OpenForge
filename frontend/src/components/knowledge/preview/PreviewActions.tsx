import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pin, Archive, Trash2, Loader2 } from 'lucide-react'
import { togglePin, toggleArchive, deleteKnowledge } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PreviewActionsProps {
    knowledge: any
    workspaceId: string
    onClose: () => void
}

export default function PreviewActions({ knowledge, workspaceId, onClose }: PreviewActionsProps) {
    const qc = useQueryClient()
    const [deleting, setDeleting] = useState(false)

    const handlePin = async () => {
        await togglePin(workspaceId, knowledge.id)
        qc.invalidateQueries({ queryKey: ['knowledge-detail', workspaceId, knowledge.id] })
        qc.invalidateQueries({ queryKey: ['knowledge'] })
    }

    const handleArchive = async () => {
        await toggleArchive(workspaceId, knowledge.id)
        qc.invalidateQueries({ queryKey: ['knowledge-detail', workspaceId, knowledge.id] })
        qc.invalidateQueries({ queryKey: ['knowledge'] })
    }

    const handleDelete = async () => {
        if (!confirm('Delete this knowledge item permanently?')) return
        setDeleting(true)
        try {
            await deleteKnowledge(workspaceId, knowledge.id)
            qc.invalidateQueries({ queryKey: ['knowledge'] })
            onClose()
        } finally {
            setDeleting(false)
        }
    }

    const btnClass =
        'p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors'

    return (
        <>
            <button
                type="button"
                onClick={handlePin}
                className={cn(btnClass, knowledge.is_pinned && 'text-amber-300')}
                aria-label={knowledge.is_pinned ? 'Unpin' : 'Pin'}
                title={knowledge.is_pinned ? 'Unpin' : 'Pin'}
            >
                <Pin className="w-4 h-4" />
            </button>

            <button
                type="button"
                onClick={handleArchive}
                className={cn(btnClass, knowledge.is_archived && 'text-blue-400')}
                aria-label={knowledge.is_archived ? 'Unarchive' : 'Archive'}
                title={knowledge.is_archived ? 'Unarchive' : 'Archive'}
            >
                <Archive className="w-4 h-4" />
            </button>

            <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={cn(btnClass, 'hover:text-red-400')}
                aria-label="Delete"
                title="Delete"
            >
                {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Trash2 className="w-4 h-4" />
                )}
            </button>
        </>
    )
}
