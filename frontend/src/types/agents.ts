/**
 * Agent definition domain types
 */

export interface LlmConfig {
  provider: string | null;
  model: string | null;
  temperature: number;
  max_tokens: number;
  allow_override: boolean;
}

export interface ToolConfig {
  name: string;
  category: string;
  mode: 'allowed' | 'hitl';
}

export interface MemoryConfig {
  history_limit: number;
  attachment_support: boolean;
  auto_bookmark_urls: boolean;
}

export interface ParameterConfig {
  name: string;
  type: 'text' | 'enum' | 'number' | 'boolean';
  label: string | null;
  description: string | null;
  required: boolean;
  default: unknown;
  options: string[];
}

export interface OutputDefinition {
  key: string;
  type: 'text' | 'json' | 'number' | 'boolean';
  label?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  tags: string[];
  mode: 'interactive' | 'pipeline';
  system_prompt: string;
  llm_config: LlmConfig;
  tools_config: ToolConfig[];
  memory_config: MemoryConfig;
  parameters: ParameterConfig[];
  output_definitions: OutputDefinition[];
  active_version_id: string | null;
  input_schema: ParameterConfig[];
  is_parameterized: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentDefinitionCreate {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  tags?: string[];
  mode?: 'interactive' | 'pipeline';
  system_prompt?: string;
  llm_config?: Partial<LlmConfig>;
  tools_config?: ToolConfig[];
  memory_config?: Partial<MemoryConfig>;
  parameters?: ParameterConfig[];
  output_definitions?: OutputDefinition[];
}

export interface AgentDefinitionUpdate extends Partial<AgentDefinitionCreate> {}

export interface AgentDefinitionListResponse {
  agents: AgentDefinition[];
  total: number;
}

export interface AgentDefinitionVersion {
  id: string;
  agent_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export interface AgentDefinitionVersionListResponse {
  versions: AgentDefinitionVersion[];
  total: number;
}

// Backward compat aliases
export type Agent = AgentDefinition;
export type AgentCreate = AgentDefinitionCreate;
export type AgentUpdate = AgentDefinitionUpdate;
export type AgentListResponse = AgentDefinitionListResponse;
