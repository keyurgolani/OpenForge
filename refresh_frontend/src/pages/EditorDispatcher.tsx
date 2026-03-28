import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { getKnowledge } from '@/lib/api'
import { knowledgeRoute } from '@/lib/routes'
import { useWorkspaceId } from '@/hooks/useWorkspaceId'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import NoteEditor from '@/components/knowledge/NoteEditor'
import KnowledgePreview from '@/components/knowledge/KnowledgePreview'

/* -------------------------------------------------------------------------- */
/* Loading skeleton                                                           */
/* -------------------------------------------------------------------------- */

function EditorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2 border-b border-border/30 px-4 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-8 animate-pulse rounded-md bg-bg-sunken" />
        ))}
        <div className="ml-auto h-5 w-20 animate-pulse rounded bg-bg-sunken" />
      </div>

      {/* Title skeleton */}
      <div className="border-b border-border/20 px-6 py-4">
        <div className="h-8 w-64 animate-pulse rounded-md bg-bg-sunken" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 space-y-3 px-6 py-6">
        <div className="h-4 w-full animate-pulse rounded bg-bg-sunken" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-bg-sunken" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-bg-sunken" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-bg-sunken" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-bg-sunken" />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Error state                                                                */
/* -------------------------------------------------------------------------- */

function NotFoundState({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/10">
        <AlertTriangle className="h-8 w-8 text-warning" strokeWidth={1.5} />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h2 className="font-display text-lg font-semibold text-fg">
          Knowledge item not found
        </h2>
        <p className="text-sm leading-relaxed text-fg-muted">
          This item may have been deleted or you may not have access to it.
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate(knowledgeRoute(workspaceId))}
        className={cn(
          'mt-2 inline-flex items-center gap-2 rounded-lg border border-border/40 px-4 py-2',
          'bg-bg-elevated font-label text-sm font-medium text-fg',
          'transition-colors hover:bg-bg-sunken focus-ring',
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Knowledge Library
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Editable types                                                             */
/* -------------------------------------------------------------------------- */

const EDITABLE_TYPES = new Set(['note', 'fleeting'])
const CODE_TYPES = new Set(['gist'])

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function EditorDispatcher() {
  const { knowledgeId } = useParams<{ knowledgeId: string }>()
  const workspaceId = useWorkspaceId()
  const navigate = useNavigate()
  const wid = workspaceId ?? ''
  const nid = knowledgeId ?? ''

  const knowledgeQuery = useQuery({
    queryKey: ['knowledge', wid, nid],
    queryFn: () => getKnowledge(wid, nid),
    enabled: !!wid && !!nid,
    retry: 1,
  })

  const knowledge = knowledgeQuery.data
  const knowledgeType = knowledge?.knowledge_type?.toLowerCase() ?? ''

  /* -- Determine which view to render -------------------------------------- */

  const isEditable = EDITABLE_TYPES.has(knowledgeType)
  const isCodeType = CODE_TYPES.has(knowledgeType)

  /* -- Render -------------------------------------------------------------- */

  return (
    <div className="flex h-full flex-col">
      {/* Back button bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/30 px-4 py-2">
        <button
          type="button"
          onClick={() => navigate(knowledgeRoute(wid))}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
            'font-label text-xs font-medium text-fg-muted',
            'transition-colors hover:bg-bg-sunken hover:text-fg focus-ring',
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Knowledge Library
        </button>

        {knowledge && (
          <span className="text-xs text-fg-subtle">
            /
          </span>
        )}

        {knowledge && (
          <span className="truncate font-label text-xs font-medium text-fg-muted">
            {knowledge.title || 'Untitled'}
          </span>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {knowledgeQuery.isLoading ? (
          <EditorSkeleton />
        ) : knowledgeQuery.isError || !knowledge ? (
          <NotFoundState workspaceId={wid} />
        ) : isEditable || isCodeType ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <NoteEditor
              workspaceId={wid}
              knowledge={knowledge}
              codeMode={isCodeType}
            />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="h-full overflow-y-auto p-6 sm:p-8"
          >
            <div className="mx-auto max-w-4xl">
              <KnowledgePreview
                workspaceId={wid}
                knowledge={knowledge}
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
