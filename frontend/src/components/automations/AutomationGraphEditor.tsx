import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge as RFEdge,
  type Node as RFNode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Save } from 'lucide-react'

import AgentNode from './AgentNode'
import NodePalette from './NodePalette'
import NodeConfigPanel from './NodeConfigPanel'
import type { AutomationGraph } from '@/types/automations'
import type { ParameterConfig } from '@/types/agents'
import { useAgentsQuery } from '@/features/agents'
import { useSaveAutomationGraph } from '@/features/automations'

interface AutomationGraphEditorProps {
  automationId: string
  graph: AutomationGraph | null
}

let nodeIdCounter = 0
function nextNodeId() {
  return `node_${Date.now()}_${++nodeIdCounter}`
}

const nodeTypes = { agentNode: AgentNode }

/** Extract input handles from an agent's input_schema */
function inputHandlesFromSchema(
  inputSchema: ParameterConfig[] | undefined,
): Array<{ key: string; label: string }> {
  if (!inputSchema || inputSchema.length === 0) return []
  return inputSchema.map(param => ({
    key: param.name ?? '',
    label: param.label ?? param.name ?? '',
  }))
}

/** Extract output handles from an agent's output_definitions */
function outputHandlesFromDefinitions(
  outputDefs: Array<{ key: string; type?: string; label?: string }> | undefined,
): Array<{ key: string; label: string }> {
  if (!outputDefs || outputDefs.length === 0) return [{ key: 'output', label: 'output' }]
  return outputDefs.map(def => ({
    key: def.key,
    label: def.label ?? def.key,
  }))
}

/** Extract typed input schema entries for the config panel */
function typedInputSchema(
  inputSchema: ParameterConfig[] | undefined,
): Array<{ name: string; type: string; label?: string; description?: string }> {
  if (!inputSchema || inputSchema.length === 0) return []
  return inputSchema.map(param => ({
    name: param.name ?? '',
    type: param.type ?? 'string',
    label: param.label ?? undefined,
    description: param.description ?? undefined,
  }))
}

export default function AutomationGraphEditor(props: AutomationGraphEditorProps) {
  return (
    <ReactFlowProvider>
      <AutomationGraphEditorInner {...props} />
    </ReactFlowProvider>
  )
}

