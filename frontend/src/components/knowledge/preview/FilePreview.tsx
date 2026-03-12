import { useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw, Loader2 } from 'lucide-react'
import { getKnowledgeFileUrl, getKnowledgeThumbnailUrl, reprocessKnowledge } from '@/lib/api'
import PreviewShell from '@/components/knowledge/shared/PreviewShell'
import KnowledgeIntelligence, { GenerateIntelligenceButton, getIntelligenceCount } from '@/components/knowledge/shared/KnowledgeIntelligence'
import PreviewActions from './PreviewActions'
import { CopyButton } from '@/components/shared/CopyButton'
import KnowledgeMetadata from '@/components/knowledge/shared/KnowledgeMetadata'

interface FilePreviewProps {
    knowledge: any
    workspaceId: string
    onClose: () => void
}

function getTypeLabel(type: string): string {
    switch (type) {
        case 'pdf': return 'PDF Document'
        case 'document': return 'Document'
        case 'sheet': return 'Sheet'
        case 'slides': return 'Slides'
        default: return 'File'
    }
}

export default function FilePreview({ knowledge, workspaceId, onClose }: FilePreviewProps) {
    const qc = useQueryClient()
    const fileUrl = getKnowledgeFileUrl(workspaceId, knowledge.id)
    const isReprocessing = knowledge.embedding_status === 'processing'
    const thumbnailUrl = knowledge.thumbnail_path
        ? getKnowledgeThumbnailUrl(workspaceId, knowledge.id)
        : null

    const type = knowledge.type as string

    const handleDownload = () => {
        const a = document.createElement('a')
        a.href = fileUrl
        a.download = knowledge.title || knowledge.file_path || 'file'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    const handleReprocess = async () => {
        await reprocessKnowledge(workspaceId, knowledge.id)
        qc.invalidateQueries({ queryKey: ['knowledge-detail', workspaceId, knowledge.id] })
        qc.invalidateQueries({ queryKey: ['knowledge'] })
    }

    // Content preview (first 500 words)
    const contentPreview = knowledge.content
        ? knowledge.content.split(/\s+/).slice(0, 500).join(' ')
        : ''
    const isTruncated = knowledge.content
        ? knowledge.content.split(/\s+/).length > 500
        : false

    return (
        <PreviewShell
            isOpen
            onClose={onClose}
            title={knowledge.title || knowledge.ai_title || getTypeLabel(type)}
            actions={
                <>
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        aria-label="Download"
                        title="Download"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={handleReprocess}
                        disabled={isReprocessing}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                        aria-label="Re-extract"
                        title="Re-extract"
                    >
                        {isReprocessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                    </button>
                    <GenerateIntelligenceButton knowledge={knowledge} workspaceId={workspaceId} />
                    <PreviewActions knowledge={knowledge} workspaceId={workspaceId} onClose={onClose} />
                </>
            }
            leftRail={<KnowledgeMetadata knowledge={knowledge} />}
            siderail={(onCollapse) => <KnowledgeIntelligence knowledge={knowledge} workspaceId={workspaceId} onCollapse={onCollapse} />}
            railItemCount={getIntelligenceCount(knowledge)}
        >
            <div className="space-y-5">
                {/* Thumbnail */}
                {thumbnailUrl && (
                    <div className="rounded-lg overflow-hidden border border-border/40 bg-muted/10">
                        <img
                            src={thumbnailUrl}
                            alt="File thumbnail"
                            className="w-full h-auto object-contain max-h-[300px]"
                        />
                    </div>
                )}

                {/* Content preview */}
                {contentPreview && (
                    <div className="relative pt-4 border-t border-border/30">
                        <CopyButton
                            content={knowledge.content}
                            iconOnly
                            className="absolute top-4 right-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                        />
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                            Content Preview
                        </h3>
                        <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap pr-8">
                            {contentPreview}
                            {isTruncated && (
                                <span className="text-muted-foreground"> ...</span>
                            )}
                        </p>
                    </div>
                )}

            </div>
        </PreviewShell>
    )
}
