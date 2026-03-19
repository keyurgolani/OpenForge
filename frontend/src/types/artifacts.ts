/**
 * Backward-compatible re-exports from the outputs module.
 * New code should import from '@/types/outputs' directly.
 */

export type {
  OutputStatus as ArtifactStatus,
  OutputVisibility as ArtifactVisibility,
  OutputCreationMode as ArtifactCreationMode,
  OutputLinkType as ArtifactLinkType,
  OutputObjectType as ArtifactObjectType,
  OutputSinkType as ArtifactSinkType,
  OutputSyncStatus as ArtifactSyncStatus,
  OutputVersion as ArtifactVersion,
  OutputLink as ArtifactLink,
  OutputSink as ArtifactSink,
  Output as Artifact,
  OutputLineage as ArtifactLineage,
  OutputDiff as ArtifactDiff,
  OutputCreate as ArtifactCreate,
  OutputUpdate as ArtifactUpdate,
  OutputVersionCreate as ArtifactVersionCreate,
  OutputQueryParams as ArtifactQueryParams,
  OutputsResponse as ArtifactsResponse,
  OutputVersionsResponse as ArtifactVersionsResponse,
  OutputSinksResponse as ArtifactSinksResponse,
} from './outputs'
