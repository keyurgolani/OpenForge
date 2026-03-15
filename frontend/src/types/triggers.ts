/**
 * Trigger domain types
 */

import type { TriggerType } from './common';

export type TriggerStatus = 'draft' | 'active' | 'archived' | 'deleted';
export type TriggerTargetType = 'mission' | 'workflow';

export interface TriggerDefinition {
  id: string;
  name: string;
  trigger_type: TriggerType;
  target_type: TriggerTargetType;
  target_id: string;
  workspace_id: string;
  description?: string;
  schedule_expression?: string;
  interval_seconds?: number;
  event_type?: string;
  payload_template?: Record<string, any>;
  is_enabled: boolean;
  status: TriggerStatus;
  last_fired_at?: string;
  next_fire_at?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface TriggerCreate {
  name: string;
  trigger_type: TriggerType;
  target_type: TriggerTargetType;
  target_id: string;
  workspace_id: string;
  description?: string;
  schedule_expression?: string;
  interval_seconds?: number;
  event_type?: string;
  payload_template?: Record<string, any>;
  is_enabled?: boolean;
  status?: TriggerStatus;
}

export interface TriggerUpdate {
  name?: string;
  trigger_type?: TriggerType;
  target_type?: TriggerTargetType;
  target_id?: string;
  workspace_id?: string;
  description?: string;
  schedule_expression?: string;
  interval_seconds?: number;
  event_type?: string;
  payload_template?: Record<string, any>;
  is_enabled?: boolean;
  status?: TriggerStatus;
}

export interface TriggerFireRecord {
  id: string;
  trigger_id: string;
  mission_id?: string;
  run_id?: string;
  fired_at: string;
  launch_status: string;
  error_message?: string;
  payload_snapshot?: Record<string, any>;
}

export interface TriggerDiagnostics {
  trigger_id: string;
  is_enabled: boolean;
  status: TriggerStatus;
  trigger_type: TriggerType;
  next_fire_at?: string;
  last_fired_at?: string;
  last_launch_status?: string;
  last_launch_error?: string;
  blocked_reasons: string[];
}
