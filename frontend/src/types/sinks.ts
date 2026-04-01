/**
 * Sink types — first-class entities defining what happens with agent output values.
 *
 * Each sink type declares its inputs. Users can hardcode default values for any input
 * on the sink definition. Inputs without defaults become wirable ports on the
 * automation graph node at runtime.
 */

export type SinkType = 'article' | 'knowledge_create' | 'knowledge_update' | 'rest_api' | 'notification' | 'log'

export interface Sink {
  id: string
  name: string
  slug: string
  description?: string | null
  sink_type: SinkType
  config: Record<string, any>
  icon?: string | null
  tags: string[]
  created_at?: string
  updated_at?: string
}

export interface SinkCreate {
  name: string
  slug: string
  description?: string
  sink_type: SinkType
  config?: Record<string, any>
  icon?: string
  tags?: string[]
}

export interface SinkUpdate {
  name?: string
  slug?: string
  description?: string
  sink_type?: SinkType
  config?: Record<string, any>
  icon?: string
  tags?: string[]
}

export interface SinksResponse {
  sinks: Sink[]
  total: number
}

export interface SinkQueryParams {
  sink_type?: SinkType
  q?: string
  limit?: number
  offset?: number
}

/** A single input that a sink type requires */
export interface SinkInput {
  key: string
  label: string
  /** Field type for rendering the default value editor. Defaults to 'text'. */
  fieldType?: 'text' | 'textarea' | 'url' | 'select'
  /** Options for select fields */
  options?: string[]
  /** Placeholder text */
  placeholder?: string
}

/** Sink type metadata for UI display */
export interface SinkTypeInfo {
  type: SinkType
  label: string
  description: string
  icon: string
  /** All inputs this sink type requires */
  inputs: SinkInput[]
}

export const SINK_TYPE_INFO: SinkTypeInfo[] = [
  {
    type: 'article',
    label: 'Article',
    description: 'Writes a document to the filesystem',
    icon: 'FileText',
    inputs: [
      { key: 'content', label: 'Content' },
      { key: 'title', label: 'Title' },
      { key: 'output_format', label: 'Output Format', fieldType: 'select', options: ['markdown', 'html', 'text'], placeholder: 'markdown' },
      { key: 'file_path', label: 'File Path', placeholder: '/outputs/{title}.md' },
    ],
  },
  {
    type: 'knowledge_create',
    label: 'Knowledge Create',
    description: 'Creates a new knowledge item in a workspace',
    icon: 'BookPlus',
    inputs: [
      { key: 'content', label: 'Content' },
      { key: 'title', label: 'Title' },
      { key: 'workspace_id', label: 'Workspace' },
      { key: 'knowledge_type', label: 'Knowledge Type', fieldType: 'select', options: ['note', 'bookmark', 'gist', 'document'], placeholder: 'note' },
    ],
  },
  {
    type: 'knowledge_update',
    label: 'Knowledge Update',
    description: 'Updates an existing knowledge item',
    icon: 'BookOpen',
    inputs: [
      { key: 'content', label: 'Content' },
      { key: 'knowledge_id', label: 'Knowledge ID' },
      { key: 'workspace_id', label: 'Workspace' },
    ],
  },
  {
    type: 'rest_api',
    label: 'REST API',
    description: 'Calls an external HTTP endpoint',
    icon: 'Globe',
    inputs: [
      { key: 'body', label: 'Body' },
      { key: 'url', label: 'URL', fieldType: 'url', placeholder: 'https://api.example.com/endpoint' },
      { key: 'method', label: 'HTTP Method', fieldType: 'select', options: ['POST', 'PUT', 'PATCH'], placeholder: 'POST' },
      { key: 'headers', label: 'Headers (JSON)', fieldType: 'textarea', placeholder: '{"Content-Type": "application/json"}' },
    ],
  },
  {
    type: 'notification',
    label: 'Notification',
    description: 'Sends a notification',
    icon: 'Bell',
    inputs: [
      { key: 'message', label: 'Message' },
      { key: 'channel', label: 'Channel', placeholder: 'e.g., email, slack, webhook URL' },
      { key: 'template', label: 'Message Template', fieldType: 'textarea', placeholder: 'Notification: {{message}}' },
    ],
  },
  {
    type: 'log',
    label: 'Log',
    description: 'Records to the run/output history',
    icon: 'ScrollText',
    inputs: [
      { key: 'data', label: 'Data' },
      { key: 'log_level', label: 'Log Level', fieldType: 'select', options: ['info', 'warning', 'error', 'debug'], placeholder: 'info' },
    ],
  },
]

export function getSinkTypeInfo(type: SinkType): SinkTypeInfo | undefined {
  return SINK_TYPE_INFO.find(s => s.type === type)
}

/** Key prefix for hardcoded input values stored in sink.config */
export const INPUT_DEFAULT_PREFIX = 'input_defaults.'

/** Get hardcoded input defaults from sink config */
export function getInputDefaults(config: Record<string, any>): Record<string, string> {
  const defaults: Record<string, string> = {}
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith(INPUT_DEFAULT_PREFIX) && value != null && value !== '') {
      defaults[key.slice(INPUT_DEFAULT_PREFIX.length)] = String(value)
    }
  }
  return defaults
}

/** Filter inputs to exclude those with hardcoded defaults — these become automation node ports */
export function getActiveInputHandles(
  type: SinkType,
  config: Record<string, any>,
): Array<{ key: string; label: string }> {
  const typeInfo = getSinkTypeInfo(type)
  const inputs = typeInfo?.inputs ?? [{ key: 'data', label: 'Data' }]
  const defaults = getInputDefaults(config)
  return inputs.filter(h => !(h.key in defaults))
}
