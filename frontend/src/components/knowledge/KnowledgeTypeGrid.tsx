import {
    FileText, Zap, Bookmark, Code2,
    Image as ImageIcon, Mic, FileType2, Table, Presentation,
} from 'lucide-react'
import type { QuickKnowledgeType } from '@/lib/quick-knowledge'

interface TypeCell {
    type: QuickKnowledgeType
    label: string
    Icon: React.ComponentType<{ className?: string }>
    iconColor: string
    iconBg: string
}

const TYPE_CELLS: TypeCell[] = [
    { type: 'standard',  label: 'Note',         Icon: FileText,      iconColor: 'text-blue-400',    iconBg: 'bg-blue-400/10' },
    { type: 'fleeting',  label: 'Fleeting',      Icon: Zap,           iconColor: 'text-yellow-400',  iconBg: 'bg-yellow-400/10' },
    { type: 'bookmark',  label: 'Bookmark',      Icon: Bookmark,      iconColor: 'text-purple-400',  iconBg: 'bg-purple-400/10' },
    { type: 'gist',      label: 'Gist',          Icon: Code2,         iconColor: 'text-green-400',   iconBg: 'bg-green-400/10' },
    { type: 'image',     label: 'Image',         Icon: ImageIcon,     iconColor: 'text-pink-400',    iconBg: 'bg-pink-400/10' },
    { type: 'audio',     label: 'Audio',         Icon: Mic,           iconColor: 'text-orange-400',  iconBg: 'bg-orange-400/10' },
    { type: 'pdf',       label: 'PDF',           Icon: FileType2,     iconColor: 'text-red-400',     iconBg: 'bg-red-400/10' },
    { type: 'docx',      label: 'Word',          Icon: FileText,      iconColor: 'text-blue-300',    iconBg: 'bg-blue-300/10' },
    { type: 'xlsx',      label: 'Spreadsheet',   Icon: Table,         iconColor: 'text-emerald-400', iconBg: 'bg-emerald-400/10' },
    { type: 'pptx',      label: 'Slides',        Icon: Presentation,  iconColor: 'text-amber-400',   iconBg: 'bg-amber-400/10' },
]

interface KnowledgeTypeGridProps {
    onSelect: (type: QuickKnowledgeType) => void
    compact?: boolean
}

export default function KnowledgeTypeGrid({ onSelect, compact = false }: KnowledgeTypeGridProps) {
    return (
        <div className={`grid gap-2 ${compact ? 'grid-cols-4 sm:grid-cols-5' : 'grid-cols-4 sm:grid-cols-5'}`}>
            {TYPE_CELLS.map(({ type, label, Icon, iconColor, iconBg }) => (
                <button
                    key={type}
                    type="button"
                    onClick={() => onSelect(type)}
                    className="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-accent/40 transition-all focus:outline-none group"
                >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg} border border-white/5`}>
                        <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-tight text-center">
                        {label}
                    </span>
                </button>
            ))}
        </div>
    )
}
