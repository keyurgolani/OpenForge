/**
 * Artifact domain types
 */

import type { ArtifactType } from './common'

export type ArtifactStatus = 'draft' | 'active' | 'superseded' | 'archived' | 'failed' | 'deleted'
export type ArtifactVisibility = 'private' | 'workspace' | 'export_ready' | 'hidden'
export type ArtifactCreationMode = 'user_created' | 'run_generated' | 'mission_generated' | 'imported' | 'derived'
export type ArtifactLinkType = 'source' | 'informed_by' | 'derived_from' | 'related'
export type ArtifactObjectType =
  | 'run'
  | 'workflow'
  | 'mission'
  | 'profile'
  | 'evidence_packet'
  | 'knowledge'
  | 'entity'
  | 'relationship'
  | 'artifact'
export type ArtifactSinkType = 'internal_workspace' | 'knowledge_linked' | 'file_export' | 'external_placeholder'
export type ArtifactSyncStatus = 'not_published' | 'pending_sync' | 'synced' | 'failed_sync'

export interface ArtifactVersion {
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
  status: ArtifactStatus
  created_by_type?: string | null
  created_by_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface ArtifactLink {
  id: string
  artifact_id: string
  version_id?: string | null
  link_type: ArtifactLinkType
  target_type: ArtifactObjectType
  target_id: string
  label?: string | null
  metadata: Record<string, any>
  created_at?: string
}

export interface ArtifactSink {
  id: string
  artifact_id: string
  sink_type: ArtifactSinkType
  sink_state: string
  destination_ref?: string | null
  sync_status: ArtifactSyncStatus
  metadata: Record<string, any>
  last_synced_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface Artifact {
  id: string
  artifact_type: ArtifactType
  workspace_id: string
  title: string
  summary?: string | null
  status: ArtifactStatus
  visibility: ArtifactVisibility
  creation_mode: ArtifactCreationMode
  current_version_id?: string | null
  current_version_number: number
  source_run_id?: string | null
  source_workflow_id?: string | null
  source_mission_id?: string | null
  source_profile_id?: string | null
  created_by_type?: string | null
  created_by_id?: string | null
  tags: string[]
  metadata: Record<string, any>
  current_version?: ArtifactVersion | null
  content: Record<string, any>
  version: number
  created_at?: string
  updated_at?: string
  created_by?: string
  updated_by?: string
}

export interface ArtifactLineage {
  artifact_id: string
  sources: ArtifactLink[]
  derivations: ArtifactLink[]
  related: ArtifactLink[]
}

export interface ArtifactDiff {
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

export interface ArtifactCreate {
  artifact_type: ArtifactType
  workspace_id?: string
  title: string
  summary?: string
  status?: ArtifactStatus
  visibility?: ArtifactVisibility
  creation_mode?: ArtifactCreationMode
  source_run_id?: string
  source_workflow_id?: string
  source_mission_id?: string
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

export interface ArtifactUpdate {
  title?: string
  summary?: string
  metadata?: Record<string, any>
  status?: ArtifactStatus
  visibility?: ArtifactVisibility
  tags?: string[]
  body?: string
  structured_payload?: Record<string, any>
  content_type?: string
  change_note?: string
  source_evidence_packet_id?: string
}

export interface ArtifactVersionCreate {
  body?: string
  structured_payload?: Record<string, any>
  content_type?: string
  summary?: string
  change_note?: string
  source_run_id?: string
  source_evidence_packet_id?: string
  status?: ArtifactStatus
  created_by_type?: string
  created_by_id?: string
}

export interface ArtifactQueryParams {
  skip?: number
  limit?: number
  workspace_id?: string
  artifact_type?: ArtifactType
  status?: ArtifactStatus
  visibility?: ArtifactVisibility
  source_run_id?: string
  source_workflow_id?: string
  source_mission_id?: string
  created_by_type?: string
  q?: string
}

export interface ArtifactsResponse {
  artifacts: Artifact[]
  total: number
}

export interface ArtifactVersionsResponse {
  versions: ArtifactVersion[]
  total: number
}

export interface ArtifactSinksResponse {
  sinks: ArtifactSink[]
  total: number
}
