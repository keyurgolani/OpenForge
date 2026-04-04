import { useMemo } from 'react'

interface GraphNode {
  id: string
  node_type?: string
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

  for (const id of ids) {
    if (!level.has(id)) level.set(id, 0)
  }

  const levels: string[][] = Array.from({ length: maxLevel + 1 }, () => [])
  for (const [id, lvl] of level) levels[lvl].push(id)
  return levels
}

export default function MiniGraphPreview({ nodes, edges, width = 120, height = 56 }: MiniGraphPreviewProps) {
  const layout = useMemo(() => {
    if (nodes.length === 0) return null

    // Deduplicate edges by source+target pair
    const edgeSet = new Set<string>()
    const uniqueEdges = edges.filter(e => {
      const key = `${e.source}->${e.target}`
      if (edgeSet.has(key)) return false
      edgeSet.add(key)
      return true
    })

    const levels = computeLevels(nodes, uniqueEdges)
    const levelCount = levels.length

    const padX = 16
    const padY = 12
    const nodeW = 28
    const nodeH = 14
    const innerW = width - padX * 2
    const innerH = height - padY * 2

    const nodeTypeMap = new Map<string, string | undefined>(nodes.map(n => [n.id, n.node_type]))
    const positions = new Map<string, { cx: number; cy: number; node_type?: string }>()
    for (let li = 0; li < levelCount; li++) {
      const count = levels[li].length
      const x = levelCount === 1 ? width / 2 : padX + (li / (levelCount - 1)) * innerW
      for (let ni = 0; ni < count; ni++) {
        const y = count === 1 ? height / 2 : padY + (ni / (count - 1)) * innerH
        const id = levels[li][ni]
        positions.set(id, { cx: x, cy: y, node_type: nodeTypeMap.get(id) })
      }
    }

    return { positions, nodeW, nodeH, uniqueEdges }
  }, [nodes, edges, width, height])

  if (!layout) return null

  const { positions, nodeW, nodeH, uniqueEdges } = layout

  // Use hsl() wrapper since Tailwind CSS vars store raw HSL values
  const edgeColor = 'hsl(var(--muted-foreground))'

  function nodeColor(node_type?: string): string {
    if (node_type === 'constant') return '#8b5cf6'
    if (node_type === 'sink') return '#a78bfa'
    return '#f59e0b'
  }

  return (
    <svg width={width} height={height}>
      {/* Edges */}
      {uniqueEdges.map((e, i) => {
        const from = positions.get(e.source)
        const to = positions.get(e.target)
        if (!from || !to) return null
        const x1 = from.cx + nodeW / 2
        const y1 = from.cy
        const x2 = to.cx - nodeW / 2
        const y2 = to.cy
        // Cubic bezier with horizontal control points for a natural curve
        const cpOffset = Math.abs(x2 - x1) * 0.4
        const d = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`
        return (
          <path key={i} d={d} style={{ stroke: edgeColor, strokeWidth: 1.5, fill: 'none' }} />
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
          rx={3}
          style={{ fill: nodeColor(pos.node_type) }}
        />
      ))}
    </svg>
  )
}
