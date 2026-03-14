/**
 * Mission domain types
 */

import type { ExecutionMode } from './common';

export type MissionStatus = 'draft' | 'active' | 'archived' | 'deleted';

export interface MissionDefinition {
  id: string;
  name: string;
  slug: string;
  description?: string;
  workflow_id: string;
  default_profile_ids: string[];
  default_trigger_ids: string[];
  autonomy_mode: ExecutionMode;
  approval_policy_id?: string;
  budget_policy_id?: string;
  output_artifact_types: string[];
  status: MissionStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface MissionCreate {
  name: string;
  slug: string;
  description?: string;
  workflow_id: string;
  default_profile_ids?: string[];
  default_trigger_ids?: string[];
  autonomy_mode?: ExecutionMode;
  approval_policy_id?: string;
  budget_policy_id?: string;
  output_artifact_types?: string[];
  status?: MissionStatus;
}

export interface MissionUpdate {
  name?: string;
  slug?: string;
  description?: string;
  workflow_id?: string;
  default_profile_ids?: string[];
  default_trigger_ids?: string[];
  autonomy_mode?: ExecutionMode;
  approval_policy_id?: string;
  budget_policy_id?: string;
  output_artifact_types?: string[];
  status?: MissionStatus;
}
