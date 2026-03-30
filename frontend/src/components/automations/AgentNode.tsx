import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot } from 'lucide-react'

export interface AgentNodeData {
  label: string
  agentId: string
  agentSlug?: string
  inputHandles: Array<{ key: string; label: string; required?: boolean }>
  outputHandles: Array<{ key: string; label: string }>
  isSelected?: boolean
}

function AgentNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData
  const inputs = nodeData.inputHandles ?? []
  const outputs = nodeData.outputHandles ?? [{ key: 'output', label: 'output' }]

  return (
    <div
      className={`rounded-lg border bg-card/90 shadow-md backdrop-blur-sm min-w-[120px] max-w-[160px] ${
        selected ? 'border-accent ring-1 ring-accent/30' : 'border-border/25'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border/25">
        <Bot className="w-3 h-3 text-accent flex-shrink-0" />
        <span className="text-[10px] font-medium text-foreground truncate leading-tight">
          {nodeData.label}
        </span>
      </div>

      {/* Handles */}
      <div className="px-0.5 py-1">
        {/* Input handles */}
        {inputs.map((handle) => (
          <div key={`in-${handle.key}`} className="relative flex items-center h-4 pl-2">
            <Handle
              type="target"
              position={Position.Left}
              id={handle.key}
              className="!w-2 !h-2 !bg-blue-400 !border-blue-600"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            />
            <span className="text-[9px] text-muted-foreground ml-1 truncate">{handle.label}</span>
            {handle.required && <span className="text-[8px] text-red-400 ml-0.5">*</span>}
          </div>
        ))}

        {/* Output handles */}
        {outputs.map((handle) => (
          <div key={`out-${handle.key}`} className="relative flex items-center justify-end h-4 pr-2">
            <span className="text-[9px] text-muted-foreground mr-1 truncate">{handle.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={handle.key}
              className="!w-2 !h-2 !bg-emerald-400 !border-emerald-600"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            />
          </div>
        ))}

        {inputs.length === 0 && outputs.length === 0 && (
          <div className="px-2 py-0.5 text-[9px] text-muted-foreground">No ports</div>
        )}
      </div>
    </div>
  )
}

export default memo(AgentNode)
