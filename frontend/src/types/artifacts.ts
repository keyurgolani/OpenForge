/**
 * Artifact domain types
 */

import type { ArtifactType } from './common';

export type ArtifactStatus = 'draft' | 'published' | 'archived' | 'deleted';

export interface Artifact {
  id: string;
  artifact_type: ArtifactType;
  workspace_id: string;
  source_run_id?: string;
  source_mission_id?: string;
  title: string;
  summary?: string;
  content: Record<string, any>;
  metadata: Record<string, any>;
  status: ArtifactStatus;
  version: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface ArtifactCreate {
  artifact_type: ArtifactType;
  workspace_id: string;
  source_run_id?: string;
  source_mission_id?: string;
  title: string;
  summary?: string;
  content?: Record<string, any>;
  metadata?: Record<string, any>;
  status?: ArtifactStatus;
}

export interface ArtifactUpdate {
  title?: string;
  summary?: string;
  content?: Record<string, any>;
  metadata?: Record<string, any>;
  status?: ArtifactStatus;
  version?: number;
}
