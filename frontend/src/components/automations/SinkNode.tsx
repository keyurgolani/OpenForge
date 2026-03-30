import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Download } from 'lucide-react'

export interface SinkNodeData {
  label: string
  sinkType: string
  inputHandles: Array<{ key: string; label: string }>
  nodeKey: string
}

function SinkNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as SinkNodeData
  const inputs = nodeData.inputHandles ?? [{ key: 'input', label: 'input' }]

  return (
    <div
      className={`rounded-lg border bg-card/90 shadow-md backdrop-blur-sm min-w-[120px] max-w-[160px] ${
        selected ? 'border-purple-400 ring-1 ring-purple-400/30' : 'border-border/25'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-purple-400/25 bg-purple-500/5 rounded-t-lg">
        <Download className="w-3 h-3 text-purple-400 flex-shrink-0" />
        <span className="text-[10px] font-medium text-foreground truncate leading-tight">
          {nodeData.label}
        </span>
      </div>

      {/* Handles — sinks only have inputs */}
      <div className="px-0.5 py-1">
        {inputs.map((handle) => (
          <div key={`in-${handle.key}`} className="relative flex items-center h-4 pl-2">
            <Handle
              type="target"
              position={Position.Left}
              id={handle.key}
              className="!w-2 !h-2 !bg-purple-400 !border-purple-600"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            />
            <span className="text-[9px] text-muted-foreground ml-1 truncate">{handle.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(SinkNode)
