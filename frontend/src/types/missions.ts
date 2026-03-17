/**
 * Mission domain types
 */

import type { ExecutionMode } from './common';

export type MissionStatus = 'draft' | 'active' | 'paused' | 'disabled' | 'failed' | 'archived';
export type MissionHealthStatus = 'healthy' | 'degraded' | 'failing' | 'unknown';

export interface MissionDefinition {
  id: string;
  name: string;
  slug: string;
  description?: string;
  workspace_id: string;
  workflow_id: string;
  workflow_version_id?: string;
  default_profile_ids: string[];
  default_trigger_ids: string[];
  autonomy_mode: ExecutionMode;
  approval_policy_id?: string;
  budget_policy_id?: string;
  output_artifact_types: string[];
  status: MissionStatus;
  is_system: boolean;
  is_template: boolean;
  recommended_use_case?: string;
  // Catalog metadata
  tags: string[];
  catalog_metadata: Record<string, unknown>;
  is_featured: boolean;
  is_recommended: boolean;
  sort_priority: number;
  icon?: string;
  last_run_at?: string;
  last_success_at?: string;
  last_failure_at?: string;
  last_triggered_at?: string;
  health_status?: MissionHealthStatus;
  last_error_summary?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface MissionCreate {
  name: string;
  slug: string;
  description?: string;
  workspace_id: string;
  workflow_id: string;
  workflow_version_id?: string;
  default_profile_ids?: string[];
  default_trigger_ids?: string[];
  autonomy_mode?: ExecutionMode;
  approval_policy_id?: string;
  budget_policy_id?: string;
  output_artifact_types?: string[];
  status?: MissionStatus;
  is_system?: boolean;
  is_template?: boolean;
  recommended_use_case?: string;
}

export interface MissionUpdate {
  name?: string;
  slug?: string;
  description?: string;
  workspace_id?: string;
  workflow_id?: string;
  workflow_version_id?: string;
  default_profile_ids?: string[];
  default_trigger_ids?: string[];
  autonomy_mode?: ExecutionMode;
  approval_policy_id?: string;
  budget_policy_id?: string;
  output_artifact_types?: string[];
  status?: MissionStatus;
  is_system?: boolean;
  is_template?: boolean;
  recommended_use_case?: string;
}

export interface MissionHealthSummary {
  mission_id: string;
  health_status: MissionHealthStatus;
  summary: string;
  recent_run_count: number;
  recent_success_count: number;
  recent_failure_count: number;
  success_rate?: number;
  last_run_at?: string;
  last_success_at?: string;
  last_failure_at?: string;
  last_error_summary?: string;
}

export interface MissionDiagnostics {
  mission_id: string;
  budget_policy_id?: string;
  runs_today: number;
  max_runs_per_day?: number;
  concurrent_runs: number;
  max_concurrent_runs?: number;
  budget_exhausted: boolean;
  cooldown_active: boolean;
  cooldown_remaining_seconds?: number;
  trigger_count: number;
  enabled_trigger_count: number;
  last_triggered_at?: string;
  recent_error_count: number;
  last_error_summary?: string;
  repeated_errors: string[];
}
