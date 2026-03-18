export type CatalogItemType = 'profile' | 'workflow' | 'mission';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type SetupComplexity = 'minimal' | 'moderate' | 'complex';

export interface CatalogItem {
  id: string;
  catalog_type: CatalogItemType;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  tags: string[];
  is_featured: boolean;
  is_recommended: boolean;
  sort_priority: number;
  difficulty_level: DifficultyLevel | null;
  setup_complexity: SetupComplexity | null;
  autonomy_level: string | null;
  recommended_use_cases: string[];
  expected_outputs: string[];
  example_inputs: string[];
  clone_behavior: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface CatalogListResponse {
  items: CatalogItem[];
  total: number;
}

export interface CatalogReadinessResponse {
  catalog_type: CatalogItemType;
  item_id: string;
  is_ready: boolean;
  missing_dependencies: string[];
  setup_requirements: string[];
  warnings: string[];
}

export interface CatalogQueryParams {
  catalog_type?: CatalogItemType;
  is_featured?: boolean;
  tags?: string[];
  skip?: number;
  limit?: number;
}

export interface DependencyNode {
  role: string
  template_id: string
  template_name: string | null
  template_description: string | null
  catalog_type: CatalogItemType
  missing: boolean
  circular: boolean
  depth_limit_reached?: boolean
  node_label?: string | null
  node_type?: string | null
  config_key?: string | null
  children: DependencyNode[]
}

export interface DependencyTree {
  root: {
    id: string
    catalog_type: CatalogItemType
    name: string
    description: string
  }
  dependencies: DependencyNode[]
}

export interface DependencyResolution {
  template_id: string
  catalog_type: string
  resolution: 'clone' | 'existing'
  existing_id?: string
  overrides?: Record<string, any>
}

export interface UnifiedCloneRequest {
  root_template_id: string
  root_catalog_type: string
  overrides: Record<string, any>
  dependency_resolutions: DependencyResolution[]
}

export interface UnifiedCloneResponse {
  cloned_entity: Record<string, any>
  cloned_dependencies: Array<{ template_id: string; cloned_id: string; catalog_type: string }>
  reused_dependencies: Array<{ template_id: string; existing_id: string; catalog_type: string }>
}
