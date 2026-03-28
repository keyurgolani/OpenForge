import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Cpu,
  Wrench,
  Brain,
  SlidersHorizontal,
  FileOutput,
  History,
  Search,
  Plus,
  Trash2,
  Shield,
  ShieldAlert,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/cn'
import { listProviders, listModels, getToolRegistry, listAgentVersions } from '@/lib/api'
import type {
  LlmConfig,
  ToolConfig,
  MemoryConfig,
  ParameterConfig,
  OutputDefinition,
  AgentDefinitionVersion,
} from '@/types/agents'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentConfigPanelProps {
  agentId?: string
  llmConfig: LlmConfig
  onLlmConfigChange: (config: LlmConfig) => void
  toolsConfig: ToolConfig[]
  onToolsConfigChange: (tools: ToolConfig[]) => void
  memoryConfig: MemoryConfig
  onMemoryConfigChange: (config: MemoryConfig) => void
  parameters: ParameterConfig[]
  onParametersChange: (params: ParameterConfig[]) => void
  outputDefinitions: OutputDefinition[]
  onOutputDefinitionsChange: (defs: OutputDefinition[]) => void
  onVersionSelect?: (version: AgentDefinitionVersion) => void
}

// ---------------------------------------------------------------------------
// Accordion Section
// ---------------------------------------------------------------------------

function AccordionSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: React.ElementType
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3',
          'text-left transition-colors hover:bg-bg-sunken/50',
        )}
      >
        <Icon className="h-4 w-4 text-fg-muted shrink-0" />
        <span className="font-label text-sm font-medium text-fg flex-1">{title}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-fg-subtle" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-fg-muted mb-1">{children}</label>
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'w-full rounded-lg border border-border bg-bg py-2 px-3',
        'text-sm text-fg transition-colors',
        'focus:border-primary focus:outline-none focus-ring',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      )}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (val: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer">
      <span className="text-sm text-fg">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-fg-subtle/30',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            'translate-y-0.5',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Section: LLM Configuration
// ---------------------------------------------------------------------------

function LLMSection({
  config,
  onChange,
}: {
  config: LlmConfig
  onChange: (c: LlmConfig) => void
}) {
  const { data: providersData } = useQuery({
    queryKey: ['llm-providers'],
    queryFn: listProviders,
  })

  const providers = Array.isArray(providersData) ? providersData : (providersData?.providers ?? [])

  const { data: modelsData } = useQuery({
    queryKey: ['llm-models', config.provider],
    queryFn: () => (config.provider ? listModels(config.provider) : Promise.resolve([])),
    enabled: !!config.provider,
  })

  const models = Array.isArray(modelsData) ? modelsData : (modelsData?.models ?? [])

  return (
    <AccordionSection title="LLM Configuration" icon={Cpu} defaultOpen>
      <div className="space-y-3">
        <div>
          <FieldLabel>Provider</FieldLabel>
          <SelectField
            value={config.provider ?? ''}
            onChange={(val) => onChange({ ...config, provider: val || null, model: null })}
            options={providers.map((p: any) => ({ value: p.id, label: p.name || p.provider_name }))}
            placeholder="Select a provider..."
          />
        </div>
        <div>
          <FieldLabel>Model</FieldLabel>
          <SelectField
            value={config.model ?? ''}
            onChange={(val) => onChange({ ...config, model: val || null })}
            options={models.map((m: any) => ({
              value: typeof m === 'string' ? m : m.id ?? m.model_id,
              label: typeof m === 'string' ? m : m.name ?? m.model_id ?? m.id,
            }))}
            placeholder={config.provider ? 'Select a model...' : 'Select a provider first'}
            disabled={!config.provider}
          />
        </div>
        <div>
          <FieldLabel>Temperature: {config.temperature.toFixed(1)}</FieldLabel>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={config.temperature}
              onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) })}
              className="flex-1 accent-primary"
            />
            <span className="font-mono text-xs text-fg-muted w-8 text-right">
              {config.temperature.toFixed(1)}
            </span>
          </div>
        </div>
        <div>
          <FieldLabel>Max Tokens</FieldLabel>
          <input
            type="number"
            min={1}
            value={config.max_tokens}
            onChange={(e) => onChange({ ...config, max_tokens: parseInt(e.target.value) || 0 })}
            className={cn(
              'w-full rounded-lg border border-border bg-bg py-2 px-3',
              'text-sm text-fg font-mono transition-colors',
              'focus:border-primary focus:outline-none focus-ring',
            )}
          />
        </div>
        <Toggle
          label="Allow Override"
          checked={config.allow_override}
          onChange={(val) => onChange({ ...config, allow_override: val })}
        />
      </div>
    </AccordionSection>
  )
}

