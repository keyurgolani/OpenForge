/**
 * Workflow domain types
 */

export type WorkflowStatus = 'draft' | 'active' | 'archived' | 'deleted';
export type WorkflowVersionStatus = 'draft' | 'active' | 'archived' | 'superseded';
export type WorkflowNodeStatus = 'active' | 'disabled' | 'archived';
export type WorkflowEdgeStatus = 'active' | 'disabled' | 'archived';
export type NodeType =
  | 'llm'
  | 'tool'
  | 'router'
  | 'approval'
  | 'artifact'
  | 'delegate_call'
  | 'handoff'
  | 'fanout'
  | 'subworkflow'
  | 'join'
  | 'reduce'
  | 'terminal'
  | 'transform';

export interface WorkflowNode {
  id: string;
  workflow_version_id: string;
  node_key: string;
  node_type: NodeType;
  label: string;
  description?: string | null;
  config: Record<string, unknown>;
  executor_ref?: string | null;
  input_mapping: Record<string, unknown>;
  output_mapping: Record<string, unknown>;
  status: WorkflowNodeStatus;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WorkflowEdge {
  id: string;
  workflow_version_id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: string;
  condition: Record<string, unknown>;
  priority: number;
  label?: string | null;
  status: WorkflowEdgeStatus;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  state_schema: Record<string, unknown>;
  entry_node_id?: string | null;
  entry_node?: WorkflowNode | null;
  default_input_schema: Record<string, unknown>;
  default_output_schema: Record<string, unknown>;
  status: WorkflowVersionStatus | WorkflowStatus;
  change_note?: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WorkflowDefinition {
  id: string;
  workspace_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  current_version_id?: string | null;
  is_system: boolean;
  is_template: boolean;
  template_kind?: string | null;
  template_metadata: Record<string, unknown>;
  current_version?: WorkflowVersion | null;
  version: number;
  entry_node?: string | null;
  state_schema: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  default_input_schema: Record<string, unknown>;
  default_output_schema: Record<string, unknown>;
  status: WorkflowStatus;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface WorkflowNodeCreate {
  id?: string;
  node_key: string;
  node_type: NodeType;
  label: string;
  description?: string | null;
  config?: Record<string, unknown>;
  executor_ref?: string | null;
  input_mapping?: Record<string, unknown>;
  output_mapping?: Record<string, unknown>;
  status?: WorkflowNodeStatus;
}

export interface WorkflowEdgeCreate {
  id?: string;
  from_node_id: string;
  to_node_id: string;
  edge_type?: string;
  condition?: Record<string, unknown>;
  priority?: number;
  label?: string | null;
  status?: WorkflowEdgeStatus;
}

export interface WorkflowVersionCreate {
  state_schema?: Record<string, unknown>;
  entry_node_id?: string | null;
  default_input_schema?: Record<string, unknown>;
  default_output_schema?: Record<string, unknown>;
  status?: WorkflowVersionStatus | WorkflowStatus;
  change_note?: string | null;
  nodes?: WorkflowNodeCreate[];
  edges?: WorkflowEdgeCreate[];
}

export interface WorkflowCreate {
  workspace_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  version?: number;
  entry_node?: string | null;
  state_schema?: Record<string, unknown>;
  nodes?: WorkflowNodeCreate[];
  edges?: WorkflowEdgeCreate[];
  default_input_schema?: Record<string, unknown>;
  default_output_schema?: Record<string, unknown>;
  status?: WorkflowStatus;
  is_system?: boolean;
  is_template?: boolean;
  template_kind?: string | null;
  template_metadata?: Record<string, unknown>;
}

export interface WorkflowUpdate {
  name?: string;
  slug?: string;
  description?: string | null;
  version?: number;
  entry_node?: string | null;
  state_schema?: Record<string, unknown>;
  nodes?: WorkflowNodeCreate[];
  edges?: WorkflowEdgeCreate[];
  default_input_schema?: Record<string, unknown>;
  default_output_schema?: Record<string, unknown>;
  status?: WorkflowStatus;
  current_version_id?: string | null;
  is_system?: boolean;
  is_template?: boolean;
  template_kind?: string | null;
  template_metadata?: Record<string, unknown>;
}