function AutomationGraphEditorInner({ automationId, graph }: AutomationGraphEditorProps) {
  const { data: agentsData } = useAgentsQuery()
  const saveGraph = useSaveAutomationGraph()
  const agents = agentsData?.agents ?? []
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  // Convert graph data to React Flow format
  const initialNodes: RFNode[] = useMemo(() => {
    if (!graph?.nodes) return []
    return graph.nodes.map(n => {
      const agent = agents.find(a => a.id === n.agent_id)
      return {
        id: n.id,
        type: 'agentNode',
        position: n.position,
        data: {
          label: agent?.name ?? n.node_key,
          agentId: n.agent_id,
          agentSlug: agent?.slug,
          inputHandles: inputHandlesFromSchema(agent?.input_schema),
          outputHandles: outputHandlesFromDefinitions(agent?.output_definitions),
          nodeKey: n.node_key,
        },
      }
    })
  }, [graph?.nodes, agents])

  const initialEdges: RFEdge[] = useMemo(() => {
    if (!graph?.edges) return []
    return graph.edges.map(e => ({
      id: e.id,
      source: e.source_node_id,
      sourceHandle: e.source_output_key,
      target: e.target_node_id,
      targetHandle: e.target_input_key,
      animated: true,
      style: { stroke: '#60a5fa' },
    }))
  }, [graph?.edges])

  // Build initial static inputs map from graph data keyed by node id -> input_key -> value
  const initialStaticInputs = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {}
    if (graph?.static_inputs) {
      for (const si of graph.static_inputs) {
        if (!map[si.node_id]) map[si.node_id] = {}
        map[si.node_id][si.input_key] = si.static_value
      }
    }
    return map
  }, [graph?.static_inputs])

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [isDirty, setIsDirty] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [staticInputsMap, setStaticInputsMap] = useState<Record<string, Record<string, unknown>>>(initialStaticInputs)

  // Wrap onNodesChange to clean up static inputs when nodes are deleted
  const onNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeBase>[0]) => {
      const removedIds = changes
        .filter((c): c is { type: 'remove'; id: string } => c.type === 'remove')
        .map(c => c.id)
      if (removedIds.length > 0) {
        setStaticInputsMap(prev => {
          const next = { ...prev }
          for (const id of removedIds) {
            delete next[id]
          }
          return next
        })
        setSelectedNodeId(prev => removedIds.includes(prev ?? '') ? null : prev)
        setIsDirty(true)
      }
      onNodesChangeBase(changes)
    },
    [onNodesChangeBase],
  )

  // Sync nodes when agent data loads asynchronously after graph data.
  // Track the number of agents so we detect when the agents query resolves.
  const syncedAgentCountRef = useRef(agents.length)
  useEffect(() => {
    if (agents.length > 0 && agents.length !== syncedAgentCountRef.current && graph?.nodes && graph.nodes.length > 0) {
      syncedAgentCountRef.current = agents.length
      setNodes(initialNodes)
      setEdges(initialEdges)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.length])

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: '#60a5fa' } }, eds))
      setIsDirty(true)
    },
    [setEdges],
  )

  const handleAddNode = useCallback(
    (agent: { id: string; name: string; slug: string; input_schema: ParameterConfig[]; output_definitions?: Array<{ key: string; type?: string; label?: string }> }) => {
      const nodeKey = `${agent.slug}_${nextNodeId()}`
      const newNode: RFNode = {
        id: nodeKey,
        type: 'agentNode',
        position: { x: 250 + Math.random() * 200, y: 100 + Math.random() * 200 },
        data: {
          label: agent.name,
          agentId: agent.id,
          agentSlug: agent.slug,
          inputHandles: inputHandlesFromSchema(agent.input_schema),
          outputHandles: outputHandlesFromDefinitions(agent.output_definitions),
          nodeKey,
        },
      }
      setNodes(nds => [...nds, newNode])
      setIsDirty(true)
    },
    [setNodes],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const agentData = event.dataTransfer.getData('application/openforge-agent')
      if (!agentData) return
      try {
        const agent = JSON.parse(agentData)
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        const nodeKey = `${agent.slug}_${nextNodeId()}`
        const newNode: RFNode = {
          id: nodeKey,
          type: 'agentNode',
          position,
          data: {
            label: agent.name,
            agentId: agent.id,
            agentSlug: agent.slug,
            inputHandles: inputHandlesFromSchema(agent.input_schema),
            outputHandles: outputHandlesFromDefinitions(agent.output_definitions),
            nodeKey,
          },
        }
        setNodes(nds => [...nds, newNode])
        setIsDirty(true)
      } catch { /* ignore invalid data */ }
    },
    [screenToFlowPosition, setNodes],
  )

  const onNodeClick = useCallback((_event: React.MouseEvent, node: RFNode) => {
    setSelectedNodeId(node.id)
  }, [])

  const handleCloseConfigPanel = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const handleStaticInputChange = useCallback(
    (nodeId: string, inputKey: string, value: unknown) => {
      setStaticInputsMap(prev => ({
        ...prev,
        [nodeId]: {
          ...(prev[nodeId] ?? {}),
          [inputKey]: value,
        },
      }))
      setIsDirty(true)
    },
    [],
  )

  // Derive wired inputs for the selected node from edges
  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null
  const selectedNodeData = selectedNode?.data as Record<string, unknown> | null
  const selectedAgentId = selectedNodeData?.agentId as string | undefined
  const selectedAgent = agents.find(a => a.id === selectedAgentId)

  const wiredInputs: Record<string, { sourceNodeKey: string; sourceOutputKey: string }> = useMemo(() => {
    if (!selectedNodeId) return {}
    const result: Record<string, { sourceNodeKey: string; sourceOutputKey: string }> = {}
    for (const edge of edges) {
      if (edge.target === selectedNodeId && edge.targetHandle) {
        const sourceNode = nodes.find(n => n.id === edge.source)
        const sourceNodeKey = sourceNode
          ? (sourceNode.data as Record<string, unknown>).nodeKey as string || edge.source
          : edge.source
        result[edge.targetHandle] = {
          sourceNodeKey,
          sourceOutputKey: edge.sourceHandle ?? 'output',
        }
      }
    }
    return result
  }, [selectedNodeId, edges, nodes])

  const handleSave = useCallback(async () => {
    const graphNodes = nodes.map(n => ({
      node_key: (n.data as Record<string, unknown>).nodeKey as string || n.id,
      agent_id: (n.data as Record<string, unknown>).agentId as string,
      position: n.position,
      config: {},
    }))

    const nodeIdToKey: Record<string, string> = {}
    nodes.forEach(n => {
      nodeIdToKey[n.id] = (n.data as Record<string, unknown>).nodeKey as string || n.id
    })

    const graphEdges = edges.map(e => ({
      source_node_key: nodeIdToKey[e.source] ?? e.source,
      source_output_key: e.sourceHandle ?? 'output',
      target_node_key: nodeIdToKey[e.target] ?? e.target,
      target_input_key: e.targetHandle ?? '',
    }))

    // Build static_inputs from the map
    const staticInputs: Array<{ node_key: string; input_key: string; static_value: unknown }> = []
    for (const [nodeId, inputs] of Object.entries(staticInputsMap)) {
      const nodeKey = nodeIdToKey[nodeId] ?? nodeId
      for (const [inputKey, value] of Object.entries(inputs)) {
        if (value !== '' && value != null) {
          staticInputs.push({ node_key: nodeKey, input_key: inputKey, static_value: value })
        }
      }
    }

    await saveGraph.mutateAsync({
      id: automationId,
      graph: { nodes: graphNodes, edges: graphEdges, static_inputs: staticInputs },
    })
    setIsDirty(false)
  }, [automationId, nodes, edges, saveGraph, staticInputsMap])

  return (
    <div className="flex h-[600px] rounded-xl border border-border/60 overflow-hidden">
      <NodePalette agents={agents} onAddNode={handleAddNode} />
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        {isDirty && (
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={handleSave}
              disabled={saveGraph.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-semibold shadow-lg hover:bg-accent/90 transition"
            >
              <Save className="w-3.5 h-3.5" />
              {saveGraph.isPending ? 'Saving...' : 'Save Graph'}
            </button>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => {
            onNodesChange(changes)
            // Only mark dirty for user-initiated changes, not React Flow internals (dimensions, select)
            const meaningful = changes.some(c => c.type === 'remove' || (c.type === 'position' && 'dragging' in c && c.dragging))
            if (meaningful) setIsDirty(true)
          }}
          onEdgesChange={(changes) => {
            onEdgesChange(changes)
            const meaningful = changes.some(c => c.type === 'remove' || c.type === 'add')
            if (meaningful) setIsDirty(true)
          }}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          fitView
          className="bg-background"
        >
          <Controls className="!bg-card !border-border/60 !shadow-lg" />
          <MiniMap
            className="!bg-card !border-border/60"
            nodeColor="#6366f1"
            maskColor="rgba(0,0,0,0.3)"
          />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#333" />
        </ReactFlow>
      </div>
      {selectedNode && selectedNodeData && (
        <NodeConfigPanel
          node={{
            id: selectedNode.id,
            node_key: (selectedNodeData.nodeKey as string) || selectedNode.id,
            agent_id: (selectedNodeData.agentId as string) || '',
            position: selectedNode.position,
            config: {},
          }}
          agentName={selectedAgent?.name ?? (selectedNodeData.label as string) ?? 'Agent'}
          inputSchema={typedInputSchema(selectedAgent?.input_schema)}
          outputDefinitions={
            selectedAgent?.output_definitions?.length
              ? selectedAgent.output_definitions.map(d => ({ key: d.key, type: d.type ?? 'text', label: d.label }))
              : [{ key: 'output', type: 'text', label: 'output' }]
          }
          wiredInputs={wiredInputs}
          staticInputs={staticInputsMap[selectedNode.id] ?? {}}
          onStaticInputChange={(inputKey, value) =>
            handleStaticInputChange(selectedNode.id, inputKey, value)
          }
          onClose={handleCloseConfigPanel}
        />
      )}
    </div>
  )
}
