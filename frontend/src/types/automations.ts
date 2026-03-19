/**
 * Automation domain types
 */

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'disabled' | 'archived';

export interface Automation {
  id: string;
  agent_id: string;
  name: string;
  slug: string;
  description: string | null;
  active_spec_id: string | null;
  trigger_config: Record<string, unknown>;
  budget_config: Record<string, unknown>;
  output_config: Record<string, unknown>;
  status: AutomationStatus;
  icon: string | null;
  is_template: boolean;
  is_system: boolean;
  tags: string[];
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_triggered_at: string | null;
  health_status: string;
  last_error_summary: string | null;
  compilation_status: string;
  compilation_error: string | null;
  last_compiled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationCreate {
  agent_id: string;
  name: string;
  slug: string;
  description?: string;
  trigger_config?: Record<string, unknown>;
  budget_config?: Record<string, unknown>;
  output_config?: Record<string, unknown>;
  status?: AutomationStatus;
  icon?: string;
  is_template?: boolean;
  tags?: string[];
}

export interface AutomationUpdate extends Partial<AutomationCreate> {}

export interface AutomationListResponse {
  automations: Automation[];
  total: number;
}

export interface AutomationRunRequest {
  input_payload: Record<string, unknown>;
  workspace_id: string;
}

export interface AutomationRunResponse {
  run_id: string;
  automation_id: string;
  status: string;
}
