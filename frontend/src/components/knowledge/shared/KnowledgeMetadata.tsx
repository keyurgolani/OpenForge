import { format } from 'date-fns'
import {
    FileText, Zap, Bookmark, Code2, Image as ImageIcon, Music,
    FileType2, Table, Presentation, Calendar, Clock, Hash, HardDrive, FileCode,
} from 'lucide-react'
import { formatFileSize } from '@/components/knowledge/cards/shared'

interface KnowledgeMetadataProps {
    knowledge: any
}

const typeConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    note: { icon: FileText, label: 'Note', color: 'text-blue-400' },
    fleeting: { icon: Zap, label: 'Fleeting', color: 'text-yellow-400' },
    bookmark: { icon: Bookmark, label: 'Bookmark', color: 'text-purple-400' },
    gist: { icon: Code2, label: 'Gist', color: 'text-green-400' },
    image: { icon: ImageIcon, label: 'Image', color: 'text-pink-400' },
    audio: { icon: Music, label: 'Audio', color: 'text-violet-400' },
    pdf: { icon: FileType2, label: 'PDF', color: 'text-red-400' },
    document: { icon: FileText, label: 'Document', color: 'text-blue-300' },
    sheet: { icon: Table, label: 'Sheet', color: 'text-emerald-400' },
    slides: { icon: Presentation, label: 'Slides', color: 'text-amber-400' },
}

function MetaRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <Icon className="w-3.5 h-3.5 text-muted-foreground/70 mt-0.5 shrink-0" />
            <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">{label}</div>
                <div className="text-xs text-foreground/90 break-words">{value}</div>
            </div>
        </div>
    )
}

export default function KnowledgeMetadata({ knowledge }: KnowledgeMetadataProps) {
    const type = knowledge.type || 'note'
    const config = typeConfig[type] || typeConfig.note
    const TypeIcon = config.icon
    const meta = knowledge.file_metadata || {}

    const entries: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[] = []

    // Type
    entries.push({ icon: TypeIcon, label: 'Type', value: config.label })

    // Word count
    if (knowledge.word_count) {
        entries.push({ icon: Hash, label: 'Words', value: knowledge.word_count.toLocaleString() })
    }

    // File size
    if (knowledge.file_size) {
        entries.push({ icon: HardDrive, label: 'Size', value: formatFileSize(knowledge.file_size) })
    }

    // MIME type
    if (knowledge.mime_type) {
        entries.push({ icon: FileCode, label: 'Format', value: knowledge.mime_type })
    }

    // Page/slide/sheet counts
    const pageCount = meta.page_count ?? meta.pages ?? meta.num_pages
    if (pageCount != null) {
        entries.push({ icon: FileText, label: 'Pages', value: String(pageCount) })
    }
    const slideCount = meta.slide_count ?? meta.slides ?? meta.num_slides
    if (slideCount != null) {
        entries.push({ icon: Presentation, label: 'Slides', value: String(slideCount) })
    }
    const sheetCount = meta.sheet_count ?? meta.sheets ?? meta.num_sheets
    if (sheetCount != null) {
        entries.push({ icon: Table, label: 'Sheets', value: String(sheetCount) })
    }

    // Gist language
    if (knowledge.gist_language) {
        entries.push({ icon: Code2, label: 'Language', value: knowledge.gist_language })
    }

    // Dates
    if (knowledge.created_at) {
        entries.push({ icon: Calendar, label: 'Created', value: format(new Date(knowledge.created_at), 'MMM d, yyyy') })
    }
    if (knowledge.updated_at) {
        entries.push({ icon: Clock, label: 'Updated', value: format(new Date(knowledge.updated_at), 'MMM d, yyyy') })
    }

    // Tags
    const tags = knowledge.tags || []

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Metadata
            </h3>
            <div className="flex flex-col gap-2.5">
                {entries.map((entry, i) => (
                    <MetaRow key={i} icon={entry.icon} label={entry.label} value={entry.value} />
                ))}
            </div>

            {tags.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                    <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mb-1.5">Tags</div>
                    <div className="flex flex-wrap gap-1">
                        {tags.map((tag: string, i: number) => (
                            <span key={`${tag}-${i}`} className="chip-accent text-[10px] px-2 py-0.5">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
