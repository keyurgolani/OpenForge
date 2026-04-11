import { useMemo } from 'react'
import { Clock } from 'lucide-react'
import PreviewShell from '@/components/knowledge/shared/PreviewShell'
import KnowledgeIntelligence, { GenerateIntelligenceButton, getIntelligenceCount } from '@/components/knowledge/shared/KnowledgeIntelligence'
import PreviewActions from './PreviewActions'
import KnowledgeMetadata from '@/components/knowledge/shared/KnowledgeMetadata'
import { useWorkspace } from '@/hooks/useWorkspace'

interface JournalEntry {
    timestamp: string
    body: string
}

interface JournalPreviewProps {
    knowledge: any
    workspaceId: string
    onClose: () => void
}

function formatTime(timestamp: string): string {
    try {
        const d = new Date(timestamp)
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    } catch {
        return ''
    }
}

export default function JournalPreview({ knowledge, workspaceId, onClose }: JournalPreviewProps) {
    const workspace = useWorkspace(workspaceId)
    const content = knowledge.content || ''

    const entries: JournalEntry[] = useMemo(() => {
        try {
            const parsed = JSON.parse(content)
            return Array.isArray(parsed?.entries) ? parsed.entries : []
        } catch {
            return []
        }
    }, [content])

    return (
        <PreviewShell
            isOpen
            onClose={onClose}
            title={knowledge.title || 'Journal'}
            actions={
                <>
                    <GenerateIntelligenceButton knowledge={knowledge} workspaceId={workspaceId} />
                    <PreviewActions knowledge={knowledge} workspaceId={workspaceId} onClose={onClose} />
                </>
            }
            leftRail={<KnowledgeMetadata knowledge={knowledge} />}
            siderail={(onCollapse) => <KnowledgeIntelligence knowledge={knowledge} workspaceId={workspaceId} onCollapse={onCollapse} categories={(workspace as any)?.intelligence_categories} />}
            railItemCount={getIntelligenceCount(knowledge, (workspace as any)?.intelligence_categories)}
        >
            <div className="space-y-4">
                {entries.length > 0 ? (
                    entries.map((entry, i) => (
                        <div
                            key={i}
                            className="rounded-lg border border-border/25 bg-muted/10 p-4 space-y-2"
                        >
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{formatTime(entry.timestamp)}</span>
                            </div>
                            <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
                                {entry.body}
                            </p>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground italic">No journal entries yet.</p>
                )}
            </div>
        </PreviewShell>
    )
}
