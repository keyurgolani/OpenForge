import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { getKnowledge } from '@/lib/api'
import PreviewShell from '@/components/knowledge/shared/PreviewShell'
import NotePreview from './NotePreview'
import FleetingPreview from './FleetingPreview'
import BookmarkPreview from './BookmarkPreview'
import GistPreview from './GistPreview'
import ImagePreview from './ImagePreview'
import AudioPreview from './AudioPreview'
import FilePreview from './FilePreview'

interface PreviewDispatcherProps {
    knowledgeId: string | null
    workspaceId: string
    isOpen: boolean
    onClose: () => void
}

export default function PreviewDispatcher({
    knowledgeId,
    workspaceId,
    isOpen,
    onClose,
}: PreviewDispatcherProps) {
    const { data: knowledge, isLoading } = useQuery({
        queryKey: ['knowledge-detail', workspaceId, knowledgeId],
        queryFn: () => getKnowledge(workspaceId, knowledgeId!),
        enabled: !!knowledgeId && isOpen,
    })

    if (!isOpen || !knowledgeId) return null

    if (isLoading || !knowledge) {
        return (
            <PreviewShell isOpen={isOpen} onClose={onClose}>
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            </PreviewShell>
        )
    }

    const type = knowledge.type as string
    const commonProps = { knowledge, workspaceId, onClose }

    switch (type) {
        case 'note':
            return <NotePreview {...commonProps} />
        case 'fleeting':
            return <FleetingPreview {...commonProps} />
        case 'bookmark':
            return <BookmarkPreview {...commonProps} />
        case 'gist':
            return <GistPreview {...commonProps} />
        case 'image':
            return <ImagePreview {...commonProps} />
        case 'audio':
            return <AudioPreview {...commonProps} />
        case 'pdf':
        case 'document':
        case 'sheet':
        case 'slides':
            return <FilePreview {...commonProps} />
        default:
            return (
                <PreviewShell isOpen={isOpen} onClose={onClose} title={knowledge.title || 'Unknown type'}>
                    <p className="text-sm text-muted-foreground">
                        Preview is not available for this type.
                    </p>
                </PreviewShell>
            )
    }
}
