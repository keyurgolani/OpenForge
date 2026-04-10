/**
 * ModelsPage - List-detail layout for AI Models settings
 *
 * Left panel shows grouped navigation items. Right panel renders the selected tab.
 * Section selection is URL-driven so refresh preserves the active tab.
 */

import { lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ProvidersTab = lazy(() => import('./llm/ProvidersTab'));
const ReasoningPage = lazy(() => import('./models/reasoning/ReasoningPage'));
const VisionPage = lazy(() => import('./models/vision/VisionPage'));
const TTSPage = lazy(() => import('./models/audio/TTSPage'));
const PipelineSTTPage = lazy(() => import('./models/pipeline/PipelineSTTPage'));
const PipelineDocumentPage = lazy(() => import('./models/pipeline/PipelineDocumentPage'));
const PipelineCLIPPage = lazy(() => import('./models/pipeline/PipelineCLIPPage'));
const PipelineEmbeddingsPage = lazy(() => import('./models/pipeline/PipelineEmbeddingsPage'));

const VALID_SECTIONS = new Set([
  'providers', 'reasoning', 'vision', 'tts',
  'pipeline-stt', 'pipeline-document', 'pipeline-clip', 'pipeline-embeddings',
]);

type ModelSection = typeof VALID_SECTIONS extends Set<infer T> ? T : string;

interface NavItem {
  id: string;
  label: string;
}

interface NavGroup {
  category: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    category: 'Providers',
    items: [{ id: 'providers', label: 'Providers' }],
  },
  {
    category: 'Chat',
    items: [
      { id: 'reasoning', label: 'Reasoning' },
      { id: 'vision', label: 'Vision' },
    ],
  },
  {
    category: 'Audio',
    items: [
      { id: 'tts', label: 'Text to Speech' },
    ],
  },
  {
    category: 'Content Extraction',
    items: [
      { id: 'pipeline-stt', label: 'Speech-to-Text' },
      { id: 'pipeline-document', label: 'Document Models' },
      { id: 'pipeline-clip', label: 'Vision / CLIP' },
      { id: 'pipeline-embeddings', label: 'Text Embeddings' },
    ],
  },
];

function renderSection(section: string) {
  switch (section) {
    case 'providers':
      return <ProvidersTab />;
    case 'reasoning':
      return <ReasoningPage />;
    case 'vision':
      return <VisionPage />;
    case 'tts':
      return <TTSPage />;
    case 'pipeline-stt':
      return <PipelineSTTPage />;
    case 'pipeline-document':
      return <PipelineDocumentPage />;
    case 'pipeline-clip':
      return <PipelineCLIPPage />;
    case 'pipeline-embeddings':
      return <PipelineEmbeddingsPage />;
    default:
      return <ProvidersTab />;
  }
}

export function ModelsPage() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const selected = section && VALID_SECTIONS.has(section) ? section : 'providers';

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-56 flex-shrink-0 border-r border-border/25 overflow-y-auto p-3">
        <div className="space-y-1">
          {NAV_GROUPS.map((group) => {
            const showHeader = group.category !== 'Providers';
            return (
              <div key={group.category}>
                {showHeader && (
                  <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 pt-3 pb-1">
                    {group.category}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => navigate(`/settings/models/${item.id}`, { replace: true })}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                        selected === item.id
                          ? 'bg-accent/15 text-accent'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          {renderSection(selected)}
        </Suspense>
      </div>
    </div>
  );
}

export default ModelsPage;
