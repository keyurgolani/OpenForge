import { useWorkspaces } from '@/hooks/useWorkspace'
import type { ParameterDefinition } from '@/types/deployments'

const KNOWLEDGE_TYPES = ['note', 'fleeting', 'bookmark', 'gist', 'journal', 'image', 'audio', 'pdf', 'document', 'sheet', 'slides'] as const

/** Resolve the effective field type, falling back to name-based detection. */
function resolveFieldType(param: ParameterDefinition): ParameterDefinition['type'] {
  // Explicit non-text types are authoritative
  if (param.type !== 'text') return param.type
  // If it has options, treat as enum regardless of declared type
  if (param.options && param.options.length > 0) return 'enum'
  // Name-based fallbacks for older compiled specs that use type:"text"
  const key = param.name.split('.').pop() ?? param.name
  if (key === 'workspace_id') return 'workspace'
  if (key === 'knowledge_type') return 'knowledge_type'
  return 'text'
}

interface DynamicParameterFormProps {
  schema: ParameterDefinition[]
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
  readOnly?: boolean
}

export default function DynamicParameterForm({
  schema,
  values,
  onChange,
  readOnly = false,
}: DynamicParameterFormProps) {
  const { data: workspaces } = useWorkspaces()

  if (schema.length === 0) return null

  const handleChange = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value })
  }

  const selectClass = "w-full rounded-lg border border-border/25 bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/40"
  const inputClass = selectClass

  return (
    <div className="space-y-4">
      {schema.map((param) => {
        const effectiveType = resolveFieldType(param)
        return (
          <div key={param.name}>
            <label className="block text-sm font-medium text-foreground mb-1">
              {param.label}
              {param.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {param.description && (
              <p className="text-xs text-muted-foreground mb-1.5">{param.description}</p>
            )}

            {effectiveType === 'text' && (
              <input
                type="text"
                value={String(values[param.name] ?? param.default ?? '')}
                onChange={(e) => handleChange(param.name, e.target.value)}
                disabled={readOnly}
                className={inputClass}
              />
            )}

            {effectiveType === 'textarea' && (
              <textarea
                value={String(values[param.name] ?? param.default ?? '')}
                onChange={(e) => handleChange(param.name, e.target.value)}
                disabled={readOnly}
                rows={3}
                className={inputClass + ' resize-y'}
              />
            )}

            {effectiveType === 'number' && (
              <input
                type="number"
                value={values[param.name] !== undefined ? Number(values[param.name]) : (param.default as number ?? '')}
                onChange={(e) => handleChange(param.name, e.target.value ? Number(e.target.value) : undefined)}
                disabled={readOnly}
                className={inputClass}
              />
            )}

            {effectiveType === 'boolean' && (
              <button
                type="button"
                onClick={() => !readOnly && handleChange(param.name, !values[param.name])}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  values[param.name] ?? param.default ? 'bg-emerald-600' : 'bg-border'
                }`}
                disabled={readOnly}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    values[param.name] ?? param.default ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            )}

            {effectiveType === 'enum' && (
              <select
                value={String(values[param.name] ?? param.default ?? '')}
                onChange={(e) => handleChange(param.name, e.target.value)}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">Select...</option>
                {(param.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {effectiveType === 'workspace' && (
              <select
                value={String(values[param.name] ?? param.default ?? '')}
                onChange={(e) => handleChange(param.name, e.target.value)}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">Select workspace...</option>
                {(workspaces as { id: string; name: string }[] ?? []).map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            )}

            {effectiveType === 'knowledge_type' && (
              <select
                value={String(values[param.name] ?? param.default ?? '')}
                onChange={(e) => handleChange(param.name, e.target.value)}
                disabled={readOnly}
                className={selectClass}
              >
                <option value="">Select type...</option>
                {KNOWLEDGE_TYPES.map((kt) => (
                  <option key={kt} value={kt}>{kt}</option>
                ))}
              </select>
            )}
          </div>
        )
      })}
    </div>
  )
}
