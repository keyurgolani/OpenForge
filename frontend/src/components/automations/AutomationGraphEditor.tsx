import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState, useRef } from 'react'
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
import SinkNode from './SinkNode'
import ConstantNode from './ConstantNode'
import NodePalette, { type SinkTypeDefinition, SINK_TYPES } from './NodePalette'
import SinkPalette, { type SinkPaletteItem } from './SinkPalette'
import NodeConfigPanel from './NodeConfigPanel'
import type { AutomationGraph } from '@/types/automations'
import type { ParameterConfig } from '@/types/agents'
import { useAgentsQuery } from '@/features/agents'
import { useSinksQuery } from '@/features/sinks'
import { getActiveInputHandles, type SinkType } from '@/types/sinks'
import { useSaveAutomationGraph } from '@/features/automations'
import { useWorkspaces } from '@/hooks/useWorkspace'

interface AutomationGraphEditorProps {
  automationId: string
  graph: AutomationGraph | null
  readOnly?: boolean
}

export interface AutomationGraphEditorHandle {
  /** Return the current graph payload if there are unsaved changes, or null if clean. */
  getPendingGraph: () => { nodes: unknown[]; edges: unknown[]; static_inputs: unknown[] } | null
}

let nodeIdCounter = 0
function nextNodeId() {
  return `node_${Date.now()}_${++nodeIdCounter}`
}

const nodeTypes = { agentNode: AgentNode, sinkNode: SinkNode, constantNode: ConstantNode }

/** Extract input handles from an agent's input_schema.
 *  Agents without explicit inputs get a default "User Request" text input. */
function inputHandlesFromSchema(
  inputSchema: ParameterConfig[] | undefined,
): Array<{ key: string; label: string; required?: boolean }> {
  if (!inputSchema || inputSchema.length === 0) {
    return [{ key: 'user_request', label: 'User Request', required: true }]
  }
  return inputSchema.map(param => ({
    key: param.name ?? '',
    label: param.label ?? param.name ?? '',
    required: param.required ?? false,
  }))
}

/** Extract output handles from an agent's output_definitions.
 *  Agents without explicit outputs get a default "Agent Response" text output.
 *  A single generic "output" key is also treated as the default. */
