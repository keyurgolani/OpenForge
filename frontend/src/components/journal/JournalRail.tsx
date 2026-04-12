import { MutableRefObject } from 'react'
import { BookOpen } from 'lucide-react'
import Siderail from '@/components/shared/Siderail'
import { CalendarSection } from './CalendarSection'
import { StatsSection } from './StatsSection'
import { PromptsSection } from './PromptsSection'
import { SearchSection } from './SearchSection'
import type { JournalResponse, DateRange } from './helpers'
import type { JournalComposerHandle } from './JournalComposer'

interface JournalRailProps {
  /** Full journal history. Used by Calendar (dots across all months) and Stats (longest-streak across all time). */
  journals: JournalResponse[]
  /** Journals already filtered by the active date range. Used by Search so matches respect the user's range. */
  filteredJournals: JournalResponse[]
  dateRange: DateRange | null
  onDateRangeChange: (range: DateRange | null) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  onSearchResultClick: (entryKey: string) => void
  composerRef: MutableRefObject<JournalComposerHandle | null>
  rangeIncludesToday: boolean
}

export function JournalRail({
  journals,
  filteredJournals,
  dateRange,
  onDateRangeChange,
  searchQuery,
  onSearchQueryChange,
  onSearchResultClick,
  composerRef,
  rangeIncludesToday,
}: JournalRailProps) {
  return (
    <Siderail
      storageKey="journal-rail-pct"
      collapsedStorageKey="journal-rail-collapsed"
      icon={BookOpen}
      label="Journal"
      defaultPct={28}
    >
      {() => (
        <div className="flex flex-col gap-3 px-3 overflow-y-auto h-full pb-4">
          <CalendarSection journals={journals} dateRange={dateRange} onChange={onDateRangeChange} />
          <StatsSection journals={journals} dateRange={dateRange} />
          <PromptsSection composerRef={composerRef} disabled={!rangeIncludesToday} />
          <SearchSection
            journals={filteredJournals}
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            onResultClick={onSearchResultClick}
          />
        </div>
      )}
    </Siderail>
  )
}
