import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingState from '@/components/shared/LoadingState'
import { useSinksQuery, SinkCard } from '@/features/sinks'
import { useUIStore } from '@/stores/uiStore'
import type { SinkType } from '@/types/sinks'
import { SINK_TYPE_INFO } from '@/types/sinks'

export default function SinksPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sinkType, setSinkType] = useState<SinkType | 'all'>('all')
  const setHeaderActions = useUIStore(s => s.setHeaderActions)

  const { data, isLoading, error } = useSinksQuery({
    q: search.trim() || undefined,
    sink_type: sinkType === 'all' ? undefined : sinkType,
  })

  useEffect(() => {
    setHeaderActions(
      <button
        className="bg-accent text-accent-foreground hover:bg-accent/90 px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
        onClick={() => navigate('/sinks/new')}
      >
        <Plus className="w-3.5 h-3.5" /> New Sink
      </button>
    )
    return () => setHeaderActions(null)
  }, [navigate, setHeaderActions])

  if (isLoading) return <LoadingState label="Loading sinks..." />
  if (error) return <ErrorState message="Sinks could not be loaded." />

  const sinks = data?.sinks ?? []
  const hasFilters = Boolean(search.trim()) || sinkType !== 'all'

  return (
    <div className="space-y-6 p-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search sinks..."
            className="input w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-full sm:w-48"
          value={sinkType}
          onChange={e => setSinkType(e.target.value as SinkType | 'all')}
        >
          <option value="all">All types</option>
          {SINK_TYPE_INFO.map(info => (
            <option key={info.type} value={info.type}>{info.label}</option>
          ))}
        </select>
      </div>

      {/* Sink list */}
      {sinks.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No sinks match these filters' : 'No sinks yet'}
          description={hasFilters
            ? 'Try broadening the search or reset the type filter.'
            : 'Sinks define what happens with agent output values. Create a sink to use it in automations.'}
          actionLabel={hasFilters ? undefined : 'Create Sink'}
          onAction={hasFilters ? undefined : () => navigate('/sinks/new')}
          icon={<Download className="h-5 w-5" />}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sinks.map(sink => (
            <SinkCard key={sink.id} sink={sink} />
          ))}
        </div>
      )}
    </div>
  )
}
