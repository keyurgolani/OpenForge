import { useState } from 'react'
import { cn } from '@/lib/utils'
import { OpenForgeImportSubTab } from './import/OpenForgeImportSubTab'
import { BookmarkImportSubTab } from './import/BookmarkImportSubTab'
import ExportTab from './ExportTab'

type DataSection = 'openforge-import' | 'bookmarks-import' | 'export'

interface CategoryGroup {
  label: string
  items: { id: DataSection; label: string }[]
}

const CATEGORIES: CategoryGroup[] = [
  {
    label: 'Import',
    items: [
      { id: 'openforge-import', label: 'OpenForge Data' },
      { id: 'bookmarks-import', label: 'Bookmarks' },
    ],
  },
  {
    label: 'Export',
    items: [
      { id: 'export', label: 'OpenForge Data' },
    ],
  },
]

export function DataPage() {
  const [selected, setSelected] = useState<DataSection>('openforge-import')

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-56 flex-shrink-0 border-r border-border/25 overflow-y-auto p-4 space-y-4">
        {CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1">
              {cat.label}
            </div>
            <div className="space-y-0.5">
              {cat.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                    selected === item.id
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        {selected === 'openforge-import' && <OpenForgeImportSubTab />}
        {selected === 'bookmarks-import' && <BookmarkImportSubTab />}
        {selected === 'export' && <ExportTab />}
      </div>
    </div>
  )
}

export default DataPage
