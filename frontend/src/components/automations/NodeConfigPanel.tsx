import { useEffect, useRef } from 'react'
import { Bot, X } from 'lucide-react'
import type { AutomationNode } from '@/types/automations'

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
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid closing immediately from the click that opened the modal
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-border/25 bg-background shadow-xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/25">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-foreground">{agentName}</span>
            <span className="text-[10px] font-mono text-muted-foreground">{node.node_key}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent/15 transition">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Inputs */}
          {inputSchema.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Inputs
              </p>
              <div className="space-y-3">
                {inputSchema.map(param => {
                  const isWired = param.name in wiredInputs
                  const wire = wiredInputs[param.name]

                  return (
                    <div key={param.name} className="text-xs">
                      <label className="block font-medium text-foreground mb-0.5">
                        {param.label || param.name}
                        <span className="text-muted-foreground ml-1">({param.type})</span>
                      </label>
                      {param.description && (
                        <p className="text-muted-foreground mb-1">{param.description}</p>
                      )}
                      {isWired ? (
                        <div className="px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
                          Wired from <span className="font-mono">{wire.sourceNodeKey}.{wire.sourceOutputKey}</span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={String(staticInputs[param.name] ?? '')}
                          onChange={(e) => onStaticInputChange(param.name, e.target.value)}
                          placeholder={`Enter ${param.label || param.name}`}
                          className="w-full rounded-md border border-border/25 bg-background/50 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent/40"
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
                    <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="text-foreground">{out.label || out.key}</span>
                    <span className="text-muted-foreground">({out.type})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
