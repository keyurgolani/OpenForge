import { useState, useEffect } from 'react'
import { Archive, Globe2, Image, StickyNote } from 'lucide-react'
import { OpenForgeImportSubTab } from './import/OpenForgeImportSubTab'
import { BookmarkImportSubTab } from './import/BookmarkImportSubTab'

/* ── Types ──────────────────────────────────────────────────────────────── */

type ImportSubTab = 'openforge' | 'bookmarks' | 'images' | 'notes'

const IMPORT_SUB_TABS: Array<{
    id: ImportSubTab
    label: string
    icon: React.ComponentType<{ className?: string }>
    comingSoon?: boolean
}> = [
    { id: 'openforge', label: 'OpenForge', icon: Archive },
    { id: 'bookmarks', label: 'Bookmarks', icon: Globe2 },
    { id: 'images', label: 'Images', icon: Image, comingSoon: true },
    { id: 'notes', label: 'Notes', icon: StickyNote, comingSoon: true },
]

/* ── Component ──────────────────────────────────────────────────────────── */

interface ImportTabProps {
    defaultSubTab?: 'openforge' | 'bookmarks'
}

export default function ImportTab({ defaultSubTab }: ImportTabProps) {
    const [activeSubTab, setActiveSubTab] = useState<ImportSubTab>(defaultSubTab ?? 'openforge')

    useEffect(() => {
        if (defaultSubTab) setActiveSubTab(defaultSubTab)
    }, [defaultSubTab])

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-5">
            {/* Sub-tab navigation */}
            <div className="flex shrink-0 gap-2 p-1.5 glass-card w-fit rounded-2xl overflow-x-auto min-h-[48px]">
                {IMPORT_SUB_TABS.map(tab => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className={`flex min-h-8 items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeSubTab === tab.id
                                ? 'bg-accent/25 text-accent shadow-glass-inset ring-1 ring-accent/30'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            {tab.comingSoon && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border/25 uppercase tracking-wide font-medium">
                                    Soon
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Content area */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {activeSubTab === 'openforge' && <OpenForgeImportSubTab />}
                {activeSubTab === 'bookmarks' && <BookmarkImportSubTab />}
                {activeSubTab === 'images' && <ComingSoonCard title="Image Import" description="Bulk-import images from a folder or ZIP archive." icon={Image} />}
                {activeSubTab === 'notes' && <ComingSoonCard title="Notes Import" description="Import markdown or plain-text notes." icon={StickyNote} />}
            </div>
        </div>
    )
}

/* ── Coming Soon placeholder ────────────────────────────────────────────── */

function ComingSoonCard({ title, description, icon: Icon }: {
    title: string
    description: string
    icon: React.ComponentType<{ className?: string }>
}) {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-semibold text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>

            <div className="glass-card px-6 py-10 rounded-xl border-border/20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-muted/30 border border-border/20 flex items-center justify-center text-muted-foreground mx-auto mb-4">
                    <Icon className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Coming Soon</p>
                <p className="text-xs text-muted-foreground/70 max-w-sm mx-auto">
                    This import type is not yet available. It will be added in a future update.
                </p>
            </div>
        </div>
    )
}
