import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Diamond } from 'lucide-react'

export interface ConstantNodeData {
  value: unknown
  fieldType: 'text' | 'number' | 'boolean' | 'select' | 'workspace'
  options?: string[]
  workspaces?: Array<{ id: string; name: string }>
  nodeKey: string
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'text',
  number: 'number',
  boolean: 'bool',
  select: 'enum',
  workspace: 'workspace',
}

function ConstantNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as ConstantNodeData
  const { setNodes } = useReactFlow()

  const updateValue = useCallback(
    (newValue: unknown) => {
      setNodes(nds =>
        nds.map(n =>
          n.id === id ? { ...n, data: { ...n.data, value: newValue } } : n,
        ),
      )
    },
    [id, setNodes],
  )

  const fieldType = nodeData.fieldType ?? 'text'
  const label = FIELD_TYPE_LABELS[fieldType] ?? 'text'

  return (
    <div
      className={`rounded-lg border bg-card/90 shadow-md backdrop-blur-sm min-w-[140px] max-w-[180px] ${
        selected ? 'border-violet-400 ring-1 ring-violet-400/30' : 'border-border/25'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-violet-400/25 bg-violet-500/5 rounded-t-lg">
        <Diamond className="w-3 h-3 text-violet-400 flex-shrink-0" />
        <span className="text-[10px] font-medium text-foreground leading-tight">Constant</span>
        <span className="text-[9px] text-violet-300/70 ml-auto font-mono">{label}</span>
      </div>

      {/* Body — inline editor */}
      <div className="px-2 py-1.5 flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          {fieldType === 'boolean' ? (
            <button
              type="button"
              onClick={() => updateValue(nodeData.value === true || nodeData.value === 'true' ? false : true)}
              className={`w-full text-left rounded-md border px-2 py-1 text-[11px] font-mono transition ${
                nodeData.value === true || nodeData.value === 'true'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-border/25 bg-background/50 text-muted-foreground'
              }`}
            >
              {nodeData.value === true || nodeData.value === 'true' ? 'true' : 'false'}
            </button>
          ) : fieldType === 'select' && nodeData.options ? (
            <select
              value={String(nodeData.value ?? '')}
              onChange={e => updateValue(e.target.value)}
              className="w-full rounded-md border border-border/25 bg-background/50 px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:border-violet-400/40 nodrag"
            >
              <option value="">Select...</option>
              {nodeData.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : fieldType === 'workspace' && nodeData.workspaces ? (
            <select
              value={String(nodeData.value ?? '')}
              onChange={e => updateValue(e.target.value)}
              className="w-full rounded-md border border-border/25 bg-background/50 px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:border-violet-400/40 nodrag"
            >
              <option value="">Select workspace...</option>
              {nodeData.workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          ) : (
            <input
              type={fieldType === 'number' ? 'number' : 'text'}
              value={String(nodeData.value ?? '')}
              onChange={e => updateValue(fieldType === 'number' ? Number(e.target.value) : e.target.value)}
              placeholder="value"
              className="w-full rounded-md border border-border/25 bg-background/50 px-1.5 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-violet-400/40 nodrag"
            />
          )}
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id="value"
          className="!w-2 !h-2 !bg-violet-400 !border-violet-600"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        />
      </div>
    </div>
  )
}

export default memo(ConstantNode)
