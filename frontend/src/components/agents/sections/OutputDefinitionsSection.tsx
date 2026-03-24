import { FileOutput, Plus, Trash2 } from 'lucide-react'
import AccordionSection from './AccordionSection'
import type { OutputDefinition } from '@/types/agents'

const OUTPUT_TYPES: OutputDefinition['type'][] = [
  'text',
  'json',
  'number',
  'boolean',
]

interface OutputDefinitionsSectionProps {
  value: OutputDefinition[]
  onChange: (outputs: OutputDefinition[]) => void
  isEditing: boolean
}

export default function OutputDefinitionsSection({
  value,
  onChange,
  isEditing,
}: OutputDefinitionsSectionProps) {
  const summary =
    value.length > 0 ? `${value.length} output${value.length === 1 ? '' : 's'}` : 'None'

  const addRow = () => {
    onChange([
      ...value,
      { key: '', type: 'text', label: '', description: '' },
    ])
  }

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, patch: Partial<OutputDefinition>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <AccordionSection
      title="Outputs"
      summary={summary}
      icon={FileOutput}
      isEditing={isEditing}
    >
      {isEditing ? (
        <div className="space-y-3 text-sm">
          {value.map((row, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Output {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="rounded p-0.5 text-muted-foreground/50 hover:text-red-400 transition-colors"
                  title="Remove output"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">
                    Key
                  </label>
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) =>
                      updateRow(index, { key: e.target.value })
                    }
                    placeholder="output_key"
                    className="w-full rounded border border-border/70 bg-background px-2 py-1 text-xs outline-none focus:border-accent/60"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">
                    Type
                  </label>
                  <select
                    value={row.type}
                    onChange={(e) =>
                      updateRow(index, {
                        type: e.target.value as OutputDefinition['type'],
                      })
                    }
                    className="w-full rounded border border-border/70 bg-background px-2 py-1 text-xs outline-none focus:border-accent/60"
                  >
                    {OUTPUT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground">
                  Label
                </label>
                <input
                  type="text"
                  value={row.label ?? ''}
                  onChange={(e) =>
                    updateRow(index, { label: e.target.value })
                  }
                  placeholder="Display label"
                  className="w-full rounded border border-border/70 bg-background px-2 py-1 text-xs outline-none focus:border-accent/60"
                />
              </div>

              <div className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground">
                  Description
                </label>
                <input
                  type="text"
                  value={row.description ?? ''}
                  onChange={(e) =>
                    updateRow(index, { description: e.target.value })
                  }
                  placeholder="Short description"
                  className="w-full rounded border border-border/70 bg-background px-2 py-1 text-xs outline-none focus:border-accent/60"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 py-1.5 text-xs text-muted-foreground hover:border-accent/50 hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add output
          </button>
        </div>
      ) : (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {value.length === 0 ? (
            <div>No outputs defined</div>
          ) : (
            value.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-foreground/70">
                  {row.key || '(empty)'}
                </span>
                <span className="text-muted-foreground/60">{row.type}</span>
                {row.label && (
                  <span className="truncate text-foreground/60">
                    {row.label}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </AccordionSection>
  )
}
