import type { KnowledgeListItem } from './types'
import { NoteCard } from './NoteCard'
import { FleetingCard } from './FleetingCard'
import { BookmarkCard } from './BookmarkCard'
import { GistCard } from './GistCard'
import { ImageCard } from './ImageCard'
import { FileCard } from './FileCard'

interface KnowledgeCardProps {
    item: KnowledgeListItem
    workspaceId: string
    slim?: boolean
}

/** True when the backend is still extracting content / scraping / embedding */
export function isKnowledgeProcessing(item: KnowledgeListItem): boolean {
    return ['pending', 'processing', 'scraping'].includes(item.embedding_status)
}

export function KnowledgeCard({ item, workspaceId, slim }: KnowledgeCardProps) {
    const processing = isKnowledgeProcessing(item)
    switch (item.type) {
        case 'note':
            return <NoteCard item={item} slim={slim} isProcessing={processing} />
        case 'fleeting':
            return <FleetingCard item={item} slim={slim} isProcessing={processing} />
        case 'bookmark':
            return <BookmarkCard item={item} slim={slim} isProcessing={processing} />
        case 'gist':
            return <GistCard item={item} slim={slim} isProcessing={processing} />
        case 'image':
            return <ImageCard item={item} workspaceId={workspaceId} slim={slim} isProcessing={processing} />
        case 'audio':
        case 'pdf':
        case 'document':
        case 'sheet':
        case 'slides':
            return <FileCard item={item} workspaceId={workspaceId} slim={slim} isProcessing={processing} />
        default:
            return <NoteCard item={item} slim={slim} isProcessing={processing} />
    }
}
