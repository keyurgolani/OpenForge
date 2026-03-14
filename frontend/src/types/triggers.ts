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
  schedule_expression?: string;
  payload_template?: Record<string, any>;
  is_enabled: boolean;
  status: TriggerStatus;
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
  schedule_expression?: string;
  payload_template?: Record<string, any>;
  is_enabled?: boolean;
  status?: TriggerStatus;
}

export interface TriggerUpdate {
  name?: string;
  trigger_type?: TriggerType;
  target_type?: TriggerTargetType;
  target_id?: string;
  schedule_expression?: string;
  payload_template?: Record<string, any>;
  is_enabled?: boolean;
  status?: TriggerStatus;
}
