import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink, RefreshCw, Globe, Loader2 } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { extractBookmarkContent } from '@/lib/api'
import PreviewShell from '@/components/knowledge/shared/PreviewShell'
import KnowledgeIntelligence, { GenerateIntelligenceButton } from '@/components/knowledge/shared/KnowledgeIntelligence'
import PreviewActions from './PreviewActions'
import { CopyButton } from '@/components/shared/CopyButton'
import KnowledgeMetadata from '@/components/knowledge/shared/KnowledgeMetadata'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })

interface BookmarkPreviewProps {
    knowledge: any
    workspaceId: string
    onClose: () => void
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url
    }
}

export default function BookmarkPreview({ knowledge, workspaceId, onClose }: BookmarkPreviewProps) {
    const qc = useQueryClient()
    const [refetching, setRefetching] = useState(false)
    const url = knowledge.url || ''
    const contentHtml = knowledge.content ? md.render(knowledge.content) : ''

    const handleRefetch = async () => {
        setRefetching(true)
        try {
            await extractBookmarkContent(workspaceId, knowledge.id)
            qc.invalidateQueries({ queryKey: ['knowledge-detail', workspaceId, knowledge.id] })
            qc.invalidateQueries({ queryKey: ['knowledge'] })
        } finally {
            setRefetching(false)
        }
    }

    const btnClass = 'p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors'

    return (
        <PreviewShell
            isOpen
            onClose={onClose}
            title={knowledge.title || knowledge.url_title || knowledge.ai_title || 'Bookmark'}
            actions={
                <>
                    {url && (
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={btnClass}
                            aria-label="Open Link"
                            title="Open Link"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={handleRefetch}
                        disabled={refetching}
                        className={`${btnClass} disabled:opacity-50`}
                        aria-label="Re-fetch"
                        title="Re-fetch"
                    >
                        {refetching ? (
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
        >
            <div className="space-y-5">
                {/* URL banner */}
                {url && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 rounded-xl border border-border/60 bg-muted/25 px-4 py-3 hover:bg-muted/40 hover:border-accent/40 transition-colors"
                    >
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 shrink-0">
                            <Globe className="w-4.5 h-4.5 text-purple-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-purple-400 uppercase tracking-wider mb-0.5">
                                {extractDomain(url)}
                            </p>
                            <p className="text-[13px] text-foreground/70 truncate group-hover:text-foreground/90 transition-colors">
                                {url}
                            </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors shrink-0" />
                    </a>
                )}

                {/* Page title from URL (if different from user title) */}
                {knowledge.url_title && knowledge.url_title !== knowledge.title && (
                    <p className="text-sm font-medium text-foreground">{knowledge.url_title}</p>
                )}

                {/* Archived/extracted content */}
                {contentHtml && (
                    <div className="relative pt-4 border-t border-border/30">
                        <CopyButton
                            content={knowledge.content}
                            iconOnly
                            className="absolute top-4 right-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                        />
                        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                            Extracted Content
                        </h3>
                        <div
                            className="prose prose-sm prose-invert max-w-none text-foreground/85 leading-relaxed pr-8"
                            dangerouslySetInnerHTML={{ __html: contentHtml }}
                        />
                    </div>
                )}

            </div>
        </PreviewShell>
    )
}
