import { useMemo } from 'react'
import {
  ArrowRightCircle,
  CircleDot,
  FileOutput,
  GitFork,
  Hand,
  Layers,
  Maximize2,
  Minimize2,
  Shrink,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import type { WorkflowNode, WorkflowEdge } from '@/types/workflows'

/* ------------------------------------------------------------------ */
/*  Node-type visual mapping                                          */
/* ------------------------------------------------------------------ */

interface NodeVisual {
  color: string
  bg: string
  border: string
  Icon: LucideIcon
}

const NODE_VISUALS: Record<string, NodeVisual> = {
  llm:            { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/25',    Icon: Sparkles },
  tool:           { color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/25',  Icon: Wrench },
  router:         { color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/25',  Icon: GitFork },
  fanout:         { color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/25',    Icon: Maximize2 },
  join:           { color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/25',    Icon: Minimize2 },
  reduce:         { color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/25',   Icon: Shrink },
  approval:       { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   Icon: ShieldCheck },
  artifact:       { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', Icon: FileOutput },
  delegate_call:  { color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/25',  Icon: ArrowRightCircle },
  subworkflow:    { color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/25',  Icon: Layers },
  handoff:        { color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25',  Icon: Hand },
  terminal:       { color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/25',    Icon: CircleDot },
}

const DEFAULT_VISUAL: NodeVisual = {
  color: 'text-gray-400',
  bg: 'bg-gray-500/10',
  border: 'border-gray-500/25',
  Icon: CircleDot,
}

function getVisual(nodeType: string): NodeVisual {
  return NODE_VISUALS[nodeType] ?? DEFAULT_VISUAL
}

/* ------------------------------------------------------------------ */
/*  BFS layout algorithm                                              */
/* ------------------------------------------------------------------ */

function buildLevels(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  entryNodeId?: string,
): WorkflowNode[][] {
  if (nodes.length === 0) return []

  // Build adjacency list (outgoing)
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const list = outgoing.get(edge.from_node_id) ?? []
    list.push(edge.to_node_id)
    outgoing.set(edge.from_node_id, list)
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const visited = new Set<string>()
  const levels: WorkflowNode[][] = []

  // Determine entry point
  const startId = entryNodeId && nodeById.has(entryNodeId)
    ? entryNodeId
    : nodes[0]?.id

  if (!startId) return []

  // BFS
  let frontier = [startId]
  while (frontier.length > 0) {
    const level: WorkflowNode[] = []
    const nextFrontier: string[] = []

    for (const id of frontier) {
      if (visited.has(id)) continue
      visited.add(id)
      const node = nodeById.get(id)
      if (node) level.push(node)

      for (const childId of outgoing.get(id) ?? []) {
        if (!visited.has(childId)) {
          nextFrontier.push(childId)
        }
      }
    }

    if (level.length > 0) levels.push(level)
    frontier = nextFrontier
  }

  // Append orphan nodes not reachable from entry
  const orphans = nodes.filter((n) => !visited.has(n.id))
  if (orphans.length > 0) levels.push(orphans)

  return levels
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface WorkflowFlowViewProps {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  entryNodeId?: string
  selectedNodeId?: string
  onSelectNode: (nodeId: string) => void
}

export default function WorkflowFlowView({
  nodes,
  edges,
  entryNodeId,
  selectedNodeId,
  onSelectNode,
}: WorkflowFlowViewProps) {
  const levels = useMemo(
    () => buildLevels(nodes, edges, entryNodeId),
    [nodes, edges, entryNodeId],
  )

  if (levels.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-sm text-muted-foreground/80">
        No nodes to display.
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-0">
      {levels.map((level, levelIdx) => (
        <div key={levelIdx}>
          {/* Connector from previous level */}
          {levelIdx > 0 && (
            <div className="flex justify-center py-1">
              <div className="h-6 w-px bg-border/60" />
            </div>
          )}

          {/* Node row */}
          <div className="flex flex-wrap items-start justify-center gap-3">
            {level.map((node) => {
              const visual = getVisual(node.node_type)
              const isSelected = node.id === selectedNodeId
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onSelectNode(node.id)}
                  className={`w-full max-w-xs rounded-2xl border p-4 text-left transition ${
                    isSelected ? 'border-accent/40 ring-2 ring-accent/20' : visual.border
                  } ${visual.bg}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visual.bg}`}>
                      <visual.Icon className={`h-4 w-4 ${visual.color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{node.label}</p>
                      <p className="text-xs text-muted-foreground/70">{node.node_type}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
