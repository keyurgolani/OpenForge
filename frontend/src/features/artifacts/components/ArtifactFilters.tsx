import type { ArtifactStatus, ArtifactVisibility } from '@/types/artifacts'
import type { ArtifactType } from '@/types/common'
import { ARTIFACT_TYPES } from '@/lib/productVocabulary'
import { getArtifactTypeLabel } from '@/features/artifacts/meta'

const TYPE_OPTIONS: ArtifactType[] = [
  ARTIFACT_TYPES.NOTE,
  ARTIFACT_TYPES.SUMMARY,
  ARTIFACT_TYPES.REPORT,
  ARTIFACT_TYPES.PLAN,
  ARTIFACT_TYPES.TARGET,
  ARTIFACT_TYPES.RESEARCH_BRIEF,
  ARTIFACT_TYPES.DATASET,
  ARTIFACT_TYPES.ALERT,
  ARTIFACT_TYPES.EXPERIMENT_RESULT,
  ARTIFACT_TYPES.GENERIC_DOCUMENT,
]

const STATUS_OPTIONS: ArtifactStatus[] = ['draft', 'active', 'superseded', 'archived', 'failed', 'deleted']
const VISIBILITY_OPTIONS: ArtifactVisibility[] = ['private', 'workspace', 'export_ready', 'hidden']

interface ArtifactFiltersProps {
  search: string
  artifactType: ArtifactType | 'all'
  status: ArtifactStatus | 'all'
  visibility: ArtifactVisibility | 'all'
  onSearchChange: (value: string) => void
  onArtifactTypeChange: (value: ArtifactType | 'all') => void
  onStatusChange: (value: ArtifactStatus | 'all') => void
  onVisibilityChange: (value: ArtifactVisibility | 'all') => void
}

export function ArtifactFilters({
  search,
  artifactType,
  status,
  visibility,
  onSearchChange,
  onArtifactTypeChange,
  onStatusChange,
  onVisibilityChange,
}: ArtifactFiltersProps) {
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
              {getArtifactTypeLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        <span className="text-muted-foreground">Status</span>
        <select
          className="input w-full"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as ArtifactStatus | 'all')}
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
          onChange={(event) => onVisibilityChange(event.target.value as ArtifactVisibility | 'all')}
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

export default ArtifactFilters
