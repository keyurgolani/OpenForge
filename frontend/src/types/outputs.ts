/**
 * Output domain types
 */

import type { ArtifactType } from './common'

export type OutputStatus = 'draft' | 'active' | 'superseded' | 'archived' | 'failed' | 'deleted'
export type OutputVisibility = 'private' | 'workspace' | 'export_ready' | 'hidden'
export type OutputCreationMode = 'user_created' | 'run_generated' | 'imported' | 'derived'
export type OutputLinkType = 'source' | 'informed_by' | 'derived_from' | 'related'
export type OutputObjectType =
  | 'run'
  | 'profile'
  | 'evidence_packet'
  | 'knowledge'
  | 'entity'
  | 'relationship'
  | 'output'
  | 'artifact'
export type OutputSinkType = 'internal_workspace' | 'knowledge_linked' | 'file_export' | 'external_placeholder'
export type OutputSyncStatus = 'not_published' | 'pending_sync' | 'synced' | 'failed_sync'

export interface OutputVersion {
  id: string
  artifact_id: string
  version_number: number
  content_type: string
  content?: string | null
  structured_payload: Record<string, any>
  summary?: string | null
  change_note?: string | null
  source_run_id?: string | null
  source_evidence_packet_id?: string | null
  status: OutputStatus
  created_by_type?: string | null
  created_by_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface OutputLink {
  id: string
  artifact_id: string
  version_id?: string | null
  link_type: OutputLinkType
  target_type: OutputObjectType
  target_id: string
  label?: string | null
  metadata: Record<string, any>
  created_at?: string
}

export interface OutputSink {
  id: string
  artifact_id: string
  sink_type: OutputSinkType
  sink_state: string
  destination_ref?: string | null
  sync_status: OutputSyncStatus
  metadata: Record<string, any>
  last_synced_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface Output {
  id: string
  artifact_type: ArtifactType
  workspace_id: string
  title: string
  summary?: string | null
  status: OutputStatus
  visibility: OutputVisibility
  creation_mode: OutputCreationMode
  current_version_id?: string | null
  current_version_number: number
  source_run_id?: string | null
  source_profile_id?: string | null
  created_by_type?: string | null
  created_by_id?: string | null
  tags: string[]
  metadata: Record<string, any>
  current_version?: OutputVersion | null
  content: Record<string, any>
  version: number
  created_at?: string
  updated_at?: string
  created_by?: string
  updated_by?: string
}

export interface OutputLineage {
  artifact_id: string
  sources: OutputLink[]
  derivations: OutputLink[]
  related: OutputLink[]
}

export interface OutputDiff {
  artifact_id: string
  from_version_id: string
  to_version_id: string
  from_version_number: number
  to_version_number: number
  content_changed: boolean
  structured_payload_changed: boolean
  summary_changed: boolean
  change_note_changed: boolean
  content_preview: string
}

export interface OutputCreate {
  artifact_type: ArtifactType
  workspace_id?: string
  title: string
  summary?: string
  status?: OutputStatus
  visibility?: OutputVisibility
  creation_mode?: OutputCreationMode
  source_run_id?: string
  source_profile_id?: string
  created_by_type?: string
  created_by_id?: string
  tags?: string[]
  metadata?: Record<string, any>
  body?: string
  structured_payload?: Record<string, any>
  content_type?: string
  change_note?: string
}

export interface OutputUpdate {
  title?: string
  summary?: string
  metadata?: Record<string, any>
  status?: OutputStatus
  visibility?: OutputVisibility
  tags?: string[]
  body?: string
  structured_payload?: Record<string, any>
  content_type?: string
  change_note?: string
  source_evidence_packet_id?: string
}

export interface OutputVersionCreate {
  body?: string
  structured_payload?: Record<string, any>
  content_type?: string
  summary?: string
  change_note?: string
  source_run_id?: string
  source_evidence_packet_id?: string
  status?: OutputStatus
  created_by_type?: string
  created_by_id?: string
}

export interface OutputQueryParams {
  skip?: number
  limit?: number
  workspace_id?: string
  artifact_type?: ArtifactType
  status?: OutputStatus
  visibility?: OutputVisibility
  source_run_id?: string
  created_by_type?: string
  q?: string
}

export interface OutputsResponse {
  outputs: Output[]
  total: number
}

export interface OutputVersionsResponse {
  versions: OutputVersion[]
  total: number
}

export interface OutputSinksResponse {
  sinks: OutputSink[]
  total: number
}

// Backward-compatible aliases
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
}
