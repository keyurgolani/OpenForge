interface GraphNode {
  id: string
  x: number
  y: number
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

export default function MiniGraphPreview({ nodes, edges, width = 80, height = 48 }: MiniGraphPreviewProps) {
  if (nodes.length === 0) return null

  // Compute bounds and normalize positions to fit the SVG
  const padding = 6
  const nodeRadius = 3
  const innerW = width - padding * 2
  const innerH = height - padding * 2

  const xs = nodes.map(n => n.x)
  const ys = nodes.map(n => n.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  const norm = (n: GraphNode) => ({
    x: padding + ((n.x - minX) / rangeX) * innerW,
    y: padding + ((n.y - minY) / rangeY) * innerH,
  })

  // Single node: center it
  const positions = nodes.length === 1
    ? [{ x: width / 2, y: height / 2 }]
    : nodes.map(norm)

  const nodeById = new Map(nodes.map((n, i) => [n.id, positions[i]]))

  return (
    <svg width={width} height={height} className="rounded border border-border/30 bg-background/40">
      {/* Edges */}
      {edges.map((e, i) => {
        const from = nodeById.get(e.source)
        const to = nodeById.get(e.target)
        if (!from || !to) return null
        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="var(--accent)"
            strokeOpacity={0.4}
            strokeWidth={1}
          />
        )
      })}
      {/* Nodes */}
      {positions.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={nodeRadius}
          fill="var(--accent)"
          fillOpacity={0.8}
        />
      ))}
    </svg>
  )
}
