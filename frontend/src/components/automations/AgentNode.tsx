import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot } from 'lucide-react'

export interface AgentNodeData {
  label: string
  agentId: string
  agentSlug?: string
  inputHandles: Array<{ key: string; label: string }>
  outputHandles: Array<{ key: string; label: string }>
  isSelected?: boolean
}

function AgentNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData
  const inputs = nodeData.inputHandles ?? []
  const outputs = nodeData.outputHandles ?? [{ key: 'output', label: 'output' }]

  return (
    <div
      className={`rounded-xl border bg-card/90 shadow-lg backdrop-blur-sm min-w-[180px] ${
        selected ? 'border-accent ring-1 ring-accent/30' : 'border-border/25'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/25">
        <Bot className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium text-foreground truncate">
          {nodeData.label}
        </span>
      </div>

      {/* Handles */}
      <div className="px-1 py-2">
        {/* Input handles */}
        {inputs.map((handle) => (
          <div key={`in-${handle.key}`} className="relative flex items-center h-6 pl-3">
            <Handle
              type="target"
              position={Position.Left}
              id={handle.key}
              className="!w-2.5 !h-2.5 !bg-blue-400 !border-blue-600"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            />
            <span className="text-[11px] text-muted-foreground ml-1">{handle.label}</span>
          </div>
        ))}

        {/* Output handles */}
        {outputs.map((handle) => (
          <div key={`out-${handle.key}`} className="relative flex items-center justify-end h-6 pr-3">
            <span className="text-[11px] text-muted-foreground mr-1">{handle.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={handle.key}
              className="!w-2.5 !h-2.5 !bg-emerald-400 !border-emerald-600"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            />
          </div>
        ))}

        {inputs.length === 0 && outputs.length === 0 && (
          <div className="px-3 py-1 text-[11px] text-muted-foreground">No ports</div>
        )}
      </div>
    </div>
  )
}

export default memo(AgentNode)
