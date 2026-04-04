import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Copy, Download, Edit2, History, Save, Settings, Tag, Trash2, X } from 'lucide-react'

import AccordionSection from '@/components/agents/sections/AccordionSection'
import { ConfirmModal } from '@/components/shared/ConfirmModal'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import MutationButton from '@/components/shared/MutationButton'
import Siderail from '@/components/shared/Siderail'
import { useRunsQuery } from '@/features/runs'
import { useSinkQuery, useCreateSinkMutation, useUpdateSinkMutation, useDeleteSinkMutation } from '@/features/sinks'
import { useWorkspaces } from '@/hooks/useWorkspace'
import { useUIStore } from '@/stores/uiStore'
import type { SinkType, SinkInput } from '@/types/sinks'
import { SINK_TYPE_INFO, getSinkTypeInfo, INPUT_DEFAULT_PREFIX } from '@/types/sinks'

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '--'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type SiderailSection = 'tags' | 'timeline' | 'invocations' | null

export default function SinkDetailPage() {
  const { sinkId } = useParams<{ sinkId: string }>()
  const navigate = useNavigate()
  const isCreate = !sinkId || sinkId === 'new'

  const { data: sink, isLoading, error } = useSinkQuery(isCreate ? undefined : sinkId)
  const createMutation = useCreateSinkMutation()
  const updateMutation = useUpdateSinkMutation(sinkId ?? '')
  const deleteMutation = useDeleteSinkMutation()
  const setHeaderActions = useUIStore(s => s.setHeaderActions)
  const { data: workspacesData } = useWorkspaces()
  const workspaces = (workspacesData as Array<{ id: string; title?: string; name?: string }>) ?? []

  const { data: invocationsData } = useRunsQuery({
    runType: 'sink',
    limit: 20,
  })
  const invocations = (invocationsData?.runs ?? []).filter(
    (r: any) => sinkId && r.composite_metadata?.sink_id === sinkId
  )

  const [isEditing, setIsEditing] = useState(isCreate)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [autoSlug, setAutoSlug] = useState(true)
  const [description, setDescription] = useState('')
  const [selectedType, setSelectedType] = useState<SinkType>('log')
  const [config, setConfig] = useState<Record<string, any>>({})
  const [tags, setTags] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [siderailSection, setSiderailSection] = useState<SiderailSection>('tags')

  const toggleSection = (key: SiderailSection) =>
    setSiderailSection((prev) => (prev === key ? null : key))

  useEffect(() => {
    if (sink) {
      setName(sink.name)
      setSlug(sink.slug)
      setAutoSlug(false)
      setDescription(sink.description ?? '')
      setSelectedType(sink.sink_type)
      setConfig(sink.config ?? {})
      setTags(sink.tags ?? [])
    }
  }, [sink])

  useEffect(() => {
    if (autoSlug && name) setSlug(slugify(name))
  }, [name, autoSlug])

  const typeInfo = useMemo(() => getSinkTypeInfo(selectedType), [selectedType])

  const handleSave = () => {
    const payload = { name, slug, description: description || undefined, sink_type: selectedType, config, tags }
    if (isCreate) {
      createMutation.mutate(payload as any, { onSuccess: (created) => navigate(`/sinks/${created.id}`) })
    } else {
      updateMutation.mutate(payload as any, { onSuccess: () => setIsEditing(false) })
    }
  }

  const handleCancel = () => {
    if (sink) {
      setName(sink.name); setSlug(sink.slug); setAutoSlug(false)
      setDescription(sink.description ?? ''); setSelectedType(sink.sink_type)
      setConfig(sink.config ?? {}); setTags(sink.tags ?? [])
    }
    setIsEditing(false)
  }

  const handleDelete = () => {
    if (!sinkId) return
    deleteMutation.mutate(sinkId, { onSuccess: () => navigate('/sinks') })
  }

  const handleDuplicate = async () => {
    if (!sink) return
    setIsDuplicating(true)
    try {
      const copy = await createMutation.mutateAsync({
        name: `${sink.name} (Copy)`,
        slug: `${sink.slug}-copy`,
        description: sink.description ?? undefined,
        sink_type: sink.sink_type,
        config: sink.config,
        icon: sink.icon ?? undefined,
        tags: sink.tags,
      } as any)
      navigate(`/sinks/${copy.id}`)
    } catch {
      // handled by global interceptor
    } finally {
      setIsDuplicating(false)
    }
  }

  useEffect(() => { setHeaderActions(null); return () => setHeaderActions(null) }, [setHeaderActions])

  if (!isCreate && isLoading) return <LoadingState label="Loading sink..." />
  if (!isCreate && error) return <ErrorState message="Sink could not be loaded." />

  const setDefaultValue = (key: string, val: string) => {
    const configKey = `${INPUT_DEFAULT_PREFIX}${key}`
    setConfig(prev => {
      const next = { ...prev }
      if (val === '') { delete next[configKey] } else { next[configKey] = val }
      return next
    })
  }

  const renderInputField = (handle: SinkInput) => {
    const configKey = `${INPUT_DEFAULT_PREFIX}${handle.key}`
    const hasDefault = config[configKey] != null && config[configKey] !== ''

    // Resolve display value for read mode
    let displayValue: React.ReactNode = config[configKey] || <span className="text-muted-foreground/60 italic font-sans">Wired from agent output</span>
    if (handle.key === 'workspace_id' && config[configKey]) {
      const ws = workspaces.find(w => w.id === config[configKey])
      displayValue = ws?.title || ws?.name || config[configKey]
    }

    return (
      <div key={handle.key} className={`rounded-xl border p-3 transition-all ${hasDefault ? 'border-purple-400/40 bg-purple-500/5' : 'border-border/25 bg-background/35'}`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasDefault ? 'bg-purple-400' : 'bg-muted-foreground/40'}`} />
            <span className="text-sm font-medium text-foreground">{handle.label}</span>
            <span className="text-[10px] text-muted-foreground/60 font-mono">{handle.key}</span>
          </div>
          {hasDefault && !isEditing && (
            <span className="text-[10px] rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-purple-300">
              Hardcoded
            </span>
          )}
        </div>
        {isEditing ? (
          handle.key === 'workspace_id' ? (
            <select className="input w-full text-sm" value={config[configKey] ?? ''} onChange={e => setDefaultValue(handle.key, e.target.value)}>
              <option value="">Wired from agent output</option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.title || ws.name || ws.id}</option>
              ))}
            </select>
          ) : handle.fieldType === 'select' && handle.options ? (
            <select className="input w-full text-sm" value={config[configKey] ?? ''} onChange={e => setDefaultValue(handle.key, e.target.value)}>
              <option value="">Wired from agent output</option>
              {handle.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : handle.fieldType === 'textarea' ? (
            <textarea
              className="input w-full text-sm min-h-16 font-mono text-xs"
              value={config[configKey] ?? ''}
              placeholder={handle.placeholder || 'Leave empty to accept wired input'}
              onChange={e => setDefaultValue(handle.key, e.target.value)}
            />
          ) : (
            <input
              className="input w-full text-sm"
              type={handle.fieldType === 'url' ? 'url' : 'text'}
              value={config[configKey] ?? ''}
              placeholder={handle.placeholder || 'Leave empty to accept wired input'}
              onChange={e => setDefaultValue(handle.key, e.target.value)}
            />
          )
        ) : (
          <p className="text-sm text-foreground/90 font-mono break-all">{displayValue}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4 p-6 overflow-hidden">
      {/* Main content */}
      <div className="flex flex-1 flex-col gap-6 min-w-0 overflow-y-auto min-h-0">
        {/* Header card */}
        <div className="rounded-2xl border border-border/25 bg-card/35 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-3">
                <Download className="h-6 w-6 text-purple-400 flex-shrink-0" />
                {isEditing ? (
                  <input className="input text-2xl font-semibold tracking-tight w-full" value={name}
                    onChange={e => { setName(e.target.value); if (autoSlug) setSlug(slugify(e.target.value)) }}
                    placeholder="Sink name" autoFocus={isCreate} />
                ) : (
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">{name || 'Untitled Sink'}</h1>
                )}
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2 ml-9">
                  <input className="input text-xs font-mono w-full max-w-xs" value={slug}
                    onChange={e => { setSlug(e.target.value); setAutoSlug(false) }} placeholder="sink-slug" />
                  {!autoSlug && (
                    <button type="button" className="text-[10px] text-accent hover:text-accent/80 whitespace-nowrap"
                      onClick={() => { setAutoSlug(true); setSlug(slugify(name)) }}>Auto</button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/80 font-mono ml-9">{slug}</p>
              )}
              <div className="ml-9">
                {isEditing ? (
                  <textarea className="input w-full min-h-[60px] text-sm resize-y" value={description}
                    onChange={e => setDescription(e.target.value)} placeholder="Describe what this sink does..." />
                ) : (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                    {description || <span className="text-muted-foreground/60 italic">No description</span>}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isEditing ? (
                <>
                  <MutationButton type="button" size="md" variant="primary"
                    isPending={isCreate ? createMutation.isPending : updateMutation.isPending}
                    icon={<Save className="h-4 w-4" />} disabled={!name.trim() || !slug.trim()} onClick={handleSave}>
                    {isCreate ? 'Create' : 'Save'}
                  </MutationButton>
                  {!isCreate && (
                    <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      onClick={handleCancel}><X className="w-3.5 h-3.5" /> Cancel</button>
                  )}
                </>
              ) : (
                <>
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90"
                    onClick={() => setIsEditing(true)}><Edit2 className="w-3.5 h-3.5" /> Edit</button>
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/30"
                    onClick={handleDuplicate} disabled={isDuplicating}><Copy className="w-3.5 h-3.5" /> {isDuplicating ? 'Duplicating...' : 'Duplicate'}</button>
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-400 transition-colors hover:text-red-300 hover:bg-red-500/20"
                    onClick={() => setDeleteOpen(true)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                </>
              )}
              <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/25 bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => navigate('/sinks')}><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
            </div>
          </div>
        </div>

        {/* Sink type + inputs — two-part connected tab layout */}
        <div className="rounded-2xl border border-border/25 flex flex-1 min-h-0 overflow-hidden">
          {/* Left: sink type list */}
          <div className="w-[35%] min-w-[200px] max-w-[320px] overflow-y-auto flex-shrink-0 bg-card/30">
            <div className="px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">Sink Type</p>
            </div>
            <div>
              {SINK_TYPE_INFO.map((info, idx) => {
                const isSelected = selectedType === info.type
                const isLast = idx === SINK_TYPE_INFO.length - 1
                return (
                  <button
                    key={info.type}
                    disabled={!isEditing && !isSelected}
                    className={`w-full text-left px-4 py-2.5 transition-all relative border-r ${
                      isSelected
                        ? 'bg-purple-500/[0.08] border-l-2 border-l-purple-400 border-r-transparent border-y border-y-border/20 -my-px z-10'
                        : isEditing
                          ? 'border-l-2 border-l-transparent border-r-border/25 hover:bg-card/60'
                          : 'border-l-2 border-l-transparent border-r-border/25 opacity-40'
                    } ${!isLast && !isSelected ? '' : ''}`}
                    onClick={() => { if (isEditing) { setSelectedType(info.type); setConfig({}) } }}
                  >
                    <p className={`text-sm font-medium ${isSelected ? 'text-purple-300' : 'text-foreground'}`}>
                      {info.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70 leading-snug">{info.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right: inputs for selected type */}
          <div className="flex-1 overflow-y-auto p-5 bg-purple-500/[0.04]">
            {typeInfo ? (
              <>
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-foreground">{typeInfo.label} Inputs</h2>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">
                    Configure default values for each input. Inputs left empty will accept values wired from agent outputs in automations.
                  </p>
                </div>
                <div className="grid gap-3">
                  {typeInfo.inputs.map(renderInputField)}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground/60">
                Select a sink type to see its inputs
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Siderail */}
      <Siderail
        storageKey="openforge.sink.config.pct"
        collapsedStorageKey="openforge.sink.config.collapsed"
        icon={Settings}
        label="Configuration"
        breakpoint="lg"
      >
        {(onCollapse) => (
          <div className="flex h-full min-h-0 flex-col px-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-accent" />
                  <h3 className="text-sm font-semibold tracking-tight">Configuration</h3>
                </div>
                <p className="text-xs text-muted-foreground/90">Sink settings.</p>
              </div>
              <button type="button" onClick={onCollapse}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                aria-label="Collapse configuration sidebar" title="Collapse configuration">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
              {/* Tags */}
              <AccordionSection title="Tags" summary={tags.length ? tags.join(', ') : 'No tags'} icon={Tag}
                expanded={siderailSection === 'tags'} onToggle={() => toggleSection('tags')}>
                {isEditing ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                          {tag}
                          <button className="ml-0.5 text-accent/60 hover:text-accent transition"
                            onClick={() => setTags(tags.filter((_, idx) => idx !== i))}>&times;</button>
                        </span>
                      ))}
                    </div>
                    <input className="input w-full text-xs" placeholder="Add tag and press Enter"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const v = (e.target as HTMLInputElement).value.trim()
                          if (v && !tags.includes(v)) { setTags([...tags, v]); (e.target as HTMLInputElement).value = '' }
                        }
                      }} />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.length === 0
                      ? <span className="text-xs text-muted-foreground italic">No tags</span>
                      : tags.map((tag, i) => <span key={i} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">{tag}</span>)}
                  </div>
                )}
              </AccordionSection>

              {/* Timeline */}
              {!isCreate && (sink?.created_at || sink?.updated_at) && (
                <AccordionSection title="Timeline" summary={formatDate(sink?.updated_at)} icon={History}
                  expanded={siderailSection === 'timeline'} onToggle={() => toggleSection('timeline')}>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {sink?.created_at && <div><span className="font-medium text-foreground/80">Created:</span> {formatDate(sink.created_at)}</div>}
                    {sink?.updated_at && <div><span className="font-medium text-foreground/80">Updated:</span> {formatDate(sink.updated_at)}</div>}
                  </div>
                </AccordionSection>
              )}

              {/* Invocation History */}
              {!isCreate && (
                <AccordionSection
                  title="Invocations"
                  summary={invocations.length ? `${invocations.length} recent` : 'No invocations'}
                  icon={History}
                  expanded={siderailSection === 'invocations'}
                  onToggle={() => toggleSection('invocations')}
                >
                  {invocations.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No invocations yet. Deploy an automation with this sink to see execution history.</p>
                  ) : (
                    <div className="space-y-2">
                      {invocations.map((inv: any) => (
                        <Link
                          key={inv.id}
                          to={`/runs/${inv.id}`}
                          className="block rounded-lg border border-border/20 bg-background/50 px-3 py-2 transition hover:border-border/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">
                                {inv.composite_metadata?.node_key || 'sink'}
                              </p>
                              <p className="text-[10px] text-muted-foreground/70">
                                {inv.started_at ? formatDate(inv.started_at) : formatDate(inv.created_at)}
                              </p>
                            </div>
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              inv.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                              inv.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                              inv.status === 'running' ? 'bg-blue-500/15 text-blue-400' :
                              'bg-muted/30 text-muted-foreground'
                            }`}>
                              {inv.status}
                            </span>
                          </div>
                          {inv.status === 'completed' && inv.output_payload && Object.keys(inv.output_payload).length > 0 && (
                            <pre className="mt-1.5 text-[10px] text-muted-foreground/70 font-mono truncate max-w-full overflow-hidden">
                              {JSON.stringify(inv.output_payload).slice(0, 120)}
                            </pre>
                          )}
                          {inv.status === 'failed' && inv.error_message && (
                            <p className="mt-1 text-[10px] text-red-400/70 truncate">{inv.error_message}</p>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </AccordionSection>
              )}
            </div>
          </div>
        )}
      </Siderail>

      <ConfirmModal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete}
        title="Delete Sink" message={`Are you sure you want to delete "${sink?.name ?? ''}"? This will also disconnect it from any automations using it.`}
        confirmLabel="Delete" cancelLabel="Cancel" variant="danger" icon="trash" loading={deleteMutation.isPending} />
    </div>
  )
}
