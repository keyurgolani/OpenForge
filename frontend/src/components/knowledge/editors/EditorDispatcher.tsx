import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { getKnowledge } from '@/lib/api'
import NoteEditor from './NoteEditor'
import GistEditor from './GistEditor'

export default function EditorDispatcher() {
    const { workspaceId = '', knowledgeId = '' } = useParams<{
        workspaceId: string
        knowledgeId: string
    }>()
    const navigate = useNavigate()

    const { data: knowledge, isLoading } = useQuery({
        queryKey: ['knowledge-item', knowledgeId],
        queryFn: () => getKnowledge(workspaceId, knowledgeId),
        enabled: !!knowledgeId && !!workspaceId,
    })

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!knowledge) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Knowledge item not found.</p>
            </div>
        )
    }

    const type = knowledge.type as string

    switch (type) {
        case 'note':
            return <NoteEditor knowledge={knowledge} workspaceId={workspaceId} />
        case 'gist':
            return <GistEditor knowledge={knowledge} workspaceId={workspaceId} />
        case 'fleeting':
            // Fleeting notes don't have a full editor — redirect to workspace home
            navigate(`/w/${workspaceId}`, { replace: true })
            return null
        default:
            // Other types (bookmark, image, audio, file) don't have editors
            navigate(`/w/${workspaceId}`, { replace: true })
            return null
    }
}
