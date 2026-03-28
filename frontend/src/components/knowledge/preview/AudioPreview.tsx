import { useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw, Loader2, Music } from 'lucide-react'
import { getKnowledgeFileUrl, reprocessKnowledge } from '@/lib/api'
import PreviewShell from '@/components/knowledge/shared/PreviewShell'
import KnowledgeIntelligence, { GenerateIntelligenceButton, getIntelligenceCount } from '@/components/knowledge/shared/KnowledgeIntelligence'
import PreviewActions from './PreviewActions'
import { CopyButton } from '@/components/shared/CopyButton'
import KnowledgeMetadata from '@/components/knowledge/shared/KnowledgeMetadata'

interface AudioPreviewProps {
    knowledge: any
    workspaceId: string
    onClose: () => void
}

export default function AudioPreview({ knowledge, workspaceId, onClose }: AudioPreviewProps) {
    const qc = useQueryClient()
    const fileUrl = getKnowledgeFileUrl(workspaceId, knowledge.id)
    const isReprocessing = knowledge.embedding_status === 'processing'

    const handleDownload = () => {
        const a = document.createElement('a')
        a.href = fileUrl
        a.download = knowledge.title || knowledge.file_path || 'audio'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
    }

    const handleReprocess = async () => {
        await reprocessKnowledge(workspaceId, knowledge.id)
        qc.invalidateQueries({ queryKey: ['knowledge-detail', workspaceId, knowledge.id] })
        qc.invalidateQueries({ queryKey: ['knowledge'] })
    }

    return (
        <PreviewShell
            isOpen
            onClose={onClose}
            title={knowledge.title || knowledge.ai_title || 'Audio'}
            actions={
                <>
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
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        aria-label="Download"
                        title="Download"
                    >
                        <Download className="w-4 h-4" />
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
                {/* Audio player */}
                <div className="rounded-lg border border-border/25 bg-muted/10 p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <Music className="w-5 h-5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground truncate">
                            {knowledge.title || knowledge.ai_title || 'Audio file'}
                        </span>
                    </div>
                    <audio
                        controls
                        src={fileUrl}
                        className="w-full"
                        preload="metadata"
                    >
                        Your browser does not support the audio element.
                    </audio>
                </div>

                {/* Transcript */}
                {knowledge.content && (
                    <div className="relative space-y-2">
                        <CopyButton
                            content={knowledge.content}
                            iconOnly
                            className="absolute top-0 right-0 p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 transition-colors"
                        />
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Transcript
                        </h3>
                        <div className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap pr-8">
                            {knowledge.content}
                        </div>
                    </div>
                )}

            </div>
        </PreviewShell>
    )
}
