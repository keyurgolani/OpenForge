/**
 * Workflow domain types
 */

export type WorkflowStatus = 'draft' | 'active' | 'archived' | 'deleted';
export type NodeType = 'llm' | 'tool' | 'router' | 'approval' | 'artifact' | 'subworkflow' | 'input' | 'output' | 'transform';

export interface WorkflowNode {
  id: string;
  node_type: NodeType;
  name: string;
  description?: string;
  config: Record<string, any>;
  position_x?: number;
  position_y?: number;
}

export interface WorkflowEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  condition?: Record<string, any>;
  label?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  slug: string;
  description?: string;
  version: number;
  entry_node?: string;
  state_schema: Record<string, any>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  default_input_schema: Record<string, any>;
  default_output_schema: Record<string, any>;
  status: WorkflowStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface WorkflowNodeCreate {
  id: string;
  node_type: NodeType;
  name: string;
  description?: string;
  config?: Record<string, any>;
  position_x?: number;
  position_y?: number;
}

export interface WorkflowEdgeCreate {
  id: string;
  source_node_id: string;
  target_node_id: string;
  condition?: Record<string, any>;
  label?: string;
}

export interface WorkflowCreate {
  name: string;
  slug: string;
  description?: string;
  version?: number;
  entry_node?: string;
  state_schema?: Record<string, any>;
  nodes?: WorkflowNodeCreate[];
  edges?: WorkflowEdgeCreate[];
  default_input_schema?: Record<string, any>;
  default_output_schema?: Record<string, any>;
  status?: WorkflowStatus;
}

export interface WorkflowUpdate {
  name?: string;
  slug?: string;
  description?: string;
  version?: number;
  entry_node?: string;
  state_schema?: Record<string, any>;
  nodes?: WorkflowNodeCreate[];
  edges?: WorkflowEdgeCreate[];
  default_input_schema?: Record<string, any>;
  default_output_schema?: Record<string, any>;
  status?: WorkflowStatus;
}
