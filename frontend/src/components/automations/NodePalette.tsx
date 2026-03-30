import { Bot, GripVertical } from 'lucide-react'
import type { ParameterConfig } from '@/types/agents'

interface Agent {
  id: string
  name: string
  slug: string
  input_schema: ParameterConfig[]
  output_definitions: Array<{ key: string; type?: string; label?: string }>
}

export interface SinkTypeDefinition {
  type: string
  label: string
  inputHandles: Array<{ key: string; label: string }>
}

export const SINK_TYPES: SinkTypeDefinition[] = [
  { type: 'article', label: 'Article', inputHandles: [{ key: 'content', label: 'Content' }, { key: 'title', label: 'Title' }] },
  { type: 'knowledge_create', label: 'Knowledge Create', inputHandles: [{ key: 'content', label: 'Content' }, { key: 'title', label: 'Title' }, { key: 'workspace_id', label: 'Workspace' }] },
  { type: 'knowledge_update', label: 'Knowledge Update', inputHandles: [{ key: 'content', label: 'Content' }, { key: 'knowledge_id', label: 'Knowledge ID' }] },
  { type: 'rest_api', label: 'REST API', inputHandles: [{ key: 'body', label: 'Body' }, { key: 'url', label: 'URL' }] },
  { type: 'notification', label: 'Notification', inputHandles: [{ key: 'message', label: 'Message' }] },
  { type: 'log', label: 'Log', inputHandles: [{ key: 'data', label: 'Data' }] },
]

interface NodePaletteProps {
  agents: Agent[]
  onAddNode: (agent: Agent) => void
}

export default function NodePalette({ agents, onAddNode }: NodePaletteProps) {
  const handleAgentDragStart = (e: React.DragEvent, agent: Agent) => {
    e.dataTransfer.setData('application/openforge-agent', JSON.stringify(agent))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-44 border-r border-border/25 bg-background/50 overflow-y-auto flex-shrink-0">
      <div className="px-2.5 py-2 border-b border-border/25">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Agents
        </p>
      </div>
      <div className="p-1.5 space-y-0.5">
        {agents.length === 0 ? (
          <p className="text-[10px] text-muted-foreground p-2">No agents available</p>
        ) : (
          agents.map(agent => (
            <button
              key={agent.id}
              draggable
              onDragStart={(e) => handleAgentDragStart(e, agent)}
              onClick={() => onAddNode(agent)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left hover:bg-accent/15 transition group cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0" />
              <Bot className="w-3 h-3 text-accent flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-foreground truncate leading-tight">{agent.name}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
