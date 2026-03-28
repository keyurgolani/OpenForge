import { useState, useCallback, useMemo, useRef, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeProps,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
  Settings2,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { listAgents } from '@/lib/api'
import type {
  AutomationGraph,
  AutomationNode,
  AutomationEdge,
} from '@/types/automations'
import type { AgentDefinition } from '@/types/agents'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutomationGraphEditorProps {
  graph?: AutomationGraph
  onSave?: (nodes: unknown[], edges: unknown[], staticInputs: unknown[]) => void
}

interface AgentNodeData {
  label: string
  agentId: string
  agentName: string
  config: Record<string, unknown>
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Custom Agent Node
// ---------------------------------------------------------------------------

function AgentNodeComponent({ data, selected }: NodeProps<Node<AgentNodeData>>) {
  return (
    <div
      className={cn(
        'relative min-w-[180px] rounded-xl border bg-bg-elevated shadow-md transition-shadow',
        selected
          ? 'border-primary shadow-primary/20 shadow-lg ring-2 ring-primary/30'
          : 'border-border hover:shadow-lg',
      )}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!h-3 !w-3 !rounded-full !border-2 !border-primary !bg-bg-elevated',
          '!-left-1.5',
        )}
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="font-label text-xs font-semibold text-fg truncate">
          {data.agentName || 'Agent Node'}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <div className="text-[10px] text-fg-subtle font-mono truncate" title={data.agentId}>
          {data.agentId ? `ID: ${data.agentId.slice(0, 12)}...` : 'No agent assigned'}
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          '!h-3 !w-3 !rounded-full !border-2 !border-secondary !bg-bg-elevated',
          '!-right-1.5',
        )}
      />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  agentNode: AgentNodeComponent as any,
}

// ---------------------------------------------------------------------------
// Node Palette
// ---------------------------------------------------------------------------

