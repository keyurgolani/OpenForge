/**
 * Run domain types
 */

import type { ExecutionStatus } from './common';

export type RunType = 'workflow' | 'mission' | 'step';

export interface Run {
  id: string;
  run_type: RunType;
  workflow_id?: string;
  mission_id?: string;
  parent_run_id?: string;
  workspace_id: string;
  status: ExecutionStatus;
  state_snapshot: Record<string, any>;
  input_payload: Record<string, any>;
  output_payload: Record<string, any>;
  error_code?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface RunCreate {
  run_type: RunType;
  workflow_id?: string;
  mission_id?: string;
  parent_run_id?: string;
  workspace_id: string;
  input_payload?: Record<string, any>;
}

export interface RunUpdate {
  status?: ExecutionStatus;
  state_snapshot?: Record<string, any>;
  output_payload?: Record<string, any>;
  error_code?: string;
  error_message?: string;
}
