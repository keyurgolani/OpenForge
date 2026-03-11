import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import PreviewShell from '@/components/knowledge/shared/PreviewShell'
import KnowledgeIntelligence, { GenerateIntelligenceButton } from '@/components/knowledge/shared/KnowledgeIntelligence'
import PreviewActions from './PreviewActions'
import { CopyButton } from '@/components/shared/CopyButton'
import KnowledgeMetadata from '@/components/knowledge/shared/KnowledgeMetadata'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

interface NotePreviewProps {
    knowledge: any
    workspaceId: string
    onClose: () => void
}

export default function NotePreview({ knowledge, workspaceId, onClose }: NotePreviewProps) {
    const navigate = useNavigate()
    const content = knowledge.content || ''
    const html = md.render(content)
    const handleOpenEditor = () => {
        onClose()
        navigate(`/w/${workspaceId}/knowledge/${knowledge.id}?edit=1`)
    }

    return (
        <PreviewShell
            isOpen
            onClose={onClose}
            title={knowledge.title || knowledge.ai_title || 'Untitled Note'}
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
            <div className="space-y-5">
                {/* Rendered markdown */}
                {content && (
                    <div className="relative">
                        <CopyButton
                            content={content}
                            iconOnly
                            className="absolute top-0 right-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                        />
                        <div
                            className="prose prose-sm prose-invert max-w-none text-foreground/85 leading-relaxed pr-8"
                            dangerouslySetInnerHTML={{ __html: html }}
                        />
                    </div>
                )}

            </div>
        </PreviewShell>
    )
}
