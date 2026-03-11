import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import PreviewShell from '@/components/knowledge/shared/PreviewShell'
import KnowledgeIntelligence, { GenerateIntelligenceButton } from '@/components/knowledge/shared/KnowledgeIntelligence'
import PreviewActions from './PreviewActions'
import { CopyButton } from '@/components/shared/CopyButton'
import KnowledgeMetadata from '@/components/knowledge/shared/KnowledgeMetadata'

interface GistPreviewProps {
    knowledge: any
    workspaceId: string
    onClose: () => void
}

export default function GistPreview({ knowledge, workspaceId, onClose }: GistPreviewProps) {
    const navigate = useNavigate()
    const content = knowledge.content || ''

    const handleOpenEditor = () => {
        onClose()
        navigate(`/w/${workspaceId}/knowledge/${knowledge.id}?edit=1`)
    }

    return (
        <PreviewShell
            isOpen
            onClose={onClose}
            title={knowledge.title || knowledge.ai_title || 'Gist'}
            actions={
                <>
                    <button
                        type="button"
                        onClick={handleOpenEditor}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        aria-label="Open Editor"
                        title="Open Editor"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <GenerateIntelligenceButton knowledge={knowledge} workspaceId={workspaceId} />
                    <PreviewActions knowledge={knowledge} workspaceId={workspaceId} onClose={onClose} />
                </>
            }
            leftRail={<KnowledgeMetadata knowledge={knowledge} />}
            siderail={<KnowledgeIntelligence knowledge={knowledge} workspaceId={workspaceId} />}
        >
            <div className="space-y-4">
                {/* Code block */}
                <div className="relative rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
                    <CopyButton
                        content={content}
                        iconOnly
                        className="absolute top-2 right-2 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors z-10"
                    />
                    <pre className="overflow-x-auto p-4 pr-10 text-xs leading-relaxed">
                        <code className="font-mono text-foreground/90 whitespace-pre">
                            {content}
                        </code>
                    </pre>
                </div>

            </div>
        </PreviewShell>
    )
}
