import type { QuickKnowledgeType } from '@/lib/quick-knowledge'
import NoteCreateModal from './NoteCreateModal'
import FleetingCreateModal from './FleetingCreateModal'
import BookmarkCreateModal from './BookmarkCreateModal'
import GistCreateModal from './GistCreateModal'
import ImageCreateModal from './ImageCreateModal'
import AudioCreateModal from './AudioCreateModal'
import PDFCreateModal from './PDFCreateModal'
import DocumentCreateModal from './DocumentCreateModal'
import SheetCreateModal from './SheetCreateModal'
import SlidesCreateModal from './SlidesCreateModal'
import JournalCreateModal from './JournalCreateModal'

interface CreateDispatcherProps {
    type: QuickKnowledgeType
    isOpen: boolean
    onClose: () => void
    workspaceId: string
    onCreated?: (knowledge: any) => void
}

export default function CreateDispatcher({ type, isOpen, onClose, workspaceId, onCreated }: CreateDispatcherProps) {
    const props = { isOpen, onClose, workspaceId, onCreated }

    switch (type) {
        case 'note':
            return <NoteCreateModal {...props} />
        case 'fleeting':
            return <FleetingCreateModal {...props} />
        case 'bookmark':
            return <BookmarkCreateModal {...props} />
        case 'gist':
            return <GistCreateModal {...props} />
        case 'image':
            return <ImageCreateModal {...props} />
        case 'audio':
            return <AudioCreateModal {...props} />
        case 'pdf':
            return <PDFCreateModal {...props} />
        case 'document':
            return <DocumentCreateModal {...props} />
        case 'sheet':
            return <SheetCreateModal {...props} />
        case 'slides':
            return <SlidesCreateModal {...props} />
        case 'journal':
            return <JournalCreateModal {...props} />
        default:
            return <NoteCreateModal {...props} />
    }
}