function outputHandlesFromDefinitions(
  outputDefs: Array<{ key: string; type?: string; label?: string }> | undefined,
): Array<{ key: string; label: string }> {
  if (!outputDefs || outputDefs.length === 0) {
    return [{ key: 'response', label: 'Agent Response' }]
  }
  // Treat a single generic "output" entry as the default
  if (outputDefs.length === 1 && outputDefs[0].key === 'output' && !outputDefs[0].label) {
    return [{ key: 'output', label: 'Agent Response' }]
  }
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

const AutomationGraphEditor = forwardRef<AutomationGraphEditorHandle, AutomationGraphEditorProps>(
  function AutomationGraphEditor(props, ref) {
    return (
      <ReactFlowProvider>
        <AutomationGraphEditorInner {...props} forwardedRef={ref} />
      </ReactFlowProvider>
    )
  },
)
export default AutomationGraphEditor

function AutomationGraphEditorInner({ automationId, graph, readOnly = false, forwardedRef }: AutomationGraphEditorProps & { forwardedRef?: React.Ref<AutomationGraphEditorHandle> }) {
  const { data: agentsData } = useAgentsQuery({ mode: 'pipeline' })
  const { data: sinksData } = useSinksQuery()
  const saveGraph = useSaveAutomationGraph()
  const agents = agentsData?.agents ?? []
  const dbSinks = sinksData?.sinks ?? []
  const { data: workspacesData } = useWorkspaces()
  const workspaces = useMemo(() =>
    ((workspacesData as Array<{ id: string; title?: string; name?: string }>) ?? []).map(ws => ({
      id: ws.id,
      name: ws.title || ws.name || ws.id,
    })),
    [workspacesData],
  )
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, fitView: rfFitView } = useReactFlow()

  // Convert graph data to React Flow format
  const initialNodes: RFNode[] = useMemo(() => {
    if (!graph?.nodes) return []
    return graph.nodes.map(n => {
      const nodeType = (n as Record<string, unknown>).node_type as string | undefined
      if (nodeType === 'constant') {
        const nodeConfig = (n as Record<string, unknown>).config as Record<string, unknown> ?? {}
        return {
          id: n.id,
          type: 'constantNode',
          position: n.position,
          data: {
            value: nodeConfig.value ?? '',
            fieldType: nodeConfig.field_type ?? 'text',
            options: nodeConfig.options as string[] | undefined,
            workspaces,
            nodeKey: n.node_key,
          },
        }
      }
      if (nodeType === 'sink') {
        const sinkType = (n as Record<string, unknown>).sink_type as string
        const sinkId = (n as Record<string, unknown>).sink_id as string | undefined
        const dbSink = sinkId ? dbSinks.find(s => s.id === sinkId) : undefined
        const sinkDef = SINK_TYPES.find(s => s.type === sinkType)
        const inputHandles = dbSink
          ? getActiveInputHandles(dbSink.sink_type, dbSink.config ?? {})
          : sinkDef?.inputHandles ?? [{ key: 'data', label: 'Data' }]
        return {
          id: n.id,
          type: 'sinkNode',
          position: n.position,
          data: {
            label: dbSink?.name ?? sinkDef?.label ?? sinkType ?? 'Sink',
            sinkType,
            sinkId,
            inputHandles,
            nodeKey: n.node_key,
          },
        }
      }
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
  }, [graph?.nodes, agents, dbSinks, workspaces])

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

  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [isDirty, setIsDirty] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)

  // Expose pending graph state to parent for save-on-create flows
  useImperativeHandle(forwardedRef, () => ({
    getPendingGraph: () => {
      if (nodes.length === 0) return null
      const allNodeIds = new Set(nodes.map(n => n.id))
      const nodeIdToKey: Record<string, string> = {}
      nodes.forEach(n => {
        nodeIdToKey[n.id] = (n.data as Record<string, unknown>).nodeKey as string || n.id
      })
      const graphNodes = nodes.map(n => {
        const data = n.data as Record<string, unknown>
        if (n.type === 'constantNode') {
          return {
            node_key: data.nodeKey as string || n.id,
            node_type: 'constant',
            position: n.position,
            config: {
              value: data.value,
              field_type: data.fieldType ?? 'text',
              options: data.options,
            },
          }
        }
        if (n.type === 'sinkNode') {
          return { node_key: data.nodeKey as string || n.id, node_type: 'sink', sink_type: data.sinkType as string, sink_id: data.sinkId as string | undefined, position: n.position, config: {} }
        }
        return { node_key: data.nodeKey as string || n.id, node_type: 'agent', agent_id: data.agentId as string, position: n.position, config: {} }
      })
      const graphEdges = edges
        .filter(e => allNodeIds.has(e.source) && allNodeIds.has(e.target))
        .map(e => ({
          source_node_key: nodeIdToKey[e.source] ?? e.source,
          source_output_key: e.sourceHandle ?? 'output',
          target_node_key: nodeIdToKey[e.target] ?? e.target,
          target_input_key: e.targetHandle ?? '',
        }))
      const staticInputs: Array<{ node_key: string; input_key: string; static_value: unknown }> = []
      return { nodes: graphNodes, edges: graphEdges, static_inputs: staticInputs }
    },
  }), [nodes, edges])

  // Wrap onNodesChange to clear selection when nodes are deleted
  const onNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeBase>[0]) => {
      const removedIds = changes
        .filter((c): c is { type: 'remove'; id: string } => c.type === 'remove')
        .map(c => c.id)
      if (removedIds.length > 0) {
        setSelectedNodeId(prev => removedIds.includes(prev ?? '') ? null : prev)
        setIsDirty(true)
      }
      onNodesChangeBase(changes)
    },
    [onNodesChangeBase],
  )

  // Sync internal state when graph/agents data loads asynchronously.
  // Uses a stable string key derived from graph identity and agent count
  // to avoid infinite re-render loops from unstable array references.
  // Guarded by !isDirty so in-progress edits are not clobbered.
  const syncKey = `${graph?.automation_id ?? ''}_${graph?.graph_version ?? 0}_${agents.length}_${dbSinks.length}`
  useEffect(() => {
    if (!isDirty) {
      setNodes(initialNodes)
      setEdges(initialEdges)
      if (initialNodes.length > 0) {
        setTimeout(() => rfFitView({ maxZoom: 1, padding: 0.3 }), 100)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey])

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: '#60a5fa' } }, eds))
      setIsDirty(true)

      // If source is a constant node, adapt its field type to the target input's type
      if (params.source) {
        const sourceNode = nodes.find(n => n.id === params.source)
        if (sourceNode?.type === 'constantNode' && params.target && params.targetHandle) {
          const targetNode = nodes.find(n => n.id === params.target)
          if (targetNode?.type === 'agentNode') {
            const targetAgentId = (targetNode.data as Record<string, unknown>).agentId as string
            const targetAgent = agents.find(a => a.id === targetAgentId)
            if (targetAgent?.input_schema) {
              const targetParam = targetAgent.input_schema.find(p => p.name === params.targetHandle)
              if (targetParam) {
                let fieldType: string = 'text'
                let options: string[] | undefined
                if (params.targetHandle === 'workspace_id') {
                  fieldType = 'workspace'
                } else if (targetParam.type === 'enum' && targetParam.options?.length) {
                  fieldType = 'select'
                  options = targetParam.options
                } else if (targetParam.type === 'number') {
                  fieldType = 'number'
                } else if (targetParam.type === 'boolean') {
                  fieldType = 'boolean'
                }
                setNodes(nds =>
                  nds.map(n =>
                    n.id === params.source
                      ? { ...n, data: { ...n.data, fieldType, options, workspaces } }
                      : n,
                  ),
                )
              }
            }
          }
          // For sink target inputs, check workspace_id special case
          if (targetNode?.type === 'sinkNode' && params.targetHandle === 'workspace_id') {
            setNodes(nds =>
              nds.map(n =>
                n.id === params.source
                  ? { ...n, data: { ...n.data, fieldType: 'workspace', workspaces } }
                  : n,
              ),
            )
          }
        }
      }
    },
    [setEdges, nodes, agents, workspaces, setNodes],
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

  const handleAddSinkNode = useCallback(
    (sinkType: SinkTypeDefinition) => {
      const nodeKey = `sink_${sinkType.type}_${nextNodeId()}`
      const newNode: RFNode = {
        id: nodeKey,
        type: 'sinkNode',
        position: { x: 500 + Math.random() * 200, y: 100 + Math.random() * 200 },
        data: {
          label: sinkType.label,
          sinkType: sinkType.type,
          inputHandles: sinkType.inputHandles,
          nodeKey,
        },
      }
      setNodes(nds => [...nds, newNode])
      setIsDirty(true)
    },
    [setNodes],
  )

  const handleAddDbSinkNode = useCallback(
    (item: SinkPaletteItem) => {
      const nodeKey = `sink_${item.sinkType}_${nextNodeId()}`
      const newNode: RFNode = {
        id: nodeKey,
        type: 'sinkNode',
        position: { x: 500 + Math.random() * 200, y: 100 + Math.random() * 200 },
        data: {
          label: item.label,
          sinkType: item.sinkType,
          sinkId: item.sinkId,
          inputHandles: item.inputHandles,
          nodeKey,
        },
      }
      setNodes(nds => [...nds, newNode])
      setIsDirty(true)
    },
    [setNodes],
  )

  const handleAddConstantNode = useCallback(
    () => {
      const nodeKey = `const_${nextNodeId()}`
      const newNode: RFNode = {
        id: nodeKey,
        type: 'constantNode',
        position: { x: 100 + Math.random() * 150, y: 100 + Math.random() * 200 },
        data: {
          value: '',
          fieldType: 'text',
          workspaces,
          nodeKey,
        },
      }
      setNodes(nds => [...nds, newNode])
      setIsDirty(true)
    },
    [setNodes, workspaces],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })

      // Try agent data first
      const agentData = event.dataTransfer.getData('application/openforge-agent')
      if (agentData) {
        try {
          const agent = JSON.parse(agentData)
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
        return
      }

      // Try sink data (may be a DB SinkPaletteItem or a legacy SinkTypeDefinition)
      const sinkData = event.dataTransfer.getData('application/openforge-sink')
      if (sinkData) {
        try {
          const sink = JSON.parse(sinkData)
          // Detect DB sink item (has sinkId) vs legacy type definition (has type)
          const sinkType = sink.sinkType ?? sink.type
          const label = sink.label ?? sinkType
          const sinkId = sink.sinkId as string | undefined
          const inputHandles = sink.inputHandles ?? [{ key: 'data', label: 'Data' }]
          const nodeKey = `sink_${sinkType}_${nextNodeId()}`
          const newNode: RFNode = {
            id: nodeKey,
            type: 'sinkNode',
            position,
            data: {
              label,
              sinkType,
              sinkId,
              inputHandles,
              nodeKey,
            },
          }
          setNodes(nds => [...nds, newNode])
          setIsDirty(true)
        } catch { /* ignore invalid data */ }
      }

      // Try constant node
      const constantData = event.dataTransfer.getData('application/openforge-constant')
      if (constantData) {
        const nodeKey = `const_${nextNodeId()}`
        const newNode: RFNode = {
          id: nodeKey,
          type: 'constantNode',
          position,
          data: {
            value: '',
            fieldType: 'text',
            workspaces,
            nodeKey,
          },
        }
        setNodes(nds => [...nds, newNode])
        setIsDirty(true)
      }
    },
    [screenToFlowPosition, setNodes, workspaces],
  )

  const onNodeClick = useCallback((_event: React.MouseEvent, node: RFNode) => {
    setSelectedNodeId(node.id)
    setContextMenu(null)
  }, [])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: RFNode) => {
    event.preventDefault()
    setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY })
  }, [])

  const onPaneClick = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
    setContextMenu(null)
    setIsDirty(true)
  }, [setNodes, setEdges, selectedNodeId])

  const handleCloseConfigPanel = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

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
    const allNodeIds = new Set(nodes.map(n => n.id))
    const nodeIdToKey: Record<string, string> = {}
    nodes.forEach(n => {
      nodeIdToKey[n.id] = (n.data as Record<string, unknown>).nodeKey as string || n.id
    })

    // Serialize all nodes (agent, sink, and constant)
    const graphNodes = nodes.map(n => {
      const data = n.data as Record<string, unknown>
      if (n.type === 'constantNode') {
        return {
          node_key: data.nodeKey as string || n.id,
          node_type: 'constant',
          position: n.position,
          config: {
            value: data.value,
            field_type: data.fieldType ?? 'text',
            options: data.options,
          },
        }
      }
      if (n.type === 'sinkNode') {
        return {
          node_key: data.nodeKey as string || n.id,
          node_type: 'sink',
          sink_type: data.sinkType as string,
          sink_id: data.sinkId as string | undefined,
          position: n.position,
          config: {},
        }
      }
      return {
        node_key: data.nodeKey as string || n.id,
        node_type: 'agent',
        agent_id: data.agentId as string,
        position: n.position,
        config: {},
      }
    })

    // Save all edges between any nodes
    const graphEdges = edges
      .filter(e => allNodeIds.has(e.source) && allNodeIds.has(e.target))
      .map(e => ({
        source_node_key: nodeIdToKey[e.source] ?? e.source,
        source_output_key: e.sourceHandle ?? 'output',
        target_node_key: nodeIdToKey[e.target] ?? e.target,
        target_input_key: e.targetHandle ?? '',
      }))

    const staticInputs: Array<{ node_key: string; input_key: string; static_value: unknown }> = []

    await saveGraph.mutateAsync({
      id: automationId,
      graph: { nodes: graphNodes, edges: graphEdges, static_inputs: staticInputs },
    })
    setIsDirty(false)
  }, [automationId, nodes, edges, saveGraph])

  return (
    <div className="flex h-full rounded-xl border border-border/25 overflow-hidden">
      {!readOnly && <NodePalette agents={agents} onAddNode={handleAddNode} onAddConstant={handleAddConstantNode} />}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        {!readOnly && isDirty && (
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
          onNodesChange={readOnly ? undefined : (changes) => {
            onNodesChange(changes)
            const meaningful = changes.some(c => c.type === 'remove' || (c.type === 'position' && 'dragging' in c && c.dragging))
            if (meaningful) setIsDirty(true)
          }}
          onEdgesChange={readOnly ? undefined : (changes) => {
            // Revert constant nodes to text when their edge is removed
            const removedEdges = changes.filter((c): c is { type: 'remove'; id: string } => c.type === 'remove')
            if (removedEdges.length > 0) {
              const removedEdgeIds = new Set(removedEdges.map(c => c.id))
              const affectedConstantIds = new Set<string>()
              for (const edge of edges) {
                if (removedEdgeIds.has(edge.id)) {
                  const sourceNode = nodes.find(n => n.id === edge.source)
                  if (sourceNode?.type === 'constantNode') {
                    affectedConstantIds.add(edge.source)
                  }
                }
              }
              if (affectedConstantIds.size > 0) {
                setNodes(nds =>
                  nds.map(n =>
                    affectedConstantIds.has(n.id)
                      ? { ...n, data: { ...n.data, fieldType: 'text', options: undefined } }
                      : n,
                  ),
                )
              }
            }
            onEdgesChange(changes)
            const meaningful = changes.some(c => c.type === 'remove' || c.type === 'add')
            if (meaningful) setIsDirty(true)
          }}
          onConnect={readOnly ? undefined : onConnect}
          onNodeClick={readOnly ? undefined : onNodeClick}
          onNodeContextMenu={readOnly ? undefined : onNodeContextMenu}
          onPaneClick={readOnly ? undefined : onPaneClick}
          onDragOver={readOnly ? undefined : onDragOver}
          onDrop={readOnly ? undefined : onDrop}
          nodeTypes={nodeTypes}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.3 }}
          onInit={(instance) => {
            // Delayed fitView ensures minimap renders correctly after nodes load
            setTimeout(() => instance.fitView({ maxZoom: 1, padding: 0.3 }), 200)
          }}
          minZoom={0.2}
          maxZoom={2}
          className="bg-background"
        >
          <Controls className="!bg-card !border-border/25 !shadow-lg" />
          <MiniMap
            className="!bg-card !border-border/25"
            nodeColor="#6366f1"
            nodeStrokeWidth={2}
            maskColor="rgba(0,0,0,0.3)"
          />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#333" />
        </ReactFlow>
      </div>
      {!readOnly && <SinkPalette onAddSinkNode={handleAddSinkNode} onAddDbSinkNode={handleAddDbSinkNode} />}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-border/25 bg-background shadow-xl py-1 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {nodes.find(n => n.id === contextMenu.nodeId)?.type === 'agentNode' && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/15 transition"
              onClick={() => {
                setSelectedNodeId(contextMenu.nodeId)
                setContextMenu(null)
              }}
            >
              Configure
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition"
            onClick={() => handleDeleteNode(contextMenu.nodeId)}
          >
            Delete
          </button>
        </div>
      )}

      {/* Node config modal — rendered outside the flex layout */}
      {!readOnly && selectedNode && selectedNode.type === 'agentNode' && selectedNodeData && (
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
          onClose={handleCloseConfigPanel}
        />
      )}
    </div>
  )
}
