import type { ParameterDefinition } from '@/types/deployments'

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
  if (schema.length === 0) return null

  const handleChange = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value })
  }

  return (
    <div className="space-y-4">
      {schema.map((param) => (
        <div key={param.name}>
          <label className="block text-sm font-medium text-foreground mb-1">
            {param.label}
            {param.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {param.description && (
            <p className="text-xs text-muted-foreground mb-1.5">{param.description}</p>
          )}

          {param.type === 'text' && (
            <input
              type="text"
              value={String(values[param.name] ?? param.default ?? '')}
              onChange={(e) => handleChange(param.name, e.target.value)}
              disabled={readOnly}
              className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/40"
            />
          )}

          {param.type === 'textarea' && (
            <textarea
              value={String(values[param.name] ?? param.default ?? '')}
              onChange={(e) => handleChange(param.name, e.target.value)}
              disabled={readOnly}
              rows={3}
              className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-foreground resize-y focus:outline-none focus:border-accent/40"
            />
          )}

          {param.type === 'number' && (
            <input
              type="number"
              value={values[param.name] !== undefined ? Number(values[param.name]) : (param.default as number ?? '')}
              onChange={(e) => handleChange(param.name, e.target.value ? Number(e.target.value) : undefined)}
              disabled={readOnly}
              className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/40"
            />
          )}

          {param.type === 'boolean' && (
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

          {param.type === 'enum' && param.options && (
            <select
              value={String(values[param.name] ?? param.default ?? '')}
              onChange={(e) => handleChange(param.name, e.target.value)}
              disabled={readOnly}
              className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/40"
            >
              <option value="">Select...</option>
              {param.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  )
}
