import { Download, GripVertical } from 'lucide-react'
import { SINK_TYPES, type SinkTypeDefinition } from './NodePalette'

interface SinkPaletteProps {
  onAddSinkNode: (sinkType: SinkTypeDefinition) => void
}

export default function SinkPalette({ onAddSinkNode }: SinkPaletteProps) {
  const handleSinkDragStart = (e: React.DragEvent, sinkType: SinkTypeDefinition) => {
    e.dataTransfer.setData('application/openforge-sink', JSON.stringify(sinkType))
    e.dataTransfer.effectAllowed = 'move'
  }

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
            onDragStart={(e) => handleSinkDragStart(e, sink)}
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
