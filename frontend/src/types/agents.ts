/**
 * Agent domain types
 */

export type AgentMode = 'interactive' | 'background' | 'hybrid';
export type AgentStatus = 'draft' | 'active' | 'archived';

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  blueprint_md: string;
  active_spec_id: string | null;
  profile_id: string | null;
  mode: AgentMode;
  status: AgentStatus;
  icon: string | null;
  is_template: boolean;
  is_system: boolean;
  tags: string[];
  last_used_at: string | null;
  last_error_at: string | null;
  health_status: string;
  last_error_summary: string | null;
  compilation_status: string;
  compilation_error: string | null;
  last_compiled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentCreate {
  name: string;
  slug: string;
  description?: string;
  blueprint_md?: string;
  mode?: AgentMode;
  status?: string;
  icon?: string;
  is_template?: boolean;
  tags?: string[];
}

export interface AgentUpdate extends Partial<AgentCreate> {}

export interface AgentListResponse {
  agents: Agent[];
  total: number;
}

export interface AgentCompileResponse {
  agent_id: string;
  spec_id: string;
  version: number;
  compilation_status: string;
  compilation_error: string | null;
}

export interface CompiledSpec {
  id: string;
  agent_id: string;
  version: number;
  blueprint_snapshot: Record<string, unknown>;
  resolved_config: Record<string, unknown>;
  profile_id: string | null;
  source_md_hash: string;
  compiler_version: string;
  is_valid: boolean;
  validation_errors: unknown[];
  created_at: string;
}
