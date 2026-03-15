/**
 * Run domain types
 */

import type { ExecutionStatus } from './common';

export type RunType = 'workflow' | 'mission' | 'step' | 'subworkflow';

export interface Run {
  id: string;
  run_type: RunType;
  workflow_id?: string | null;
  workflow_version_id?: string | null;
  mission_id?: string | null;
  parent_run_id?: string | null;
  root_run_id?: string | null;
  spawned_by_step_id?: string | null;
  workspace_id: string;
  status: ExecutionStatus;
  state_snapshot: Record<string, unknown>;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  current_node_id?: string | null;
  delegation_mode?: string | null;
  merge_strategy?: string | null;
  join_group_id?: string | null;
  branch_key?: string | null;
  branch_index?: number | null;
  handoff_reason?: string | null;
  composite_metadata: Record<string, unknown>;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RunStep {
  id: string;
  run_id: string;
  node_id?: string | null;
  node_key?: string | null;
  step_index: number;
  status: ExecutionStatus;
  input_snapshot: Record<string, unknown>;
  output_snapshot: Record<string, unknown>;
  delegation_mode?: string | null;
  merge_strategy?: string | null;
  join_group_id?: string | null;
  branch_key?: string | null;
  branch_index?: number | null;
  handoff_reason?: string | null;
  composite_metadata: Record<string, unknown>;
  checkpoint_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  retry_count: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Checkpoint {
  id: string;
  run_id: string;
  step_id?: string | null;
  checkpoint_type: string;
  state_snapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at?: string | null;
}

export interface RuntimeEvent {
  id: string;
  run_id: string;
  step_id?: string | null;
  workflow_id?: string | null;
  workflow_version_id?: string | null;
  node_id?: string | null;
  node_key?: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at?: string | null;
}

export interface RunLineage {
  run_id: string;
  parent_run?: Run | null;
  child_runs: Run[];
  tree: Record<string, unknown>;
  delegation_history: Array<Record<string, unknown>>;
  branch_groups: Array<Record<string, unknown>>;
}

export interface RunCreate {
  run_type: RunType;
  workflow_id?: string | null;
  workflow_version_id?: string | null;
  mission_id?: string | null;
  parent_run_id?: string | null;
  root_run_id?: string | null;
  spawned_by_step_id?: string | null;
  workspace_id: string;
  input_payload?: Record<string, unknown>;
  delegation_mode?: string | null;
  merge_strategy?: string | null;
  join_group_id?: string | null;
  branch_key?: string | null;
  branch_index?: number | null;
  handoff_reason?: string | null;
  composite_metadata?: Record<string, unknown>;
}

export interface RunUpdate {
  status?: ExecutionStatus;
  state_snapshot?: Record<string, unknown>;
  output_payload?: Record<string, unknown>;
  current_node_id?: string | null;
  delegation_mode?: string | null;
  merge_strategy?: string | null;
  join_group_id?: string | null;
  branch_key?: string | null;
  branch_index?: number | null;
  handoff_reason?: string | null;
  composite_metadata?: Record<string, unknown>;
  error_code?: string | null;
  error_message?: string | null;
}

export interface RunCompositeDebug {
  run_id: string;
  delegation_history: Array<Record<string, unknown>>;
  branch_groups: Array<Record<string, unknown>>;
  merge_outcomes: Array<Record<string, unknown>>;
}
