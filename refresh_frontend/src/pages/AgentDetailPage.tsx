import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Save,
  Trash2,
  Tag,
  X,
  Plus,
  AlertCircle,
  Circle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { getAgent, createAgent, updateAgent, deleteAgent } from '@/lib/api'
import { agentsRoute } from '@/lib/routes'
import { useToast } from '@/components/shared/ToastProvider'
import ConfirmModal from '@/components/shared/ConfirmModal'
import AgentConfigPanel from '@/components/agents/AgentConfigPanel'
import type {
  AgentDefinition,
  AgentDefinitionCreate,
  AgentDefinitionUpdate,
  AgentDefinitionVersion,
  LlmConfig,
  ToolConfig,
  MemoryConfig,
  ParameterConfig,
  OutputDefinition,
} from '@/types/agents'

// -- CodeMirror imports (lazy) ------------------------------------------------
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { tags } from '@lezer/highlight'
import { ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// ---------------------------------------------------------------------------
// Template variable highlighting
// ---------------------------------------------------------------------------

const templateVarMark = Decoration.mark({ class: 'cm-template-var' })

function findTemplateVars(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const text = doc.toString()
  const regex = /\{\{[^}]+\}\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    builder.add(match.index, match.index + match[0].length, templateVarMark)
  }
  return builder.finish()
}

const templateHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = findTemplateVars(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = findTemplateVars(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

const templateVarTheme = EditorView.baseTheme({
  '.cm-template-var': {
    backgroundColor: 'rgba(var(--p-500) / 0.15)',
    color: 'rgb(var(--p-400))',
    borderRadius: '3px',
    padding: '0 2px',
    fontWeight: '600',
  },
})

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_LLM_CONFIG: LlmConfig = {
  provider: null,
  model: null,
  temperature: 0.7,
  max_tokens: 4096,
  allow_override: false,
}

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  history_limit: 50,
  attachment_support: true,
  auto_bookmark_urls: false,
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// System Prompt Editor
// ---------------------------------------------------------------------------

function SystemPromptEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        oneDark,
        templateHighlightPlugin,
        templateVarTheme,
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
          },
          '.cm-content': {
            minHeight: '300px',
            padding: '12px 0',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: '1px solid rgb(var(--border))',
          },
          '.cm-lineNumbers .cm-gutterElement': {
            color: 'rgb(var(--fg-subtle))',
            fontSize: '11px',
            minWidth: '3em',
          },
          '.cm-scroller': {
            overflow: 'auto',
          },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (e.g. loading agent data)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-lg border border-border bg-bg-sunken [&_.cm-editor]:min-h-[300px] [&_.cm-editor]:outline-none [&_.cm-focused]:ring-2 [&_.cm-focused]:ring-ring"
    />
  )
}

// ---------------------------------------------------------------------------
// Tags Input
// ---------------------------------------------------------------------------

