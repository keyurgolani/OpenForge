import { Download, GripVertical } from 'lucide-react'
import { SINK_TYPES, type SinkTypeDefinition } from './NodePalette'
import { useSinksQuery } from '@/features/sinks'
import type { Sink } from '@/types/sinks'
import { getActiveInputHandles } from '@/types/sinks'

/** Data shape passed when a DB sink is added to the canvas */
export interface SinkPaletteItem {
  /** Sink definition ID from the database */
  sinkId: string
  /** Human-readable label */
  label: string
  /** Sink type (article, rest_api, etc.) */
  sinkType: string
  /** Input handles derived from the sink type */
  inputHandles: Array<{ key: string; label: string }>
}

interface SinkPaletteProps {
  onAddSinkNode: (sinkType: SinkTypeDefinition) => void
  onAddDbSinkNode?: (item: SinkPaletteItem) => void
}

function sinkToItem(sink: Sink): SinkPaletteItem {
  return {
    sinkId: sink.id,
    label: sink.name,
    sinkType: sink.sink_type,
    inputHandles: getActiveInputHandles(sink.sink_type, sink.config ?? {}),
  }
}

export default function SinkPalette({ onAddSinkNode, onAddDbSinkNode }: SinkPaletteProps) {
  const { data } = useSinksQuery()
  const sinks = data?.sinks ?? []

  const handleSinkDragStart = (e: React.DragEvent, item: SinkPaletteItem) => {
    e.dataTransfer.setData('application/openforge-sink', JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleClick = (item: SinkPaletteItem) => {
    if (onAddDbSinkNode) {
      onAddDbSinkNode(item)
    } else {
      // Fallback: convert to old SinkTypeDefinition shape
      const typeDef = SINK_TYPES.find(s => s.type === item.sinkType)
      if (typeDef) onAddSinkNode(typeDef)
    }
  }

  // If no DB sinks, fall back to hardcoded type list
  if (sinks.length === 0) {
    return (
      <div className="w-44 border-l border-border/25 bg-background/50 overflow-y-auto flex-shrink-0">
        <div className="px-2.5 py-2 border-b border-border/25">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Sinks
          </p>
        </div>
        <div className="p-1.5 space-y-0.5">
          {SINK_TYPES.map(sink => (
            <button
              key={sink.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/openforge-sink', JSON.stringify(sink))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => onAddSinkNode(sink)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left hover:bg-purple-500/10 transition group cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0" />
              <Download className="w-3 h-3 text-purple-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-foreground truncate leading-tight">{sink.label}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-44 border-l border-border/25 bg-background/50 overflow-y-auto flex-shrink-0">
      <div className="px-2.5 py-2 border-b border-border/25">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Sinks
        </p>
      </div>
      <div className="p-1.5 space-y-0.5">
        {sinks.map(sink => {
          const item = sinkToItem(sink)
          return (
            <button
              key={sink.id}
              draggable
              onDragStart={(e) => handleSinkDragStart(e, item)}
              onClick={() => handleClick(item)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left hover:bg-purple-500/10 transition group cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0" />
              <Download className="w-3 h-3 text-purple-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-foreground truncate leading-tight">{sink.name}</p>
                <p className="text-[9px] text-muted-foreground/60 truncate leading-tight">{sink.sink_type.replace('_', ' ')}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
