export interface RetrievalSearchQuery {
    id: string
    workspace_id: string
    conversation_id?: string | null
    run_id?: string | null
    query_text: string
    normalized_query: string
    search_strategy: string
    metadata: Record<string, unknown>
    created_at: string
}

export interface RetrievalSearchResult {
    id: string
    query_id: string
    workspace_id: string
    source_type: string
    source_id: string
    title: string
    knowledge_type?: string | null
    excerpt: string
    header_path?: string | null
    parent_excerpt?: string | null
    score: number
    rank_position: number
    strategy: string
    result_status: string
    selected: boolean
    opened: boolean
    summary_status?: string | null
    selection_reason_codes: string[]
    trust_metadata: Record<string, unknown>
    metadata: Record<string, unknown>
}

export interface RetrievalSearchResponse {
    query: RetrievalSearchQuery
    results: RetrievalSearchResult[]
    total: number
}

export interface RetrievalReadResult {
    result_id: string
    query_id: string
    source_type: string
    source_id: string
    title: string
    content: string
    excerpt: string
    header_path?: string | null
    parent_excerpt?: string | null
    citation?: { start: number; end: number } | null
    selected: boolean
    opened: boolean
    selection_reason_codes: string[]
    metadata: Record<string, unknown>
}

export interface RetrievalReadResponse {
    query_id: string
    results: RetrievalReadResult[]
}

export interface EvidenceItem {
    id: string
    item_type: string
    source_type: string
    source_id: string
    title: string
    excerpt: string
    parent_excerpt?: string | null
    citation?: { start: number; end: number } | null
    selection_reason_codes: string[]
    metadata: Record<string, unknown>
}

export interface EvidencePacket {
    id: string
    workspace_id: string
    query_id?: string | null
    conversation_id?: string | null
    run_id?: string | null
    summary?: string | null
    status: string
    item_count: number
    items: EvidenceItem[]
    metadata: Record<string, unknown>
    created_at: string
}

export interface EvidencePacketResponse {
    packet: EvidencePacket
}

export interface ConversationSummary {
    id: string
    workspace_id: string
    conversation_id: string
    run_id?: string | null
    summary_type: string
    version: number
    summary: string
    recent_messages: Array<Record<string, unknown>>
    metadata: Record<string, unknown>
    created_at: string
}

export interface ConversationSummaryResponse {
    summary: ConversationSummary
}
