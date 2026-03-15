import MarkdownIt from 'markdown-it'

import type {
    EvidencePacketResponse,
    RetrievalReadResult,
    RetrievalSearchQuery,
    RetrievalSearchResult,
} from './types'

const md = new MarkdownIt({ html: false, linkify: false, breaks: true })

function renderMarkdown(text: string) {
    return { __html: md.render(text || '') }
}

function formatReasonCode(reason: string) {
    return reason.split('_').join(' ')
}

interface EvidencePacketPanelProps {
    query: RetrievalSearchQuery | null
    activeResult: RetrievalSearchResult | null
    readResult: RetrievalReadResult | null
    evidence: EvidencePacketResponse | null
    loading: boolean
    buildingEvidence: boolean
    onBuildEvidence: () => void
}

export default function EvidencePacketPanel({
    query,
    activeResult,
    readResult,
    evidence,
    loading,
    buildingEvidence,
    onBuildEvidence,
}: EvidencePacketPanelProps) {
    return (
        <aside className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm min-h-[18rem] p-4 lg:p-5 space-y-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80">Retrieval Trace</p>
                        <h2 className="text-base font-semibold text-foreground">Search / Read / Evidence</h2>
                    </div>
                    {query && (
                        <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                            {query.id.slice(0, 8)}
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    {query
                        ? `Strategy: ${query.search_strategy}. Inspect what was searched, opened, and turned into evidence.`
                        : 'Run a search to inspect retrieval lineage and evidence assembly.'}
                </p>
            </div>

            {query && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Query</p>
                    <p className="text-sm text-foreground">{query.query_text}</p>
                    <p className="text-[11px] text-muted-foreground">Normalized: {query.normalized_query}</p>
                </div>
            )}

            {!activeResult && !loading && (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                    Pick `Trace` on a result card to inspect the explicit read path.
                </div>
            )}

            {loading && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
                    Reading selected result and expanding parent context…
                </div>
            )}

            {activeResult && readResult && !loading && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-medium text-foreground">{activeResult.title}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    #{activeResult.rank_position} · {Math.round(activeResult.score * 100)}% · {activeResult.strategy}
                                </p>
                            </div>
                            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {activeResult.source_type}
                            </span>
                        </div>
                        {activeResult.header_path && (
                            <p className="text-[11px] text-muted-foreground">{activeResult.header_path}</p>
                        )}
                        {readResult.selection_reason_codes.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {readResult.selection_reason_codes.map(reason => (
                                    <span key={reason} className="rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-medium">
                                        {formatReasonCode(reason)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Read Excerpt</p>
                        <div
                            className="rounded-xl border border-border/50 bg-background/70 p-3 text-sm text-foreground/90 markdown-content"
                            dangerouslySetInnerHTML={renderMarkdown(readResult.excerpt)}
                        />
                    </div>

                    {readResult.parent_excerpt && (
                        <div className="space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Parent Context</p>
                            <div
                                className="rounded-xl border border-border/50 bg-muted/10 p-3 text-xs text-foreground/80 markdown-content"
                                dangerouslySetInnerHTML={renderMarkdown(readResult.parent_excerpt)}
                            />
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                        <button
                            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                            onClick={onBuildEvidence}
                            disabled={buildingEvidence}
                        >
                            {buildingEvidence ? 'Building…' : 'Build Evidence Packet'}
                        </button>
                        {readResult.citation && (
                            <p className="text-[11px] text-muted-foreground">
                                Citation bounds: {readResult.citation.start}-{readResult.citation.end}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {evidence && (
                <div className="space-y-3 rounded-xl border border-border/50 bg-accent/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-accent/80">Evidence Packet</p>
                            <p className="text-sm font-medium text-foreground">{evidence.packet.summary || 'Packet ready'}</p>
                        </div>
                        <span className="rounded-full border border-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                            {evidence.packet.item_count} item{evidence.packet.item_count === 1 ? '' : 's'}
                        </span>
                    </div>
                    {evidence.packet.items.map(item => (
                        <div key={item.id} className="rounded-lg border border-border/40 bg-background/70 p-3 space-y-2">
                            <p className="text-xs font-medium text-foreground">{item.title}</p>
                            <div
                                className="text-xs text-foreground/80 markdown-content"
                                dangerouslySetInnerHTML={renderMarkdown(item.excerpt)}
                            />
                            {item.selection_reason_codes.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {item.selection_reason_codes.map(reason => (
                                        <span key={reason} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                            {formatReasonCode(reason)}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </aside>
    )
}
