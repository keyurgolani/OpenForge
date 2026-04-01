import { ArrowRight, Clock3, FileText, Globe, Bell, ScrollText, BookPlus, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { sinksRoute } from '@/lib/routes'
import type { Sink, SinkType } from '@/types/sinks'

const SINK_TYPE_STYLES: Record<SinkType, { label: string; accent: string; icon: React.ReactNode }> = {
  article: { label: 'Article', accent: 'border-blue-400/30 bg-blue-500/8 text-blue-400', icon: <FileText className="h-3.5 w-3.5" /> },
  knowledge_create: { label: 'Knowledge Create', accent: 'border-green-400/30 bg-green-500/8 text-green-400', icon: <BookPlus className="h-3.5 w-3.5" /> },
  knowledge_update: { label: 'Knowledge Update', accent: 'border-emerald-400/30 bg-emerald-500/8 text-emerald-400', icon: <BookOpen className="h-3.5 w-3.5" /> },
  rest_api: { label: 'REST API', accent: 'border-orange-400/30 bg-orange-500/8 text-orange-400', icon: <Globe className="h-3.5 w-3.5" /> },
  notification: { label: 'Notification', accent: 'border-yellow-400/30 bg-yellow-500/8 text-yellow-400', icon: <Bell className="h-3.5 w-3.5" /> },
  log: { label: 'Log', accent: 'border-purple-400/30 bg-purple-500/8 text-purple-400', icon: <ScrollText className="h-3.5 w-3.5" /> },
}

interface SinkCardProps {
  sink: Sink
}

export default function SinkCard({ sink }: SinkCardProps) {
  const style = SINK_TYPE_STYLES[sink.sink_type] ?? { label: sink.sink_type, accent: 'border-border/30 bg-muted/8 text-muted-foreground', icon: <FileText className="h-3.5 w-3.5" /> }

  return (
    <Link
      to={sinksRoute(sink.id)}
      className="group block rounded-2xl border border-border/25 bg-card/30 p-5 transition-all hover:-translate-y-0.5 hover:border-purple-400/35 hover:bg-card/45"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${style.accent}`}>
            {style.icon}
            {style.label}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{sink.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground/90">
              {sink.description || 'No description.'}
            </p>
          </div>
        </div>
      </div>

      {sink.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sink.tags.map(tag => (
            <span key={tag} className="chip-muted text-xs">{tag}</span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/25 pt-4 text-xs text-muted-foreground/80">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground/70">{sink.slug}</span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {sink.updated_at ? new Date(sink.updated_at).toLocaleString() : 'Recently created'}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-purple-400 transition-transform group-hover:translate-x-0.5">
          Configure
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  )
}
