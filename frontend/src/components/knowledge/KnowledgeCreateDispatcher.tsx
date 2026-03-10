import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createKnowledge } from '@/lib/api'
import {
    type QuickKnowledgeType,
    KNOWLEDGE_TYPE_LABELS,
    FILE_BASED_TYPES,
} from '@/lib/quick-knowledge'
import FileUploadModal from './create/FileUploadModal'

interface KnowledgeCreateDispatcherProps {
    open: boolean
    onClose: () => void
    onCreated?: (knowledge: any) => void
}

const TYPE_OPTIONS: { type: QuickKnowledgeType; icon: string; group: string }[] = [
    // Text types
    { type: 'standard', icon: '📝', group: 'Text' },
    { type: 'fleeting', icon: '💭', group: 'Text' },
    { type: 'bookmark', icon: '🔗', group: 'Text' },
    { type: 'gist', icon: '💻', group: 'Text' },
    // File types
    { type: 'image', icon: '🖼️', group: 'File Upload' },
    { type: 'audio', icon: '🎵', group: 'File Upload' },
    { type: 'pdf', icon: '📄', group: 'File Upload' },
    { type: 'docx', icon: '📝', group: 'File Upload' },
    { type: 'xlsx', icon: '📊', group: 'File Upload' },
    { type: 'pptx', icon: '📑', group: 'File Upload' },
]

export default function KnowledgeCreateDispatcher({
    open,
    onClose,
    onCreated,
}: KnowledgeCreateDispatcherProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const [uploadType, setUploadType] = useState<QuickKnowledgeType | null>(null)

    if (!open) return null

    const handleTypeSelect = async (type: QuickKnowledgeType) => {
        if (FILE_BASED_TYPES.has(type)) {
            setUploadType(type)
        } else {
            // For text-based types, create directly and navigate to editor
            if (!workspaceId) return
            try {
                const knowledge = await createKnowledge(workspaceId, { type })
                onClose()
                onCreated?.(knowledge)
                navigate(`/workspaces/${workspaceId}/knowledge/${knowledge.id}`)
            } catch (err) {
                console.error('Failed to create knowledge:', err)
            }
        }
    }

    const handleUploadSuccess = (knowledge: any) => {
        setUploadType(null)
        onClose()
        onCreated?.(knowledge)
        if (workspaceId) {
            navigate(`/workspaces/${workspaceId}/knowledge/${knowledge.id}`)
        }
    }

    const handleUploadClose = () => {
        setUploadType(null)
    }

    // Group the types
    const groups = TYPE_OPTIONS.reduce<Record<string, typeof TYPE_OPTIONS>>((acc, opt) => {
        if (!acc[opt.group]) acc[opt.group] = []
        acc[opt.group].push(opt)
        return acc
    }, {})

    return (
        <>
            {/* Type Selector Popover */}
            {!uploadType && (
                <div className="knowledge-create-overlay" onClick={onClose}>
                    <div
                        className="knowledge-create-popover"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="knowledge-create-title">Create Knowledge</h3>
                        {Object.entries(groups).map(([groupName, options]) => (
                            <div key={groupName} className="knowledge-create-group">
                                <div className="knowledge-create-group-label">{groupName}</div>
                                <div className="knowledge-create-grid">
                                    {options.map((opt) => (
                                        <button
                                            key={opt.type}
                                            className="knowledge-create-option"
                                            onClick={() => handleTypeSelect(opt.type)}
                                        >
                                            <span className="knowledge-create-option-icon">{opt.icon}</span>
                                            <span className="knowledge-create-option-label">
                                                {KNOWLEDGE_TYPE_LABELS[opt.type]}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* File Upload Modal */}
            {uploadType && (
                <FileUploadModal
                    type={uploadType}
                    open={true}
                    onClose={handleUploadClose}
                    onSuccess={handleUploadSuccess}
                />
            )}
        </>
    )
}
