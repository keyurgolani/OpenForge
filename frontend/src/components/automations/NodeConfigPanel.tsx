import { Bot, X } from 'lucide-react'
import type { AutomationNode, AutomationStaticInput } from '@/types/automations'

interface NodeConfigPanelProps {
  node: AutomationNode
  agentName: string
  inputSchema: Array<{ name: string; type: string; label?: string; description?: string }>
  outputDefinitions: Array<{ key: string; type: string; label?: string }>
  wiredInputs: Record<string, { sourceNodeKey: string; sourceOutputKey: string }>
  staticInputs: Record<string, unknown>
  onStaticInputChange: (inputKey: string, value: unknown) => void
  onClose: () => void
}

export default function NodeConfigPanel({
  node,
  agentName,
  inputSchema,
  outputDefinitions,
  wiredInputs,
  staticInputs,
  onStaticInputChange,
  onClose,
}: NodeConfigPanelProps) {
  return (
    <div className="w-72 border-l border-border/25 bg-background/50 overflow-y-auto">
      <div className="flex items-center justify-between p-3 border-b border-border/25">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-foreground">{agentName}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent/15 transition">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-3 space-y-4">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Node Key
          </p>
          <p className="text-xs font-mono text-foreground">{node.node_key}</p>
        </div>

        {/* Inputs */}
        {inputSchema.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Inputs
            </p>
            <div className="space-y-2">
              {inputSchema.map(param => {
                const isWired = param.name in wiredInputs
                const wire = wiredInputs[param.name]

                return (
                  <div key={param.name} className="text-xs">
                    <label className="block font-medium text-foreground mb-0.5">
                      {param.label || param.name}
                    </label>
                    {param.description && (
                      <p className="text-muted-foreground mb-1">{param.description}</p>
                    )}
                    {isWired ? (
                      <div className="px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                        Wired from {wire.sourceNodeKey}.{wire.sourceOutputKey}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={String(staticInputs[param.name] ?? '')}
                        onChange={(e) => onStaticInputChange(param.name, e.target.value)}
                        placeholder={`Enter ${param.label || param.name}`}
                        className="w-full rounded border border-border/25 bg-background/50 px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent/40"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Outputs */}
        {outputDefinitions.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Outputs
            </p>
            <div className="space-y-1">
              {outputDefinitions.map(out => (
                <div key={out.key} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-foreground">{out.label || out.key}</span>
                  <span className="text-muted-foreground">({out.type})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
