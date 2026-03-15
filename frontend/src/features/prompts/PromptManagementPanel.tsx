import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Eye, Loader2, Save, Search, Sparkles, Wand2 } from 'lucide-react'

import CodeMirrorPromptEditor from '@/components/shared/CodeMirrorPromptEditor'
import { listManagedPrompts, listPromptVersions, previewManagedPrompt, updateManagedPrompt } from '@/lib/api'
import type { ManagedPrompt, PromptPreviewResult, PromptVersion } from '@/types/trust'

function formatStamp(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

export default function PromptManagementPanel() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [templateDraft, setTemplateDraft] = useState('')
  const [variableSchemaDraft, setVariableSchemaDraft] = useState('{}')
  const [previewVariables, setPreviewVariables] = useState('{}')
  const [previewResult, setPreviewResult] = useState<PromptPreviewResult | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ prompts: ManagedPrompt[]; total: number }>({
    queryKey: ['managed-prompts'],
    queryFn: () => listManagedPrompts({ limit: 200 }),
  })

  const prompts = data?.prompts ?? []
  const filteredPrompts = prompts.filter((prompt) => {
    const haystack = `${prompt.name} ${prompt.slug} ${prompt.owner_type} ${prompt.owner_id ?? ''}`.toLowerCase()
    return haystack.includes(search.toLowerCase())
  })
  const selectedPrompt = filteredPrompts.find((prompt) => prompt.id === selectedId) ?? filteredPrompts[0] ?? null

  const { data: versions = [] } = useQuery<PromptVersion[]>({
    queryKey: ['prompt-versions', selectedPrompt?.id],
    queryFn: () => listPromptVersions(selectedPrompt!.id),
    enabled: !!selectedPrompt?.id,
  })

  useEffect(() => {
    if (!selectedPrompt) return
    setSelectedId(selectedPrompt.id)
    setTemplateDraft(selectedPrompt.template)
    setVariableSchemaDraft(JSON.stringify(selectedPrompt.variable_schema, null, 2))
    setPreviewResult(null)
    setSaveError(null)
    setPreviewError(null)
  }, [selectedPrompt?.id])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPrompt) return
      let variableSchema
      try {
        variableSchema = JSON.parse(variableSchemaDraft)
      } catch {
        throw new Error('Variable schema must be valid JSON.')
      }
      return updateManagedPrompt(selectedPrompt.id, {
        template: templateDraft,
        variable_schema: variableSchema,
      })
    },
    onSuccess: async () => {
      setSaveError(null)
      await qc.invalidateQueries({ queryKey: ['managed-prompts'] })
      await qc.invalidateQueries({ queryKey: ['prompt-versions', selectedPrompt?.id] })
    },
    onError: (error: Error) => {
      setSaveError(error.message)
    },
  })

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPrompt) return null
      let variables
      try {
        variables = JSON.parse(previewVariables)
      } catch {
        throw new Error('Preview inputs must be valid JSON.')
      }
      return previewManagedPrompt(selectedPrompt.id, {
        version: versions[0]?.version ?? selectedPrompt.version,
        variables,
      })
    },
    onSuccess: (result: PromptPreviewResult | null) => {
      setPreviewError(null)
      setPreviewResult(result)
    },
    onError: (error: Error) => {
      setPreviewResult(null)
      setPreviewError(error.message)
    },
  })

  return (
    <div className="space-y-5">
      <div className="glass-card rounded-2xl border-accent/20 bg-accent/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Managed Prompts</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Prompts are versioned resources with explicit owners, validated variables, and previewable rendering.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)]">
        <section className="glass-card rounded-2xl p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pl-9 text-sm"
              placeholder="Search managed prompts..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="mt-4 space-y-2">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && filteredPrompts.length === 0 && (
              <div className="rounded-xl border border-border/40 bg-background/20 px-4 py-8 text-center text-sm text-muted-foreground">
                No managed prompts matched this search.
              </div>
            )}

            {filteredPrompts.map((prompt) => {
              const active = prompt.id === selectedPrompt?.id
              return (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => setSelectedId(prompt.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-accent/35 bg-accent/10'
                      : 'border-border/40 bg-background/20 hover:border-border/70 hover:bg-background/35'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{prompt.name}</p>
                      <p className="truncate text-[11px] font-mono text-muted-foreground">{prompt.slug}</p>
                    </div>
                    <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      v{prompt.version}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded-full bg-muted/40 px-2 py-0.5 text-muted-foreground">{prompt.prompt_type}</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5 text-muted-foreground">{prompt.owner_type}</span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5 text-muted-foreground">{prompt.status}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{prompt.description}</p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-5">
          {!selectedPrompt && (
            <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
              Select a prompt to inspect its template, schema, versions, and preview output.
            </div>
          )}

          {selectedPrompt && (
            <>
              <div className="glass-card rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{selectedPrompt.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedPrompt.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-border/50 px-2.5 py-1 text-muted-foreground">{selectedPrompt.owner_type}:{selectedPrompt.owner_id ?? 'system'}</span>
                    <span className="rounded-full border border-border/50 px-2.5 py-1 text-muted-foreground">{selectedPrompt.prompt_type}</span>
                    <span className="rounded-full border border-border/50 px-2.5 py-1 text-muted-foreground">{selectedPrompt.status}</span>
                    <span className="rounded-full border border-border/50 px-2.5 py-1 text-muted-foreground">Last used: {formatStamp(selectedPrompt.last_used_at)}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),360px]">
                <div className="space-y-5">
                  <div className="glass-card rounded-2xl p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-foreground">Template</h4>
                      <button
                        type="button"
                        className="btn-primary gap-2 text-xs"
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                      >
                        {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save Prompt
                      </button>
                    </div>
                    <CodeMirrorPromptEditor value={templateDraft} onChange={setTemplateDraft} />
                    {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}
                  </div>

                  <div className="glass-card rounded-2xl p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-foreground">Variable Schema</h4>
                      <span className="text-[11px] text-muted-foreground">JSON contract used for strict render validation</span>
                    </div>
                    <textarea
                      className="min-h-[220px] w-full rounded-xl border border-border/50 bg-background/20 px-3 py-3 font-mono text-xs text-foreground outline-none transition-colors focus:border-accent/40"
                      value={variableSchemaDraft}
                      onChange={(event) => setVariableSchemaDraft(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="glass-card rounded-2xl p-5">
                    <h4 className="text-sm font-semibold text-foreground">Version History</h4>
                    <div className="mt-3 space-y-2">
                      {versions.map((version) => (
                        <div key={version.id} className="rounded-xl border border-border/40 bg-background/20 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-foreground">Version {version.version}</span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{version.status}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">{formatStamp(version.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card rounded-2xl p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Preview</h4>
                        <p className="text-[11px] text-muted-foreground">Render this prompt with sample variables before shipping it.</p>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost gap-2 text-xs"
                        onClick={() => previewMutation.mutate()}
                        disabled={previewMutation.isPending}
                      >
                        {previewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                        Preview
                      </button>
                    </div>
                    <textarea
                      className="min-h-[140px] w-full rounded-xl border border-border/50 bg-background/20 px-3 py-3 font-mono text-xs text-foreground outline-none transition-colors focus:border-accent/40"
                      value={previewVariables}
                      onChange={(event) => setPreviewVariables(event.target.value)}
                    />
                    {previewError && <p className="mt-2 text-xs text-red-400">{previewError}</p>}
                    {previewResult && (
                      <div className="mt-4 space-y-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Wand2 className="h-4 w-4 text-accent" />
                          Rendered output
                        </div>
                        <pre className="whitespace-pre-wrap rounded-xl border border-border/40 bg-background/40 p-3 text-xs text-foreground">
                          {previewResult.content}
                        </pre>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          Version {previewResult.metadata.prompt_version} rendered with {previewResult.metadata.variable_keys.length} variable(s)
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
