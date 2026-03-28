import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import * as Tabs from '@radix-ui/react-tabs'
import {
  ArrowLeft,
  Save,
  Cog,
  Rocket,
  Play,
  Circle,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/cn'
import {
  getAutomation,
  updateAutomation,
  compileAutomation,
  deployAutomation,
  getAutomationGraph,
  saveAutomationGraph,
  listRuns,
} from '@/lib/api'
import { automationsRoute, runsRoute } from '@/lib/routes'
import type { Automation, AutomationUpdate, AutomationGraph } from '@/types/automations'
import type { Run } from '@/types/runs'
import StatusBadge from '@/components/shared/StatusBadge'
import { useToast } from '@/components/shared/ToastProvider'
import AutomationGraphEditor from '@/components/automations/AutomationGraphEditor'

// -- CodeMirror for JSON editors -------------------------------------------
import { EditorView, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { keymap } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'

// ---------------------------------------------------------------------------
// JSON Editor
// ---------------------------------------------------------------------------

function JsonEditor({
  value,
  onChange,
  label,
}: {
  value: Record<string, unknown>
  onChange: (val: Record<string, unknown>) => void
  label: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [error, setError] = useState<string | null>(null)

  const stringValue = useMemo(() => JSON.stringify(value, null, 2), [value])

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const text = update.state.doc.toString()
        try {
          const parsed = JSON.parse(text)
          setError(null)
          onChangeRef.current(parsed)
        } catch {
          setError('Invalid JSON')
        }
      }
    })

    const state = EditorState.create({
      doc: stringValue,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        json(),
        oneDark,
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { fontSize: '12px', fontFamily: 'var(--font-mono)' },
          '.cm-content': { minHeight: '120px', padding: '8px 0' },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: '1px solid rgb(var(--border))',
          },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== stringValue) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: stringValue },
      })
    }
  }, [stringValue])

  return (
    <div className="space-y-1.5">
      <label className="block font-label text-xs font-medium text-fg-muted">{label}</label>
      <div
        ref={containerRef}
        className={cn(
          'overflow-hidden rounded-lg border bg-bg-sunken',
          error ? 'border-danger' : 'border-border',
          '[&_.cm-editor]:outline-none [&_.cm-focused]:ring-2 [&_.cm-focused]:ring-ring',
        )}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Runs list
// ---------------------------------------------------------------------------

function RunsTab({ automationId }: { automationId: string }) {
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['automation-runs', automationId],
    queryFn: () => listRuns({ automation_id: automationId, limit: 50 }),
  })

  const runs: Run[] = data?.runs ?? []

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-bg-sunken" />
        ))}
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Play className="h-10 w-10 text-fg-subtle mb-3" />
        <p className="font-label text-sm font-medium text-fg">No runs yet</p>
        <p className="text-xs text-fg-muted mt-1">
          Compile and deploy this automation to trigger runs.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/50">
      {runs.map((run) => (
        <button
          key={run.id}
          onClick={() => navigate(runsRoute(run.id))}
          className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-bg-sunken/50 transition-colors"
        >
          <StatusBadge status={run.status} />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-xs text-fg-muted truncate">{run.id}</div>
          </div>
          <span className="text-xs text-fg-subtle">
            {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
          </span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AutomationDetailPage() {
  const { automationId } = useParams<{ automationId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({})
  const [budgetConfig, setBudgetConfig] = useState<Record<string, unknown>>({})
  const [outputConfig, setOutputConfig] = useState<Record<string, unknown>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const initialRef = useRef('')

  // Fetch automation
  const { data: automation, isLoading } = useQuery({
    queryKey: ['automation', automationId],
    queryFn: () => getAutomation(automationId!),
    enabled: !!automationId,
  })

  // Fetch graph
  const { data: graph } = useQuery({
    queryKey: ['automation-graph', automationId],
    queryFn: () => getAutomationGraph(automationId!),
    enabled: !!automationId,
  })

  // Populate form
  useEffect(() => {
    if (!automation) return
    setName(automation.name)
    setDescription(automation.description ?? '')
    setTriggerConfig(automation.trigger_config ?? {})
    setBudgetConfig(automation.budget_config ?? {})
    setOutputConfig(automation.output_config ?? {})
    initialRef.current = JSON.stringify({
      name: automation.name,
      description: automation.description ?? '',
      triggerConfig: automation.trigger_config ?? {},
      budgetConfig: automation.budget_config ?? {},
      outputConfig: automation.output_config ?? {},
    })
  }, [automation])

  // Track changes
  const currentSnap = useMemo(
    () =>
      JSON.stringify({
        name,
        description,
        triggerConfig,
        budgetConfig,
        outputConfig,
      }),
    [name, description, triggerConfig, budgetConfig, outputConfig],
  )

  useEffect(() => {
    if (initialRef.current) {
      setHasChanges(currentSnap !== initialRef.current)
    }
  }, [currentSnap])

  // Mutations
  const saveMut = useMutation({
    mutationFn: () =>
      updateAutomation(automationId!, {
        name,
        description: description || undefined,
        trigger_config: triggerConfig,
        budget_config: budgetConfig,
        output_config: outputConfig,
      } as AutomationUpdate),
    onSuccess: () => {
      toast.success('Automation saved')
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] })
      initialRef.current = currentSnap
      setHasChanges(false)
    },
    onError: (err: any) => toast.error('Save failed', err?.response?.data?.detail ?? err.message),
  })

  const compileMut = useMutation({
    mutationFn: () => compileAutomation(automationId!),
    onSuccess: () => {
      toast.success('Compilation started')
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] })
    },
    onError: (err: any) => toast.error('Compile failed', err?.response?.data?.detail ?? err.message),
  })

  const deployMut = useMutation({
    mutationFn: () =>
      deployAutomation(automationId!, {
        workspace_id: '',
        input_values: {},
      }),
    onSuccess: () => {
      toast.success('Deployment started')
      queryClient.invalidateQueries({ queryKey: ['automation', automationId] })
    },
    onError: (err: any) => toast.error('Deploy failed', err?.response?.data?.detail ?? err.message),
  })

  const saveGraphMut = useMutation({
    mutationFn: (g: { nodes: unknown[]; edges: unknown[]; static_inputs: unknown[] }) =>
      saveAutomationGraph(automationId!, g),
    onSuccess: () => {
      toast.success('Graph saved')
      queryClient.invalidateQueries({ queryKey: ['automation-graph', automationId] })
    },
    onError: (err: any) => toast.error('Graph save failed', err?.response?.data?.detail ?? err.message),
  })

  const handleGraphSave = useCallback(
    (nodes: unknown[], edges: unknown[], staticInputs: unknown[]) => {
      saveGraphMut.mutate({ nodes, edges, static_inputs: staticInputs })
    },
    [saveGraphMut],
  )

  if (isLoading || !automation) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 rounded bg-bg-sunken" />
          <div className="h-[600px] rounded bg-bg-sunken" />
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
            onClick={() => navigate(automationsRoute())}
            className="rounded-lg p-2 text-fg-muted hover:text-fg hover:bg-bg-sunken transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(
                'bg-transparent font-display text-xl font-bold text-fg',
                'border-none outline-none placeholder:text-fg-subtle/50',
              )}
            />
            <StatusBadge status={automation.status} />
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
          <button
            onClick={() => compileMut.mutate()}
            disabled={compileMut.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2',
              'text-xs font-medium text-fg',
              'hover:bg-bg-sunken transition-colors focus-ring',
              'disabled:opacity-50',
            )}
          >
            <Cog className="h-3.5 w-3.5" />
            Compile
          </button>
          <button
            onClick={() => deployMut.mutate()}
            disabled={deployMut.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2',
              'text-xs font-medium text-fg',
              'hover:bg-bg-sunken transition-colors focus-ring',
              'disabled:opacity-50',
            )}
          >
            <Rocket className="h-3.5 w-3.5" />
            Deploy
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !hasChanges}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2',
              'text-sm font-medium text-fg-on-primary',
              'hover:bg-primary-hover transition-colors focus-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Save className="h-4 w-4" />
            {saveMut.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Description */}
      <div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Automation description..."
          rows={2}
          className={cn(
            'w-full rounded-lg border border-border bg-bg-elevated p-3',
            'text-sm text-fg placeholder:text-fg-subtle resize-none',
            'focus:border-primary focus:outline-none focus-ring',
          )}
        />
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="graph">
        <Tabs.List className="flex items-center gap-0 border-b border-border">
          {[
            { value: 'graph', label: 'Graph Editor' },
            { value: 'config', label: 'Configuration' },
            { value: 'runs', label: 'Runs' },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium text-fg-muted',
                'transition-colors hover:text-fg',
                'data-[state=active]:text-fg',
                'focus-visible:outline-none',
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'absolute bottom-0 left-0 right-0 h-0.5 rounded-full',
                  'bg-primary opacity-0 transition-opacity',
                  'data-[state=active]:opacity-100',
                )}
                data-state="inherit"
              />
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="graph" className="pt-4 focus-visible:outline-none">
          <div className="rounded-xl border border-border bg-bg-elevated overflow-hidden" style={{ height: '600px' }}>
            <AutomationGraphEditor
              graph={graph as AutomationGraph | undefined}
              onSave={handleGraphSave}
            />
          </div>
        </Tabs.Content>

        <Tabs.Content value="config" className="pt-4 focus-visible:outline-none">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <JsonEditor
              label="Trigger Configuration"
              value={triggerConfig}
              onChange={setTriggerConfig}
            />
            <JsonEditor
              label="Budget Configuration"
              value={budgetConfig}
              onChange={setBudgetConfig}
            />
            <JsonEditor
              label="Output Configuration"
              value={outputConfig}
              onChange={setOutputConfig}
            />
          </div>
        </Tabs.Content>

        <Tabs.Content value="runs" className="pt-4 focus-visible:outline-none">
          <div className="rounded-xl border border-border bg-bg-elevated overflow-hidden">
            <RunsTab automationId={automationId!} />
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