// ---------------------------------------------------------------------------
// Section: Tools
// ---------------------------------------------------------------------------

interface ToolRegistryItem {
  tool_id: string
  name: string
  category: string
  description?: string
}

function ToolsSection({
  config,
  onChange,
}: {
  config: ToolConfig[]
  onChange: (c: ToolConfig[]) => void
}) {
  const [toolSearch, setToolSearch] = useState('')

  const { data: registryData } = useQuery({
    queryKey: ['tool-registry'],
    queryFn: getToolRegistry,
  })

  const registry: ToolRegistryItem[] = Array.isArray(registryData)
    ? registryData
    : (registryData?.tools ?? [])

  const configMap = new Map(config.map((t) => [t.name, t]))

  const categories = [...new Set(registry.map((t) => t.category))].sort()

  const filteredRegistry = toolSearch
    ? registry.filter(
        (t) =>
          t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
          t.category.toLowerCase().includes(toolSearch.toLowerCase()),
      )
    : registry

  const groupedTools = categories
    .map((cat) => ({
      category: cat,
      tools: filteredRegistry.filter((t) => t.category === cat),
    }))
    .filter((g) => g.tools.length > 0)

  const toggleTool = useCallback(
    (tool: ToolRegistryItem) => {
      if (configMap.has(tool.name)) {
        onChange(config.filter((t) => t.name !== tool.name))
      } else {
        onChange([...config, { name: tool.name, category: tool.category, mode: 'allowed' }])
      }
    },
    [config, configMap, onChange],
  )

  const toggleMode = useCallback(
    (toolName: string) => {
      onChange(
        config.map((t) =>
          t.name === toolName ? { ...t, mode: t.mode === 'allowed' ? 'hitl' : 'allowed' } : t,
        ),
      )
    },
    [config, onChange],
  )

  return (
    <AccordionSection title="Tools" icon={Wrench}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={toolSearch}
            onChange={(e) => setToolSearch(e.target.value)}
            placeholder="Search tools..."
            className={cn(
              'w-full rounded-lg border border-border bg-bg py-1.5 pl-8 pr-3',
              'text-xs text-fg placeholder:text-fg-subtle',
              'focus:border-primary focus:outline-none focus-ring',
            )}
          />
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {groupedTools.map((group) => (
            <div key={group.category}>
              <div className="mb-1.5 font-label text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                {group.category}
              </div>
              <div className="space-y-1">
                {group.tools.map((tool) => {
                  const selected = configMap.has(tool.name)
                  const mode = configMap.get(tool.name)?.mode
                  return (
                    <div
                      key={tool.name}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5',
                        'transition-colors',
                        selected ? 'bg-primary/5' : 'hover:bg-bg-sunken/50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleTool(tool)}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      <span className="flex-1 text-xs text-fg truncate" title={tool.name}>
                        {tool.name}
                      </span>
                      {selected && (
                        <button
                          type="button"
                          onClick={() => toggleMode(tool.name)}
                          title={mode === 'allowed' ? 'Allowed (click for HITL)' : 'HITL (click for Allowed)'}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
                            'text-[10px] font-medium transition-colors',
                            mode === 'allowed'
                              ? 'bg-success/10 text-success'
                              : 'bg-warning/10 text-warning',
                          )}
                        >
                          {mode === 'allowed' ? (
                            <Shield className="h-2.5 w-2.5" />
                          ) : (
                            <ShieldAlert className="h-2.5 w-2.5" />
                          )}
                          {mode === 'allowed' ? 'Auto' : 'HITL'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {groupedTools.length === 0 && (
            <p className="py-4 text-center text-xs text-fg-subtle">
              {toolSearch ? 'No tools match your search.' : 'No tools available.'}
            </p>
          )}
        </div>
      </div>
    </AccordionSection>
  )
}

// ---------------------------------------------------------------------------
// Section: Memory
// ---------------------------------------------------------------------------

function MemorySection({
  config,
  onChange,
}: {
  config: MemoryConfig
  onChange: (c: MemoryConfig) => void
}) {
  return (
    <AccordionSection title="Memory" icon={Brain}>
      <div className="space-y-3">
        <div>
          <FieldLabel>History Limit</FieldLabel>
          <input
            type="number"
            min={0}
            value={config.history_limit}
            onChange={(e) => onChange({ ...config, history_limit: parseInt(e.target.value) || 0 })}
            className={cn(
              'w-full rounded-lg border border-border bg-bg py-2 px-3',
              'text-sm text-fg font-mono transition-colors',
              'focus:border-primary focus:outline-none focus-ring',
            )}
          />
        </div>
        <Toggle
          label="Attachment Support"
          checked={config.attachment_support}
          onChange={(val) => onChange({ ...config, attachment_support: val })}
        />
        <Toggle
          label="Auto-bookmark URLs"
          checked={config.auto_bookmark_urls}
          onChange={(val) => onChange({ ...config, auto_bookmark_urls: val })}
        />
      </div>
    </AccordionSection>
  )
}

// ---------------------------------------------------------------------------
// Section: Parameters
// ---------------------------------------------------------------------------

const PARAM_TYPES: { value: ParameterConfig['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'enum', label: 'Enum' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
]

function ParametersSection({
  parameters,
  onChange,
}: {
  parameters: ParameterConfig[]
  onChange: (params: ParameterConfig[]) => void
}) {
  const addParameter = () => {
    onChange([
      ...parameters,
      {
        name: '',
        type: 'text',
        label: null,
        description: null,
        required: false,
        default: null,
        options: [],
      },
    ])
  }

  const updateParam = (index: number, patch: Partial<ParameterConfig>) => {
    const updated = [...parameters]
    updated[index] = { ...updated[index], ...patch }
    onChange(updated)
  }

  const removeParam = (index: number) => {
    onChange(parameters.filter((_, i) => i !== index))
  }

  return (
    <AccordionSection title="Parameters" icon={SlidersHorizontal}>
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {parameters.map((param, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 rounded-lg border border-border/50 bg-bg-sunken/30 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={param.name}
                    onChange={(e) => updateParam(idx, { name: e.target.value })}
                    placeholder="Parameter name"
                    className={cn(
                      'w-full rounded-md border border-border bg-bg py-1.5 px-2.5',
                      'text-xs text-fg font-mono placeholder:text-fg-subtle',
                      'focus:border-primary focus:outline-none focus-ring',
                    )}
                  />
                  <div className="flex gap-2">
                    <select
                      value={param.type}
                      onChange={(e) => updateParam(idx, { type: e.target.value as ParameterConfig['type'] })}
                      className={cn(
                        'rounded-md border border-border bg-bg py-1.5 px-2 text-xs text-fg',
                        'focus:border-primary focus:outline-none focus-ring',
                      )}
                    >
                      {PARAM_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={param.label ?? ''}
                      onChange={(e) => updateParam(idx, { label: e.target.value || null })}
                      placeholder="Label"
                      className={cn(
                        'flex-1 rounded-md border border-border bg-bg py-1.5 px-2.5',
                        'text-xs text-fg placeholder:text-fg-subtle',
                        'focus:border-primary focus:outline-none focus-ring',
                      )}
                    />
                  </div>
                  <input
                    type="text"
                    value={param.description ?? ''}
                    onChange={(e) => updateParam(idx, { description: e.target.value || null })}
                    placeholder="Description"
                    className={cn(
                      'w-full rounded-md border border-border bg-bg py-1.5 px-2.5',
                      'text-xs text-fg placeholder:text-fg-subtle',
                      'focus:border-primary focus:outline-none focus-ring',
                    )}
                  />
                  <div className="flex items-center gap-3">
                    <Toggle
                      label="Required"
                      checked={param.required}
                      onChange={(val) => updateParam(idx, { required: val })}
                    />
                    <input
                      type="text"
                      value={param.default != null ? String(param.default) : ''}
                      onChange={(e) => updateParam(idx, { default: e.target.value || null })}
                      placeholder="Default value"
                      className={cn(
                        'flex-1 rounded-md border border-border bg-bg py-1.5 px-2.5',
                        'text-xs text-fg font-mono placeholder:text-fg-subtle',
                        'focus:border-primary focus:outline-none focus-ring',
                      )}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeParam(idx)}
                  className="rounded-md p-1 text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <button
          type="button"
          onClick={addParameter}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border',
            'py-2 text-xs font-medium text-fg-muted',
            'hover:border-primary hover:text-primary transition-colors',
          )}
        >
          <Plus className="h-3 w-3" />
          Add Parameter
        </button>
      </div>
    </AccordionSection>
  )
}

// ---------------------------------------------------------------------------
// Section: Output Definitions
// ---------------------------------------------------------------------------

const OUTPUT_TYPES: { value: OutputDefinition['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
]

function OutputsSection({
  outputs,
  onChange,
}: {
  outputs: OutputDefinition[]
  onChange: (defs: OutputDefinition[]) => void
}) {
  const addOutput = () => {
    onChange([...outputs, { key: '', type: 'text', label: '', description: '' }])
  }

  const updateOutput = (index: number, patch: Partial<OutputDefinition>) => {
    const updated = [...outputs]
    updated[index] = { ...updated[index], ...patch }
    onChange(updated)
  }

  const removeOutput = (index: number) => {
    onChange(outputs.filter((_, i) => i !== index))
  }

  return (
    <AccordionSection title="Output Definitions" icon={FileOutput}>
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {outputs.map((output, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 rounded-lg border border-border/50 bg-bg-sunken/30 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={output.key}
                      onChange={(e) => updateOutput(idx, { key: e.target.value })}
                      placeholder="Key"
                      className={cn(
                        'flex-1 rounded-md border border-border bg-bg py-1.5 px-2.5',
                        'text-xs text-fg font-mono placeholder:text-fg-subtle',
                        'focus:border-primary focus:outline-none focus-ring',
                      )}
                    />
                    <select
                      value={output.type}
                      onChange={(e) => updateOutput(idx, { type: e.target.value as OutputDefinition['type'] })}
                      className={cn(
                        'rounded-md border border-border bg-bg py-1.5 px-2 text-xs text-fg',
                        'focus:border-primary focus:outline-none focus-ring',
                      )}
                    >
                      {OUTPUT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={output.label ?? ''}
                    onChange={(e) => updateOutput(idx, { label: e.target.value })}
                    placeholder="Label"
                    className={cn(
                      'w-full rounded-md border border-border bg-bg py-1.5 px-2.5',
                      'text-xs text-fg placeholder:text-fg-subtle',
                      'focus:border-primary focus:outline-none focus-ring',
                    )}
                  />
                  <input
                    type="text"
                    value={output.description ?? ''}
                    onChange={(e) => updateOutput(idx, { description: e.target.value })}
                    placeholder="Description"
                    className={cn(
                      'w-full rounded-md border border-border bg-bg py-1.5 px-2.5',
                      'text-xs text-fg placeholder:text-fg-subtle',
                      'focus:border-primary focus:outline-none focus-ring',
                    )}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeOutput(idx)}
                  className="rounded-md p-1 text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <button
          type="button"
          onClick={addOutput}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border',
            'py-2 text-xs font-medium text-fg-muted',
            'hover:border-primary hover:text-primary transition-colors',
          )}
        >
          <Plus className="h-3 w-3" />
          Add Output
        </button>
      </div>
    </AccordionSection>
  )
}

// ---------------------------------------------------------------------------
// Section: Version History
// ---------------------------------------------------------------------------

function VersionHistorySection({
  agentId,
  onVersionSelect,
}: {
  agentId: string
  onVersionSelect?: (version: AgentDefinitionVersion) => void
}) {
  const { data } = useQuery({
    queryKey: ['agent-versions', agentId],
    queryFn: () => listAgentVersions(agentId),
    enabled: !!agentId,
  })

  const versions = data?.versions ?? []

  return (
    <AccordionSection title="Version History" icon={History}>
      {versions.length === 0 ? (
        <p className="py-2 text-center text-xs text-fg-subtle">No versions yet. Save to create a version.</p>
      ) : (
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              onClick={() => onVersionSelect?.(version)}
              className={cn(
                'relative flex w-full items-start gap-3 rounded-md px-1 py-2',
                'text-left transition-colors hover:bg-bg-sunken/50',
              )}
            >
              <div className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary bg-bg-elevated" />
              <div className="flex-1 min-w-0">
                <div className="font-label text-xs font-medium text-fg">
                  Version {version.version}
                </div>
                <div className="text-[11px] text-fg-muted">
                  {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </AccordionSection>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AgentConfigPanel({
  agentId,
  llmConfig,
  onLlmConfigChange,
  toolsConfig,
  onToolsConfigChange,
  memoryConfig,
  onMemoryConfigChange,
  parameters,
  onParametersChange,
  outputDefinitions,
  onOutputDefinitionsChange,
  onVersionSelect,
}: AgentConfigPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated overflow-hidden">
      <div className="border-b border-border bg-bg-sunken/30 px-4 py-3">
        <h3 className="font-label text-sm font-semibold text-fg">Configuration</h3>
      </div>
      <LLMSection config={llmConfig} onChange={onLlmConfigChange} />
      <ToolsSection config={toolsConfig} onChange={onToolsConfigChange} />
      <MemorySection config={memoryConfig} onChange={onMemoryConfigChange} />
      <ParametersSection parameters={parameters} onChange={onParametersChange} />
      <OutputsSection outputs={outputDefinitions} onChange={onOutputDefinitionsChange} />
      {agentId && (
        <VersionHistorySection agentId={agentId} onVersionSelect={onVersionSelect} />
      )}
    </div>
  )
}