function NodePalette({
  agents,
  collapsed,
  onToggle,
}: {
  agents: AgentDefinition[]
  collapsed: boolean
  onToggle: () => void
}) {
  const onDragStart = (event: DragEvent, agent: AgentDefinition) => {
    event.dataTransfer.setData('application/reactflow-agent-id', agent.id)
    event.dataTransfer.setData('application/reactflow-agent-name', agent.name)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className={cn(
        'absolute left-3 top-3 z-10 flex flex-col rounded-xl',
        'border border-border bg-bg-elevated/95 backdrop-blur-sm shadow-lg',
        'transition-all duration-300',
        collapsed ? 'w-10' : 'w-56',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-2.5 py-2">
        {!collapsed && (
          <span className="font-label text-xs font-semibold text-fg">Nodes</span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Agent list */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-h-[400px] overflow-y-auto p-2 space-y-1"
          >
            {agents.length === 0 && (
              <p className="py-4 text-center text-[10px] text-fg-subtle">
                No agents available.
              </p>
            )}
            {agents.map((agent) => (
              <div
                key={agent.id}
                draggable
                onDragStart={(e) => onDragStart(e, agent)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-2',
                  'cursor-grab border border-transparent',
                  'hover:bg-bg-sunken/50 hover:border-border/50',
                  'active:cursor-grabbing transition-colors',
                )}
              >
                <GripVertical className="h-3 w-3 text-fg-subtle shrink-0" />
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-fg truncate">{agent.name}</div>
                  {agent.description && (
                    <div className="text-[10px] text-fg-subtle truncate">
                      {agent.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Node Config Panel
// ---------------------------------------------------------------------------

function NodeConfigPanel({
  node,
  agents,
  onClose,
  onUpdate,
}: {
  node: Node<AgentNodeData>
  agents: AgentDefinition[]
  onClose: () => void
  onUpdate: (nodeId: string, data: Partial<AgentNodeData>) => void
}) {
  const agent = agents.find((a) => a.id === node.data.agentId)

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        'absolute right-3 top-3 z-10 w-64 rounded-xl',
        'border border-border bg-bg-elevated/95 backdrop-blur-sm shadow-lg',
      )}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5 text-fg-muted" />
          <span className="font-label text-xs font-semibold text-fg">Node Config</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-fg-subtle hover:text-fg hover:bg-bg-sunken transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        {/* Agent selector */}
        <div>
          <label className="block text-[10px] font-medium text-fg-muted mb-1">Agent</label>
          <select
            value={node.data.agentId ?? ''}
            onChange={(e) => {
              const selected = agents.find((a) => a.id === e.target.value)
              onUpdate(node.id, {
                agentId: e.target.value,
                agentName: selected?.name ?? '',
              })
            }}
            className={cn(
              'w-full rounded-md border border-border bg-bg py-1.5 px-2',
              'text-xs text-fg',
              'focus:border-primary focus:outline-none focus-ring',
            )}
          >
            <option value="">Select agent...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Agent info */}
        {agent && (
          <div className="rounded-md bg-bg-sunken/50 p-2 space-y-1">
            <div className="text-[10px] text-fg-subtle">
              <span className="font-medium">Slug:</span> {agent.slug}
            </div>
            <div className="text-[10px] text-fg-subtle">
              <span className="font-medium">Tools:</span> {agent.tools_config.length}
            </div>
            {agent.description && (
              <div className="text-[10px] text-fg-subtle leading-relaxed">
                {agent.description}
              </div>
            )}
          </div>
        )}

        {/* Node label */}
        <div>
          <label className="block text-[10px] font-medium text-fg-muted mb-1">Label</label>
          <input
            type="text"
            value={node.data.label ?? ''}
            onChange={(e) => onUpdate(node.id, { label: e.target.value })}
            placeholder="Custom label..."
            className={cn(
              'w-full rounded-md border border-border bg-bg py-1.5 px-2',
              'text-xs text-fg placeholder:text-fg-subtle',
              'focus:border-primary focus:outline-none focus-ring',
            )}
          />
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Convert graph to ReactFlow format
// ---------------------------------------------------------------------------

function graphToFlow(
  graph: AutomationGraph | undefined,
  agents: AgentDefinition[],
): { nodes: Node<AgentNodeData>[]; edges: Edge[] } {
  if (!graph) return { nodes: [], edges: [] }

  const agentMap = new Map(agents.map((a) => [a.id, a]))

  const nodes: Node<AgentNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'agentNode',
    position: n.position,
    data: {
      label: n.node_key,
      agentId: n.agent_id,
      agentName: agentMap.get(n.agent_id)?.name ?? n.node_key,
      config: n.config,
    },
  }))

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_output_key || undefined,
    targetHandle: e.target_input_key || undefined,
    type: 'smoothstep',
    animated: false,
    style: { strokeWidth: 2 },
  }))

  return { nodes, edges }
}

function flowToGraph(
  nodes: Node<AgentNodeData>[],
  edges: Edge[],
): { nodes: unknown[]; edges: unknown[]; static_inputs: unknown[] } {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      node_key: n.data.label || n.id,
      agent_id: n.data.agentId,
      position: n.position,
      config: n.data.config ?? {},
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source_node_id: e.source,
      source_output_key: e.sourceHandle ?? 'output',
      target_node_id: e.target,
      target_input_key: e.targetHandle ?? 'input',
    })),
    static_inputs: [],
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

let nodeIdCounter = 0

export default function AutomationGraphEditor({
  graph,
  onSave,
}: AutomationGraphEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents({ limit: 200 }),
  })

  const agents = agentsData?.agents ?? []

  const initial = useMemo(() => graphToFlow(graph, agents), [graph, agents])

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const [selectedNode, setSelectedNode] = useState<Node<AgentNodeData> | null>(null)
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)

  // Sync when graph loads
  const prevGraphRef = useRef<string>('')
  const graphKey = graph ? JSON.stringify({ n: graph.nodes.length, e: graph.edges.length, v: graph.graph_version }) : ''

  if (graphKey && graphKey !== prevGraphRef.current && agents.length > 0) {
    prevGraphRef.current = graphKey
    const fresh = graphToFlow(graph, agents)
    setNodes(fresh.nodes)
    setEdges(fresh.edges)
  }

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'smoothstep',
            animated: false,
            style: { strokeWidth: 2 },
          },
          eds,
        ),
      )
    },
    [setEdges],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node as Node<AgentNodeData>)
    },
    [],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const agentId = event.dataTransfer.getData('application/reactflow-agent-id')
      const agentName = event.dataTransfer.getData('application/reactflow-agent-name')
      if (!agentId) return

      const wrapper = reactFlowWrapper.current
      if (!wrapper) return

      const bounds = wrapper.getBoundingClientRect()
      const position = {
        x: event.clientX - bounds.left - 90,
        y: event.clientY - bounds.top - 30,
      }

      const newNode: Node<AgentNodeData> = {
        id: `node-${Date.now()}-${++nodeIdCounter}`,
        type: 'agentNode',
        position,
        data: {
          label: agentName,
          agentId,
          agentName,
          config: {},
        },
      }

      setNodes((nds) => [...nds, newNode])
    },
    [setNodes],
  )

  const updateNodeData = useCallback(
    (nodeId: string, dataUpdate: Partial<AgentNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...dataUpdate } } : n,
        ),
      )
      setSelectedNode((prev) =>
        prev && prev.id === nodeId
          ? { ...prev, data: { ...prev.data, ...dataUpdate } }
          : prev,
      )
    },
    [setNodes],
  )

  const handleSave = useCallback(() => {
    const converted = flowToGraph(nodes, edges)
    onSave?.(converted.nodes, converted.edges, converted.static_inputs)
  }, [nodes, edges, onSave])

  return (
    <div ref={reactFlowWrapper} className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Delete"
        className="bg-bg"
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 2, stroke: 'rgb(var(--fg-subtle))' },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgb(var(--fg-subtle) / 0.3)"
        />
        <Controls
          className={cn(
            '[&>button]:!rounded-md [&>button]:!border-border [&>button]:!bg-bg-elevated',
            '[&>button]:!text-fg-muted [&>button]:hover:!bg-bg-sunken [&>button]:hover:!text-fg',
          )}
        />
        <MiniMap
          nodeColor="rgb(var(--p-500))"
          maskColor="rgb(var(--bg) / 0.8)"
          className="!rounded-lg !border-border !bg-bg-elevated/80 !backdrop-blur-sm"
        />
      </ReactFlow>

      {/* Node Palette */}
      <NodePalette
        agents={agents}
        collapsed={paletteCollapsed}
        onToggle={() => setPaletteCollapsed(!paletteCollapsed)}
      />

      {/* Node Config Panel */}
      <AnimatePresence>
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            agents={agents}
            onClose={() => setSelectedNode(null)}
            onUpdate={updateNodeData}
          />
        )}
      </AnimatePresence>

      {/* Save button */}
      {onSave && (
        <button
          type="button"
          onClick={handleSave}
          className={cn(
            'absolute bottom-3 right-3 z-10',
            'inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2',
            'text-xs font-medium text-fg-on-primary shadow-lg',
            'hover:bg-primary-hover transition-colors focus-ring',
          )}
        >
          <Save className="h-3.5 w-3.5" />
          Save Graph
        </button>
      )}
    </div>
  )
}
