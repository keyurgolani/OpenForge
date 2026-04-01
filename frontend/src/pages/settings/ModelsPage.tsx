/**
 * ModelsPage - List-detail layout for AI Models settings
 *
 * Left panel shows grouped navigation items (Providers, Reasoning, Image,
 * Embedding, Document, Audio). Right panel renders the selected model tab.
 */

import { lazy, Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ProvidersTab = lazy(() => import('./llm/ProvidersTab'));
const ReasoningPage = lazy(() => import('./models/reasoning/ReasoningPage'));
const VisionPage = lazy(() => import('./models/vision/VisionPage'));
const EmbeddingPage = lazy(() => import('./models/embedding/EmbeddingPage'));
const CLIPPage = lazy(() => import('./models/clip/CLIPPage'));
const PDFPage = lazy(() => import('./models/pdf/PDFPage'));
const STTPage = lazy(() => import('./models/audio/STTPage'));
const TTSPage = lazy(() => import('./models/audio/TTSPage'));

type ModelSection = 'providers' | 'reasoning' | 'vision' | 'embedding' | 'clip' | 'pdf' | 'stt' | 'tts';

interface NavItem {
  id: ModelSection;
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
    category: 'Embedding',
    items: [
      { id: 'embedding', label: 'Text Embedding' },
      { id: 'clip', label: 'CLIP' },
    ],
  },
  {
    category: 'Document',
    items: [{ id: 'pdf', label: 'PDF' }],
  },
  {
    category: 'Audio',
    items: [
      { id: 'stt', label: 'Speech to Text' },
      { id: 'tts', label: 'Text to Speech' },
    ],
  },
];

function renderSection(section: ModelSection) {
  switch (section) {
    case 'providers':
      return <ProvidersTab />;
    case 'reasoning':
      return <ReasoningPage />;
    case 'vision':
      return <VisionPage />;
    case 'embedding':
      return <EmbeddingPage />;
    case 'clip':
      return <CLIPPage />;
    case 'pdf':
      return <PDFPage />;
    case 'stt':
      return <STTPage />;
    case 'tts':
      return <TTSPage />;
  }
}

export function ModelsPage() {
  const [selected, setSelected] = useState<ModelSection>('providers');

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
                      onClick={() => setSelected(item.id)}
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
