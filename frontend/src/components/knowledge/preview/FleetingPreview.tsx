import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft } from 'lucide-react'
import { updateKnowledge } from '@/lib/api'
import PreviewShell from '@/components/knowledge/shared/PreviewShell'
import KnowledgeIntelligence, { GenerateIntelligenceButton, getIntelligenceCount } from '@/components/knowledge/shared/KnowledgeIntelligence'
import PreviewActions from './PreviewActions'
import KnowledgeMetadata from '@/components/knowledge/shared/KnowledgeMetadata'
import { useWorkspace } from '@/hooks/useWorkspace'

interface FleetingPreviewProps {
    knowledge: any
    workspaceId: string
    onClose: () => void
}

export default function FleetingPreview({ knowledge, workspaceId, onClose }: FleetingPreviewProps) {
    const workspace = useWorkspace(workspaceId)
    const navigate = useNavigate()
    const qc = useQueryClient()
    const [content, setContent] = useState(knowledge.content || '')
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Auto-save on change (debounced 700ms)
    const saveContent = useCallback(
        (value: string) => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(async () => {
                await updateKnowledge(workspaceId, knowledge.id, { content: value })
                qc.invalidateQueries({ queryKey: ['knowledge-detail', workspaceId, knowledge.id] })
                qc.invalidateQueries({ queryKey: ['knowledge'] })
            }, 700)
        },
        [workspaceId, knowledge.id, qc],
    )

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [])

    const handleChange = (value: string) => {
        setContent(value)
        saveContent(value)
    }

    const handleConvertToNote = async () => {
        await updateKnowledge(workspaceId, knowledge.id, { type: 'note' })
        qc.invalidateQueries({ queryKey: ['knowledge'] })
        qc.invalidateQueries({ queryKey: ['knowledge-detail', workspaceId, knowledge.id] })
        onClose()
        navigate(`/w/${workspaceId}/knowledge/${knowledge.id}?edit=1`)
    }

    return (
        <PreviewShell
            isOpen
            onClose={onClose}
            title={knowledge.title || 'Fleeting Note'}
            actions={
                <>
                    <button
                        type="button"
                        onClick={handleConvertToNote}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        aria-label="Convert to Note"
                        title="Convert to Note"
                    >
                        <ArrowRightLeft className="w-4 h-4" />
                    </button>
                    <GenerateIntelligenceButton knowledge={knowledge} workspaceId={workspaceId} />
                    <PreviewActions knowledge={knowledge} workspaceId={workspaceId} onClose={onClose} />
                </>
            }
            leftRail={<KnowledgeMetadata knowledge={knowledge} />}
            siderail={(onCollapse) => <KnowledgeIntelligence knowledge={knowledge} workspaceId={workspaceId} onCollapse={onCollapse} categories={(workspace as any)?.intelligence_categories} />}
            railItemCount={getIntelligenceCount(knowledge, (workspace as any)?.intelligence_categories)}
        >
            <div className="space-y-4">
                {/* Always-editable textarea */}
                <textarea
                    value={content}
                    onChange={(e) => handleChange(e.target.value)}
                    className="w-full min-h-[200px] bg-transparent border border-border/25 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 resize-y"
                    placeholder="Write your thought..."
                    autoFocus
                />
            </div>
        </PreviewShell>
    )
}
