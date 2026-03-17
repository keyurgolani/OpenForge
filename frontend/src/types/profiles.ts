/**
 * Profile domain types
 */

export type ProfileRole = 'assistant' | 'specialist' | 'worker' | 'coordinator' | 'reviewer';
export type ProfileStatus = 'draft' | 'active' | 'archived' | 'deleted';

export interface AgentProfile {
  id: string;
  name: string;
  slug: string;
  description?: string;
  role: ProfileRole;
  system_prompt_ref?: string;
  model_policy_id?: string;
  memory_policy_id?: string;
  safety_policy_id?: string;
  capability_bundle_ids: string[];
  output_contract_id?: string;
  is_system: boolean;
  is_template: boolean;
  status: ProfileStatus;
  icon?: string;
  // Catalog metadata
  tags: string[];
  catalog_metadata: Record<string, unknown>;
  is_featured: boolean;
  is_recommended: boolean;
  sort_priority: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface ProfileCreate {
  name: string;
  slug: string;
  description?: string;
  role: ProfileRole;
  system_prompt_ref?: string;
  model_policy_id?: string;
  memory_policy_id?: string;
  safety_policy_id?: string;
  capability_bundle_ids?: string[];
  output_contract_id?: string;
  is_system?: boolean;
  is_template?: boolean;
  status?: ProfileStatus;
  icon?: string;
}

export interface ProfileUpdate {
  name?: string;
  slug?: string;
  description?: string;
  role?: ProfileRole;
  system_prompt_ref?: string;
  model_policy_id?: string;
  memory_policy_id?: string;
  safety_policy_id?: string;
  capability_bundle_ids?: string[];
  output_contract_id?: string;
  is_system?: boolean;
  is_template?: boolean;
  status?: ProfileStatus;
  icon?: string;
}

export interface CapabilityBundleSummary {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tools_enabled: boolean;
  allowed_tool_categories?: string[] | null;
  blocked_tool_ids: string[];
  tool_overrides: Record<string, string>;
  skill_ids: string[];
  retrieval_enabled: boolean;
  retrieval_limit: number;
  retrieval_score_threshold: number;
  knowledge_scope: string;
}

export interface ProfileValidation {
  profile_id: string;
  is_complete: boolean;
  missing_fields: string[];
  invalid_references: string[];
  warnings: string[];
}

export interface ResolvedProfile {
  profile: AgentProfile;
  capability_bundles: CapabilityBundleSummary[];
  model_policy?: Record<string, unknown> | null;
  memory_policy?: Record<string, unknown> | null;
  safety_policy?: Record<string, unknown> | null;
  output_contract?: Record<string, unknown> | null;
  effective_tools_enabled: boolean;
  effective_allowed_tool_categories?: string[] | null;
  effective_blocked_tool_ids: string[];
  effective_tool_overrides: Record<string, string>;
  effective_skill_ids: string[];
  effective_retrieval_enabled: boolean;
  effective_retrieval_limit: number;
  effective_retrieval_score_threshold: number;
  effective_knowledge_scope: string;
  effective_history_limit: number;
  effective_attachment_support: boolean;
  effective_auto_bookmark_urls: boolean;
  effective_mention_support: boolean;
  effective_default_model?: string | null;
  effective_allow_runtime_override: boolean;
  effective_execution_mode: string;
}
