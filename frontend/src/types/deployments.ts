/**
 * Deployment domain types
 */

export type DeploymentStatus = 'active' | 'paused' | 'torn_down';

export interface Deployment {
  id: string;
  automation_id: string;
  automation_name: string | null;
  workspace_id: string;
  agent_spec_id: string | null;
  deployed_by: string | null;
  input_values: Record<string, unknown>;
  status: DeploymentStatus;
  trigger_id: string | null;
  trigger_type: string | null;
  schedule_expression: string | null;
  interval_seconds: number | null;
  last_run_id: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  torn_down_at: string | null;
}

export interface DeploymentCreate {
  workspace_id: string;
  input_values: Record<string, unknown>;
  schedule_expression?: string;
  interval_seconds?: number;
}

export interface DeploymentListResponse {
  deployments: Deployment[];
  total: number;
}

export interface ParameterDefinition {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'enum';
  label: string;
  description?: string;
  required: boolean;
  default?: unknown;
  options?: string[];
  validation?: Array<{ type: string; value: unknown; message?: string }>;
}

export interface SystemVariableChild {
  name: string;
  description: string;
}

export interface SystemVariable {
  name: string;
  description: string;
  category: string;
  children?: SystemVariableChild[];
}

export interface TemplateReferenceData {
  functions: Array<{
    name: string;
    category: string;
    signature: string;
    description: string;
    example: string;
  }>;
  types: string[];
  syntax: Array<{
    name: string;
    pattern: string;
    description: string;
  }>;
  system_variables?: SystemVariable[];
}
