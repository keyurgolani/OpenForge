import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
    type QuickKnowledgeType,
    KNOWLEDGE_TYPE_LABELS,
    FILE_BASED_TYPES,
    openQuickKnowledge,
} from '@/lib/quick-knowledge'
import {
    FileText, Zap, Bookmark, Code2,
    Image as ImageIcon, Music, FileType2, Table, Presentation, X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import FileUploadModal from './create/FileUploadModal'

interface KnowledgeCreateDispatcherProps {
    open: boolean
    onClose: () => void
    onCreated?: (knowledge: any) => void
}

const TYPE_OPTIONS: {
    type: QuickKnowledgeType
    icon: React.ComponentType<{ className?: string }>
    color: string
    group: string
}[] = [
    { type: 'standard', icon: FileText, color: 'text-blue-400', group: 'Text' },
    { type: 'fleeting', icon: Zap, color: 'text-yellow-400', group: 'Text' },
    { type: 'bookmark', icon: Bookmark, color: 'text-purple-400', group: 'Text' },
    { type: 'gist', icon: Code2, color: 'text-green-400', group: 'Text' },
    { type: 'image', icon: ImageIcon, color: 'text-pink-400', group: 'File Upload' },
    { type: 'audio', icon: Music, color: 'text-orange-400', group: 'File Upload' },
    { type: 'pdf', icon: FileType2, color: 'text-red-400', group: 'File Upload' },
    { type: 'docx', icon: FileText, color: 'text-blue-300', group: 'File Upload' },
    { type: 'xlsx', icon: Table, color: 'text-green-300', group: 'File Upload' },
    { type: 'pptx', icon: Presentation, color: 'text-amber-400', group: 'File Upload' },
]

const GROUP_ORDER = ['Text', 'File Upload']

export default function KnowledgeCreateDispatcher({
    open,
    onClose,
    onCreated,
}: KnowledgeCreateDispatcherProps) {
    const { workspaceId } = useParams<{ workspaceId: string }>()
    const navigate = useNavigate()
    const [uploadType, setUploadType] = useState<QuickKnowledgeType | null>(null)

    const handleTypeSelect = (type: QuickKnowledgeType) => {
        if (FILE_BASED_TYPES.has(type)) {
            setUploadType(type)
        } else {
            // Open QuickKnowledgePanel for text types
            openQuickKnowledge(type)
            onClose()
        }
    }

    const handleUploadSuccess = (knowledge: any) => {
        setUploadType(null)
        onClose()
        onCreated?.(knowledge)
        if (workspaceId) {
            navigate(`/w/${workspaceId}/knowledge/${knowledge.id}`)
        }
    }

    const handleUploadClose = () => {
        setUploadType(null)
    }

    const groups = GROUP_ORDER.map(g => ({
        name: g,
        options: TYPE_OPTIONS.filter(o => o.group === g),
    }))

    return (
        <>
            <AnimatePresence>
                {open && !uploadType && (
                    <>
                        <motion.div
                            key="backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md"
                            onClick={onClose}
                        />
                        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4">
                            <motion.div
                                key="dialog"
                                initial={{ scale: 0.92, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.92, opacity: 0, y: 20 }}
                                transition={{ type: 'spring', damping: 22, stiffness: 300, mass: 0.8 }}
                                className="pointer-events-auto w-full max-w-sm bg-card border border-white/10 rounded-2xl shadow-glass-lg overflow-hidden"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

                                <div className="p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm font-semibold">Create Knowledge</h2>
                                        <button className="btn-ghost p-1.5" onClick={onClose}>
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {groups.map(({ name, options }) => (
                                        <div key={name} className="space-y-1.5">
                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium px-0.5">
                                                {name}
                                            </p>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {options.map(opt => {
                                                    const Icon = opt.icon
                                                    return (
                                                        <button
                                                            key={opt.type}
                                                            className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-left transition-all hover:border-accent/40 hover:bg-muted/40 focus:outline-none"
                                                            onClick={() => handleTypeSelect(opt.type)}
                                                        >
                                                            <Icon className={`w-4 h-4 flex-shrink-0 ${opt.color}`} />
                                                            <span className="text-xs font-medium truncate">
                                                                {KNOWLEDGE_TYPE_LABELS[opt.type]}
                                                            </span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>

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
