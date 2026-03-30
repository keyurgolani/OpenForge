import { useMemo } from 'react'

interface GraphNode {
  id: string
}

interface GraphEdge {
  source: string
  target: string
}

interface MiniGraphPreviewProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width?: number
  height?: number
}

/** Compute topological execution levels (Kahn's algorithm). */
function computeLevels(nodes: GraphNode[], edges: GraphEdge[]): string[][] {
  const ids = new Set(nodes.map(n => n.id))
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of ids) {
    inDegree.set(id, 0)
    adj.set(id, [])
  }
  for (const e of edges) {
    if (ids.has(e.source) && ids.has(e.target)) {
      adj.get(e.source)!.push(e.target)
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
    }
  }

  // Assign levels via BFS
  const level = new Map<string, number>()
  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id)
      level.set(id, 0)
    }
  }
  let maxLevel = 0
  while (queue.length > 0) {
    const cur = queue.shift()!
    const curLevel = level.get(cur)!
    for (const next of adj.get(cur) ?? []) {
      const nextLevel = Math.max(level.get(next) ?? 0, curLevel + 1)
      level.set(next, nextLevel)
      maxLevel = Math.max(maxLevel, nextLevel)
      inDegree.set(next, (inDegree.get(next) ?? 0) - 1)
      if (inDegree.get(next) === 0) queue.push(next)
    }
  }

  // Handle any nodes not reached (disconnected) — put at level 0
  for (const id of ids) {
    if (!level.has(id)) level.set(id, 0)
  }

  // Group by level
  const levels: string[][] = Array.from({ length: maxLevel + 1 }, () => [])
  for (const [id, lvl] of level) levels[lvl].push(id)
  return levels
}

export default function MiniGraphPreview({ nodes, edges, width = 120, height = 56 }: MiniGraphPreviewProps) {
  const layout = useMemo(() => {
    if (nodes.length === 0) return null

    const levels = computeLevels(nodes, edges)
    const levelCount = levels.length
    const maxPerLevel = Math.max(...levels.map(l => l.length))

    // Layout params
    const padX = 10
    const padY = 8
    const nodeW = 16
    const nodeH = 8
    const innerW = width - padX * 2
    const innerH = height - padY * 2

    // Compute positions: levels flow left-to-right, nodes within a level stack vertically
    const positions = new Map<string, { cx: number; cy: number }>()
    for (let li = 0; li < levelCount; li++) {
      const count = levels[li].length
      const x = levelCount === 1 ? width / 2 : padX + (li / (levelCount - 1)) * innerW
      for (let ni = 0; ni < count; ni++) {
        const y = count === 1 ? height / 2 : padY + (ni / (count - 1)) * innerH
        positions.set(levels[li][ni], { cx: x, cy: y })
      }
    }

    return { positions, nodeW, nodeH }
  }, [nodes, edges, width, height])

  if (!layout) return null

  const { positions, nodeW, nodeH } = layout

  return (
    <svg width={width} height={height} className="rounded-lg border border-border/30 bg-background/50">
      {/* Edges */}
      {edges.map((e, i) => {
        const from = positions.get(e.source)
        const to = positions.get(e.target)
        if (!from || !to) return null
        return (
          <line
            key={i}
            x1={from.cx + nodeW / 2}
            y1={from.cy}
            x2={to.cx - nodeW / 2}
            y2={to.cy}
            stroke="var(--accent)"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        )
      })}
      {/* Nodes */}
      {Array.from(positions.entries()).map(([id, pos]) => (
        <rect
          key={id}
          x={pos.cx - nodeW / 2}
          y={pos.cy - nodeH / 2}
          width={nodeW}
          height={nodeH}
          rx={2}
          fill="var(--accent)"
          fillOpacity={0.7}
        />
      ))}
    </svg>
  )
}