function TagsInput({
  tags: tagValues,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const tag = input.trim().toLowerCase()
    if (tag && !tagValues.includes(tag)) {
      onChange([...tagValues, tag])
    }
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(tagValues.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tagValues.map((tag) => (
        <span
          key={tag}
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-0.5',
            'text-xs font-medium text-secondary',
          )}
        >
          <Tag className="h-2.5 w-2.5" />
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="rounded-full p-0.5 hover:bg-secondary/20 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder="Add tag..."
          className={cn(
            'rounded-md border border-transparent bg-transparent py-0.5 px-1.5',
            'text-xs text-fg placeholder:text-fg-subtle',
            'hover:border-border focus:border-primary focus:outline-none',
            'w-24',
          )}
        />
        <button
          type="button"
          onClick={addTag}
          className="rounded p-0.5 text-fg-subtle hover:text-primary transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const isCreate = !agentId || agentId === 'new'

  // Form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [tagValues, setTagValues] = useState<string[]>([])
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(DEFAULT_LLM_CONFIG)
  const [toolsConfig, setToolsConfig] = useState<ToolConfig[]>([])
  const [memoryConfig, setMemoryConfig] = useState<MemoryConfig>(DEFAULT_MEMORY_CONFIG)
  const [parameters, setParameters] = useState<ParameterConfig[]>([])
  const [outputDefinitions, setOutputDefinitions] = useState<OutputDefinition[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const initialSnapshotRef = useRef<string>('')

  // Fetch existing agent
  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => getAgent(agentId!),
    enabled: !isCreate,
  })

  // Populate form when agent loads
  useEffect(() => {
    if (!agent) return
    setName(agent.name)
    setSlug(agent.slug)
    setSlugManual(true)
    setDescription(agent.description ?? '')
    setSystemPrompt(agent.system_prompt)
    setTagValues(agent.tags)
    setLlmConfig(agent.llm_config)
    setToolsConfig(agent.tools_config)
    setMemoryConfig(agent.memory_config)
    setParameters(agent.parameters)
    setOutputDefinitions(agent.output_definitions)
    initialSnapshotRef.current = JSON.stringify(agent)
  }, [agent])

  // Track unsaved changes
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        name,
        slug,
        description,
        systemPrompt,
        tagValues,
        llmConfig,
        toolsConfig,
        memoryConfig,
        parameters,
        outputDefinitions,
      }),
    [name, slug, description, systemPrompt, tagValues, llmConfig, toolsConfig, memoryConfig, parameters, outputDefinitions],
  )

  useEffect(() => {
    if (isCreate) {
      setHasChanges(name.trim().length > 0)
    } else if (initialSnapshotRef.current) {
      setHasChanges(currentSnapshot !== initialSnapshotRef.current)
    }
  }, [currentSnapshot, isCreate, name])

  // Auto-slug from name
  useEffect(() => {
    if (!slugManual && name) {
      setSlug(slugify(name))
    }
  }, [name, slugManual])

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        slug,
        description: description || undefined,
        tags: tagValues,
        system_prompt: systemPrompt,
        llm_config: llmConfig,
        tools_config: toolsConfig,
        memory_config: memoryConfig,
        parameters,
        output_definitions: outputDefinitions,
      }
      if (isCreate) {
        return createAgent(payload as AgentDefinitionCreate)
      } else {
        return updateAgent(agentId!, payload as AgentDefinitionUpdate)
      }
    },
    onSuccess: (data) => {
      toast.success(isCreate ? 'Agent created' : 'Agent saved')
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['agent', data.id] })
      if (isCreate) {
        navigate(agentsRoute(data.id), { replace: true })
      } else {
        initialSnapshotRef.current = currentSnapshot
        setHasChanges(false)
      }
    },
    onError: (err: any) => {
      toast.error('Save failed', err?.response?.data?.detail ?? err.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(agentId!),
    onSuccess: () => {
      toast.success('Agent deleted')
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      navigate(agentsRoute())
    },
    onError: (err: any) => {
      toast.error('Delete failed', err?.response?.data?.detail ?? err.message)
    },
  })

  const handleVersionSelect = useCallback(
    (version: AgentDefinitionVersion) => {
      const snap = version.snapshot as Record<string, any>
      if (snap.name) setName(snap.name)
      if (snap.slug) setSlug(snap.slug)
      if (snap.description !== undefined) setDescription(snap.description ?? '')
      if (snap.system_prompt !== undefined) setSystemPrompt(snap.system_prompt)
      if (snap.tags) setTagValues(snap.tags)
      if (snap.llm_config) setLlmConfig(snap.llm_config as LlmConfig)
      if (snap.tools_config) setToolsConfig(snap.tools_config as ToolConfig[])
      if (snap.memory_config) setMemoryConfig(snap.memory_config as MemoryConfig)
      if (snap.parameters) setParameters(snap.parameters as ParameterConfig[])
      if (snap.output_definitions) setOutputDefinitions(snap.output_definitions as OutputDefinition[])
      toast.info(`Loaded version ${version.version}`, 'Save to apply these changes.')
    },
    [toast],
  )

  if (!isCreate && isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 rounded bg-bg-sunken" />
          <div className="flex gap-6">
            <div className="flex-[3] space-y-4">
              <div className="h-10 rounded bg-bg-sunken" />
              <div className="h-6 w-32 rounded bg-bg-sunken" />
              <div className="h-24 rounded bg-bg-sunken" />
              <div className="h-64 rounded bg-bg-sunken" />
            </div>
            <div className="flex-[2] space-y-4">
              <div className="h-80 rounded bg-bg-sunken" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(agentsRoute())}
            className="rounded-lg p-2 text-fg-muted hover:text-fg hover:bg-bg-sunken transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg font-bold text-fg">
              {isCreate ? 'New Agent' : 'Edit Agent'}
            </h1>
            {hasChanges && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5"
              >
                <Circle className="h-2 w-2 fill-warning text-warning" />
                <span className="text-[10px] font-medium text-warning">Unsaved</span>
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TagsInput tags={tagValues} onChange={setTagValues} />
          {!isCreate && (
            <button
              onClick={() => setDeleteOpen(true)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium text-danger',
                'hover:bg-danger/10 transition-colors focus-ring',
              )}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !name.trim()}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
              'text-sm font-medium text-fg-on-primary',
              'hover:bg-primary-hover transition-colors focus-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left column: Main form */}
        <div className="flex-[3] space-y-5 min-w-0">
          {/* Name */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name..."
              className={cn(
                'w-full bg-transparent font-display text-2xl font-bold text-fg',
                'border-none outline-none placeholder:text-fg-subtle/50',
              )}
            />
          </div>

          {/* Slug */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-subtle font-label">Slug:</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugManual(true)
              }}
              placeholder="auto-generated-slug"
              className={cn(
                'rounded-md border border-border/50 bg-bg-sunken/30 px-2 py-1',
                'font-mono text-xs text-fg-muted',
                'focus:border-primary focus:outline-none focus-ring',
              )}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block font-label text-xs font-medium text-fg-muted mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              rows={3}
              className={cn(
                'w-full rounded-lg border border-border bg-bg-elevated p-3',
                'text-sm text-fg placeholder:text-fg-subtle resize-y',
                'focus:border-primary focus:outline-none focus-ring',
              )}
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block font-label text-xs font-medium text-fg-muted mb-1.5">
              System Prompt
            </label>
            <p className="text-[11px] text-fg-subtle mb-2">
              Use {'{{variable}}'} syntax for template variables. They will be highlighted in the editor.
            </p>
            <SystemPromptEditor value={systemPrompt} onChange={setSystemPrompt} />
          </div>
        </div>

        {/* Right column: Config panel */}
        <div className="flex-[2] min-w-[340px]">
          <AgentConfigPanel
            agentId={isCreate ? undefined : agentId}
            llmConfig={llmConfig}
            onLlmConfigChange={setLlmConfig}
            toolsConfig={toolsConfig}
            onToolsConfigChange={setToolsConfig}
            memoryConfig={memoryConfig}
            onMemoryConfigChange={setMemoryConfig}
            parameters={parameters}
            onParametersChange={setParameters}
            outputDefinitions={outputDefinitions}
            onOutputDefinitionsChange={setOutputDefinitions}
            onVersionSelect={handleVersionSelect}
          />
        </div>
      </div>

      {/* Delete confirm */}
      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Agent"
        description={`Are you sure you want to delete "${name}"? This action cannot be undone. Any automations referencing this agent may break.`}
        confirmLabel="Delete Agent"
        variant="danger"
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
