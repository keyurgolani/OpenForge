/**
 * PipelineFlowGraph — SVG+HTML pipeline DAG visualization.
 *
 * Renders extraction slots as interactive nodes connected by curved bezier
 * arrows. Parallel slots stack vertically at the same X level (fan-out /
 * fan-in). Sequential slots flow left-to-right. Post-processing system
 * steps render as muted terminal nodes.
 *
 * Configurable nodes expand in-place to show a scrollable option picker
 * for each config field.
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import { Settings2, Check } from 'lucide-react'

// ── Layout constants ────────────────────────────────────────────────────────

const NODE_W = 138
const NODE_H = 38
const POST_W = 108
const POST_H = 26
const SOURCE_W = 62
const SOURCE_H = 30
const H_GAP = 52
const V_GAP = 8
const PAD = 20
const ARROW_SIZE = 4

// ── Types ───────────────────────────────────────────────────────────────────

export interface SlotData {
    slot_type: string
    display_name: string
    enabled: boolean
    active_backend: string
    available_backends: string[]
    execution: string
    timeout_seconds: number
    produces_vectors: boolean
    backend_config: Record<string, any>
}

export interface PostStep {
    name: string
    description: string
    toggleable?: boolean
    enabled?: boolean
    config_key?: string | null
}

interface SchemaField {
    label: string
    type: 'text' | 'select' | 'toggle'
    description?: string
    default?: any
    options?: string[]
}

export interface BackendSchema {
    label: string
    fields: Record<string, SchemaField>
}

interface LayoutNode {
    id: string
    label: string
    sublabel?: string
    x: number
    y: number
    w: number
    h: number
    kind: 'source' | 'slot' | 'post'
    enabled?: boolean
    configurable?: boolean
    toggleable?: boolean
    configKey?: string | null
    tooltip?: string
    slotType?: string
}

interface LayoutEdge {
    from: string
    to: string
    muted: boolean
}

interface Layout {
    nodes: LayoutNode[]
    edges: LayoutEdge[]
    width: number
    height: number
}

// ── Layout computation ──────────────────────────────────────────────────────

function computeLayout(
    slots: SlotData[],
    postSteps: PostStep[],
    configurableBackends: Set<string>,
): Layout {
    const parallel = slots.filter(s => s.execution !== 'sequential')
    const sequential = slots.filter(s => s.execution === 'sequential')

    const parallelH = parallel.length > 0
        ? parallel.length * NODE_H + (parallel.length - 1) * V_GAP
        : NODE_H
    const centerY = Math.max(parallelH, NODE_H) / 2 + PAD

    const nodes: LayoutNode[] = []
    const edges: LayoutEdge[] = []
    let cursorX = PAD

    // Source
    const sourceId = '__source__'
    nodes.push({
        id: sourceId, label: 'Content',
        x: cursorX, y: centerY - SOURCE_H / 2, w: SOURCE_W, h: SOURCE_H,
        kind: 'source',
    })
    cursorX += SOURCE_W + H_GAP

    // Parallel slots
    let prevIds: string[] = [sourceId]
    if (parallel.length > 0) {
        const startY = centerY - parallelH / 2
        const parallelIds: string[] = []
        for (let i = 0; i < parallel.length; i++) {
            const s = parallel[i]
            const id = `slot:${s.slot_type}`
            nodes.push({
                id, label: s.display_name, sublabel: s.active_backend,
                x: cursorX, y: startY + i * (NODE_H + V_GAP), w: NODE_W, h: NODE_H,
                kind: 'slot', enabled: s.enabled,
                configurable: configurableBackends.has(s.active_backend),
                slotType: s.slot_type,
            })
            parallelIds.push(id)
            for (const prev of prevIds) edges.push({ from: prev, to: id, muted: !s.enabled })
        }
        cursorX += NODE_W + H_GAP
        prevIds = parallelIds
    }

    // Sequential slots
    for (const s of sequential) {
        const id = `slot:${s.slot_type}`
        nodes.push({
            id, label: s.display_name, sublabel: s.active_backend,
            x: cursorX, y: centerY - NODE_H / 2, w: NODE_W, h: NODE_H,
            kind: 'slot', enabled: s.enabled,
            configurable: configurableBackends.has(s.active_backend),
            slotType: s.slot_type,
        })
        for (const prev of prevIds) edges.push({ from: prev, to: id, muted: !s.enabled })
        cursorX += NODE_W + H_GAP
        prevIds = [id]
    }

    // Post-processing
    for (const step of postSteps) {
        const id = `post:${step.name}`
        nodes.push({
            id, label: step.name,
            x: cursorX, y: centerY - POST_H / 2, w: POST_W, h: POST_H,
            kind: 'post', tooltip: step.description,
            toggleable: step.toggleable, enabled: step.enabled ?? true, configKey: step.config_key,
        })
        for (const prev of prevIds) edges.push({ from: prev, to: id, muted: true })
        cursorX += POST_W + H_GAP * 0.55
        prevIds = [id]
    }

    return { nodes, edges, width: cursorX + PAD, height: Math.max(parallelH + PAD * 2, NODE_H + PAD * 2) }
}

// ── Bezier edge ─────────────────────────────────────────────────────────────

function BezierEdge({ from, to, muted, nodes }: {
    from: string; to: string; muted: boolean; nodes: Map<string, LayoutNode>
}) {
    const a = nodes.get(from)
    const b = nodes.get(to)
    if (!a || !b) return null

    const x1 = a.x + a.w, y1 = a.y + a.h / 2
    const x2 = b.x, y2 = b.y + b.h / 2
    const cpOffset = Math.max((x2 - x1) * 0.45, 20)
    const d = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`

    const angle = Math.atan2(0, cpOffset)
    const ax1 = x2 - ARROW_SIZE * Math.cos(angle - Math.PI / 6)
    const ay1 = y2 - ARROW_SIZE * Math.sin(angle - Math.PI / 6)
    const ax2 = x2 - ARROW_SIZE * Math.cos(angle + Math.PI / 6)
    const ay2 = y2 - ARROW_SIZE * Math.sin(angle + Math.PI / 6)

    const color = muted ? 'hsl(var(--muted-foreground) / 0.25)' : 'hsl(var(--accent) / 0.45)'

    return (
        <g>
            <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
            <polygon points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={color} />
        </g>
    )
}

// ── Source & post nodes ─────────────────────────────────────────────────────

function SourceNode({ node }: { node: LayoutNode }) {
    return (
        <div
            className="flex items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent"
            style={{ width: node.w, height: node.h }}
        >
            <span className="text-[10px] font-semibold">{node.label}</span>
        </div>
    )
}

function PostNode({ node, knowledgeType, saving, onToggle }: {
    node: LayoutNode
    knowledgeType: string
    saving: boolean
    onToggle?: (kt: string, configKey: string, enabled: boolean) => Promise<void>
}) {
    const enabled = node.enabled !== false

    if (node.toggleable && node.configKey && onToggle) {
        return (
            <button
                onClick={() => { void onToggle(knowledgeType, node.configKey!, enabled) }}
                disabled={saving}
                className={`flex items-center justify-center gap-1 rounded-lg border transition-colors disabled:opacity-60 ${
                    enabled
                        ? 'border-dashed border-accent/25 bg-accent/5 text-accent/60 hover:bg-accent/10'
                        : 'border-dashed border-border/20 bg-muted/5 text-muted-foreground/30 hover:bg-muted/10'
                }`}
                style={{ width: node.w, height: node.h }}
                title={`${enabled ? 'Disable' : 'Enable'} ${node.label}: ${node.tooltip}`}
            >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    enabled ? 'bg-accent/50' : 'bg-muted-foreground/20'
                }`} />
                <span className="text-[9px] whitespace-nowrap">{node.label}</span>
            </button>
        )
    }

    return (
        <div
            className="flex items-center justify-center rounded-lg border border-dashed border-border/25 bg-muted/5 text-muted-foreground/50"
            style={{ width: node.w, height: node.h }}
            title={node.tooltip}
        >
            <span className="text-[9px] whitespace-nowrap">{node.label}</span>
        </div>
    )
}

// ── Slot graph node with in-place expansion ─────────────────────────────────

function SlotGraphNode({ node, slot, schema, knowledgeType, expanded, saving, onToggle, onExpand, onUpdateConfig }: {
    node: LayoutNode
    slot: SlotData
    schema?: BackendSchema
    knowledgeType: string
    expanded: boolean
    saving: boolean
    onToggle: (kt: string, st: string, enabled: boolean) => Promise<void>
    onExpand: () => void
    onUpdateConfig: (kt: string, st: string, key: string, value: any) => Promise<void>
}) {
    const enabled = node.enabled !== false
    const fields = schema ? Object.entries(schema.fields) : []
    const hasConfig = fields.length > 0

    return (
        <div
            className={`rounded-lg border transition-all duration-200 ${
                expanded
                    ? 'shadow-lg border-accent/40 bg-card'
                    : enabled
                        ? 'border-accent/30 bg-accent/10'
                        : 'border-border/25 bg-muted/15'
            }`}
            style={{
                width: expanded ? Math.max(node.w, 180) : node.w,
                transition: 'width 200ms ease, box-shadow 200ms ease',
            }}
        >
            {/* Collapsed header — always visible */}
            <div className="flex items-stretch" style={{ height: node.h }}>
                <button
                    onClick={() => { void onToggle(knowledgeType, node.slotType!, enabled) }}
                    disabled={saving}
                    className={`flex-1 flex items-center gap-1.5 px-2 min-w-0 transition-colors disabled:opacity-60 ${
                        hasConfig ? 'rounded-l-lg' : 'rounded-lg'
                    } hover:bg-accent/10`}
                    title={`${enabled ? 'Disable' : 'Enable'} ${node.label}`}
                >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        enabled ? 'bg-accent shadow-[0_0_4px_rgba(var(--accent-rgb),0.5)]' : 'bg-muted-foreground/30'
                    }`} />
                    <div className="flex flex-col items-start min-w-0">
                        <span className={`text-[10px] font-medium leading-tight truncate max-w-full ${
                            enabled ? 'text-accent' : 'text-muted-foreground/60'
                        }`}>{node.label}</span>
                        <span className="text-[8px] text-muted-foreground/50 leading-tight truncate max-w-full">{node.sublabel}</span>
                    </div>
                </button>
                {hasConfig && !expanded && (
                    <button
                        onClick={onExpand}
                        disabled={saving}
                        className={`flex items-center px-1.5 border-l transition-colors rounded-r-lg disabled:opacity-60 ${
                            enabled
                                ? 'border-accent/15 text-accent/60 hover:bg-accent/10 hover:text-accent'
                                : 'border-border/15 text-muted-foreground/40 hover:bg-muted/20'
                        }`}
                        title="Configure"
                    >
                        <Settings2 className="w-2.5 h-2.5" />
                    </button>
                )}
            </div>

            {/* Expanded config fields */}
            {expanded && hasConfig && (
                <div className="border-t border-accent/15 px-2 pb-2 pt-1.5 space-y-1.5">
                    {fields.map(([key, field]) => (
                        <ConfigField
                            key={key}
                            fieldKey={key}
                            field={field}
                            currentValue={slot.backend_config?.[key] ?? field.default ?? ''}
                            saving={saving}
                            onSelect={(value) => {
                                void onUpdateConfig(knowledgeType, node.slotType!, key, value)
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Config field with spinner-picker for selects ────────────────────────────

function ConfigField({ fieldKey, field, currentValue, saving, onSelect }: {
    fieldKey: string
    field: SchemaField
    currentValue: any
    saving: boolean
    onSelect: (value: any) => void
}) {
    const listRef = useRef<HTMLDivElement>(null)

    // Auto-scroll selected option into view on mount
    useEffect(() => {
        if (listRef.current) {
            const active = listRef.current.querySelector('[data-active="true"]')
            if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
    }, [])

    if (field.type === 'select' && field.options) {
        const options = field.options
        const needsScroll = options.length > 4

        return (
            <div>
                <p className="text-[8px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">{field.label}</p>
                <div
                    ref={listRef}
                    className={`rounded-md border border-border/20 bg-card/80 ${needsScroll ? 'max-h-[88px] overflow-y-auto' : ''}`}
                >
                    {options.map(opt => {
                        const active = String(currentValue) === opt
                        return (
                            <button
                                key={opt}
                                data-active={active}
                                disabled={saving}
                                onClick={() => { if (!active) onSelect(opt) }}
                                className={`w-full flex items-center justify-between gap-1 px-2 py-[3px] text-[9px] transition-colors disabled:opacity-60 ${
                                    active
                                        ? 'bg-accent/15 text-accent font-medium'
                                        : 'text-foreground/70 hover:bg-muted/40'
                                } ${opt === options[0] ? 'rounded-t-md' : ''} ${opt === options[options.length - 1] ? 'rounded-b-md' : ''}`}
                            >
                                <span className="truncate">{opt}</span>
                                {active && <Check className="w-2.5 h-2.5 flex-shrink-0 text-accent" />}
                            </button>
                        )
                    })}
                </div>
            </div>
        )
    }

    // Text input fallback
    return (
        <div>
            <p className="text-[8px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">{field.label}</p>
            <input
                type="text"
                defaultValue={currentValue}
                onBlur={e => { if (e.target.value !== String(currentValue)) onSelect(e.target.value) }}
                disabled={saving}
                className="w-full text-[9px] bg-card/80 border border-border/20 rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-60"
            />
            {field.description && (
                <p className="text-[7px] text-muted-foreground/50 mt-0.5 leading-tight">{field.description}</p>
            )}
        </div>
    )
}

// ── Main component ──────────────────────────────────────────────────────────

interface PipelineFlowGraphProps {
    slots: SlotData[]
    postSteps: PostStep[]
    knowledgeType: string
    schemas: Record<string, BackendSchema>
    configurableBackends: Set<string>
    saving: boolean
    openConfig: string | null
    onToggle: (kt: string, st: string, enabled: boolean) => Promise<void>
    onToggleConfig: (key: string) => void
    onUpdateConfig: (kt: string, st: string, key: string, value: any) => Promise<void>
    onTogglePostStep: (kt: string, configKey: string, enabled: boolean) => Promise<void>
}

export default function PipelineFlowGraph({
    slots, postSteps, knowledgeType, schemas, configurableBackends,
    saving, openConfig, onToggle, onToggleConfig, onUpdateConfig, onTogglePostStep,
}: PipelineFlowGraphProps) {
    const layout = useMemo(
        () => computeLayout(slots, postSteps, configurableBackends),
        [slots, postSteps, configurableBackends],
    )

    const nodeMap = useMemo(() => {
        const m = new Map<string, LayoutNode>()
        for (const n of layout.nodes) m.set(n.id, n)
        return m
    }, [layout.nodes])

    const slotMap = useMemo(() => {
        const m = new Map<string, SlotData>()
        for (const s of slots) m.set(s.slot_type, s)
        return m
    }, [slots])

    // Close expanded node on outside click
    const containerRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!openConfig) return
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onToggleConfig(openConfig)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [openConfig, onToggleConfig])

    return (
        <div className={openConfig ? 'overflow-visible' : 'overflow-x-auto'} ref={containerRef}>
            <div className="relative" style={{ width: layout.width, height: layout.height }}>
                {/* SVG edge layer */}
                <svg className="absolute inset-0 pointer-events-none" width={layout.width} height={layout.height}>
                    {layout.edges.map((e, i) => (
                        <BezierEdge key={i} from={e.from} to={e.to} muted={e.muted} nodes={nodeMap} />
                    ))}
                </svg>

                {/* HTML node layer — positioned at node center with translate(-50%,-50%) so expansion grows outward equally */}
                {layout.nodes.map(node => {
                    const isExpanded = openConfig === `${knowledgeType}:${node.slotType}`
                    return (
                        <div
                            key={node.id}
                            className="absolute"
                            style={{
                                left: node.x + node.w / 2,
                                top: node.y + node.h / 2,
                                transform: 'translate(-50%, -50%)',
                                zIndex: isExpanded ? 50 : undefined,
                            }}
                        >
                            {node.kind === 'source' && <SourceNode node={node} />}
                            {node.kind === 'slot' && (
                                <SlotGraphNode
                                    node={node}
                                    slot={slotMap.get(node.slotType!) ?? slots[0]}
                                    schema={schemas[slotMap.get(node.slotType!)?.active_backend ?? '']}
                                    knowledgeType={knowledgeType}
                                    expanded={isExpanded}
                                    saving={saving}
                                    onToggle={onToggle}
                                    onExpand={() => onToggleConfig(`${knowledgeType}:${node.slotType}`)}
                                    onUpdateConfig={onUpdateConfig}
                                />
                            )}
                            {node.kind === 'post' && (
                            <PostNode
                                node={node}
                                knowledgeType={knowledgeType}
                                saving={saving}
                                onToggle={onTogglePostStep}
                            />
                        )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
