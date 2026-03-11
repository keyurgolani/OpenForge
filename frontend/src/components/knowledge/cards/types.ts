export interface KnowledgeListItem {
    id: string
    type: string
    title: string | null
    ai_title: string | null
    content_preview: string
    tags: string[]
    word_count: number
    is_pinned: boolean
    is_archived: boolean
    embedding_status: string
    insights?: unknown
    insights_count: number | null
    updated_at: string
    created_at: string
    url: string | null
    url_title: string | null
    gist_language: string | null
    file_path: string | null
    file_size: number | null
    mime_type: string | null
    thumbnail_path: string | null
    file_metadata: Record<string, unknown> | null
}
