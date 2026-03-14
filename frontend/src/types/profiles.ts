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
