import type { OutputStatus, OutputVisibility } from '@/types/outputs'
import type { ArtifactType } from '@/types/common'
import { OUTPUT_TYPES } from '@/lib/productVocabulary'
import { getOutputTypeLabel } from '@/features/outputs/meta'

const TYPE_OPTIONS: ArtifactType[] = [
  OUTPUT_TYPES.NOTE,
  OUTPUT_TYPES.SUMMARY,
  OUTPUT_TYPES.REPORT,
  OUTPUT_TYPES.PLAN,
  OUTPUT_TYPES.TARGET,
  OUTPUT_TYPES.RESEARCH_BRIEF,
  OUTPUT_TYPES.DATASET,
  OUTPUT_TYPES.ALERT,
  OUTPUT_TYPES.EXPERIMENT_RESULT,
  OUTPUT_TYPES.GENERIC_DOCUMENT,
]

const STATUS_OPTIONS: OutputStatus[] = ['draft', 'active', 'superseded', 'archived', 'failed', 'deleted']
const VISIBILITY_OPTIONS: OutputVisibility[] = ['private', 'workspace', 'export_ready', 'hidden']

interface OutputFiltersProps {
  search: string
  artifactType: ArtifactType | 'all'
  status: OutputStatus | 'all'
  visibility: OutputVisibility | 'all'
  onSearchChange: (value: string) => void
  onArtifactTypeChange: (value: ArtifactType | 'all') => void
  onStatusChange: (value: OutputStatus | 'all') => void
  onVisibilityChange: (value: OutputVisibility | 'all') => void
}

export function OutputFilters({
  search,
  artifactType,
  status,
  visibility,
  onSearchChange,
  onArtifactTypeChange,
  onStatusChange,
  onVisibilityChange,
}: OutputFiltersProps) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/30 p-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.8fr))]">
      <label className="space-y-2 text-sm">
        <span className="text-muted-foreground">Search</span>
        <input
          className="input w-full"
          value={search}
          placeholder="Search title or summary…"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <label className="space-y-2 text-sm">
        <span className="text-muted-foreground">Type</span>
        <select
          className="input w-full"
          value={artifactType}
          onChange={(event) => onArtifactTypeChange(event.target.value as ArtifactType | 'all')}
        >
          <option value="all">All types</option>
          {TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {getOutputTypeLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        <span className="text-muted-foreground">Status</span>
        <select
          className="input w-full"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as OutputStatus | 'all')}
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        <span className="text-muted-foreground">Visibility</span>
        <select
          className="input w-full"
          value={visibility}
          onChange={(event) => onVisibilityChange(event.target.value as OutputVisibility | 'all')}
        >
          <option value="all">All visibility</option>
          {VISIBILITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** @deprecated Use OutputFilters instead */
export const ArtifactFilters = OutputFilters

export default OutputFilters
