import { useState } from 'react'
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react'
import type { TemplateReferenceData } from '@/types/deployments'

interface PromptTemplateReferenceProps {
  data: TemplateReferenceData | null | undefined
  onInsert?: (text: string) => void
}

export default function PromptTemplateReference({ data, onInsert }: PromptTemplateReferenceProps) {
  const [activeTab, setActiveTab] = useState<'functions' | 'syntax' | 'types'>('functions')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  if (!data) return null

  // Group functions by category
  const grouped = data.functions.reduce<Record<string, typeof data.functions>>((acc, fn) => {
    if (!acc[fn.category]) acc[fn.category] = []
    acc[fn.category].push(fn)
    return acc
  }, {})

  return (
    <div className="w-72 border-l border-border/40 bg-background/50 overflow-y-auto">
      <div className="p-3 border-b border-border/40">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <BookOpen className="w-4 h-4" />
          Template Reference
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border/40">
        {(['functions', 'syntax', 'types'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-2 py-2 text-xs font-medium transition ${
              activeTab === tab
                ? 'text-accent border-b-2 border-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="p-2">
        {activeTab === 'functions' && (
          <div className="space-y-1">
            {Object.entries(grouped).map(([category, fns]) => (
              <div key={category}>
                <button
                  onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                  className="w-full flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded"
                >
                  {expandedCategory === category ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {category}
                  <span className="ml-auto text-[10px] opacity-60">{fns.length}</span>
                </button>
                {expandedCategory === category && (
                  <div className="ml-4 space-y-0.5">
                    {fns.map((fn) => (
                      <button
                        key={fn.name}
                        onClick={() => onInsert?.(`{{${fn.name}()}}`)}
                        className="w-full text-left px-2 py-1 rounded text-xs hover:bg-accent/10 transition"
                      >
                        <span className="font-mono text-accent">{fn.signature}</span>
                        <p className="text-muted-foreground mt-0.5">{fn.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'syntax' && (
          <div className="space-y-2">
            {data.syntax.map((s) => (
              <div key={s.name} className="px-2 py-1.5 rounded text-xs">
                <code className="font-mono text-accent">{s.pattern}</code>
                <p className="text-muted-foreground mt-0.5">{s.description}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'types' && (
          <div className="space-y-1 px-2">
            {data.types.map((t) => (
              <div key={t} className="py-1 text-xs">
                <code className="font-mono text-accent">{t}</code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
