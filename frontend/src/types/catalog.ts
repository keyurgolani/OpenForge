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
