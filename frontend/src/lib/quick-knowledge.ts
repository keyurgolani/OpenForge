export type QuickKnowledgeType = 'note' | 'fleeting' | 'bookmark' | 'gist' | 'journal' | 'image' | 'audio' | 'pdf' | 'document' | 'sheet' | 'slides'

const QUICK_KNOWLEDGE_EVENT = 'openforge:quick-knowledge:open'

interface QuickKnowledgeEventDetail {
    type: QuickKnowledgeType
}

export function openQuickKnowledge(type: QuickKnowledgeType = 'note') {
    window.dispatchEvent(
        new CustomEvent<QuickKnowledgeEventDetail>(QUICK_KNOWLEDGE_EVENT, { detail: { type } }),
    )
}

export function onQuickKnowledgeOpen(handler: (type: QuickKnowledgeType) => void) {
    const listener = (event: Event) => {
        const custom = event as CustomEvent<QuickKnowledgeEventDetail>
        handler(custom.detail?.type ?? 'note')
    }

    window.addEventListener(QUICK_KNOWLEDGE_EVENT, listener as EventListener)
    return () => window.removeEventListener(QUICK_KNOWLEDGE_EVENT, listener as EventListener)
}

/** Human-readable labels for each knowledge type */
export const KNOWLEDGE_TYPE_LABELS: Record<QuickKnowledgeType, string> = {
    note: 'Note',
    fleeting: 'Fleeting Note',
    bookmark: 'Bookmark',
    gist: 'Code Gist',
    journal: 'Journal',
    image: 'Image',
    audio: 'Audio',
    pdf: 'PDF Document',
    document: 'Document',
    sheet: 'Sheet',
    slides: 'Slides',
}

/** Whether a knowledge type requires file upload (vs text input) */
export const FILE_BASED_TYPES: Set<QuickKnowledgeType> = new Set([
    'image', 'audio', 'pdf', 'document', 'sheet', 'slides',
])

/** MIME accept strings for each file-based knowledge type */
export const ACCEPTED_MIMES: Record<string, string> = {
    image: 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/tiff',
    audio: 'audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/mp4,audio/x-m4a,audio/webm,video/webm',
    pdf: 'application/pdf',
    document: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword',
    sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
    slides: 'application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint',
}
