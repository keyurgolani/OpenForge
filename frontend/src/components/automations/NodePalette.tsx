import { Bot, GripVertical } from 'lucide-react'
import type { ParameterConfig } from '@/types/agents'

interface Agent {
  id: string
  name: string
  slug: string
  input_schema: ParameterConfig[]
  output_definitions: Array<{ key: string; type?: string; label?: string }>
}

interface NodePaletteProps {
  agents: Agent[]
  onAddNode: (agent: Agent) => void
}

export default function NodePalette({ agents, onAddNode }: NodePaletteProps) {
  const activeAgents = agents

  const handleDragStart = (e: React.DragEvent, agent: Agent) => {
    e.dataTransfer.setData('application/openforge-agent', JSON.stringify(agent))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-56 border-r border-border/40 bg-background/50 overflow-y-auto">
      <div className="p-3 border-b border-border/40">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Agents
        </p>
      </div>
      <div className="p-2 space-y-1">
        {activeAgents.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">No agents available</p>
        ) : (
          activeAgents.map(agent => (
            <button
              key={agent.id}
              draggable
              onDragStart={(e) => handleDragStart(e, agent)}
              onClick={() => onAddNode(agent)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-accent/10 transition group cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground" />
              <Bot className="w-4 h-4 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{agent.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{agent.slug}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
