import { useState, useRef } from 'react'
import { Bot, ChevronDown, ChevronRight, Clock, Check, X, Crown } from 'lucide-react'

interface RouterMetadata {
  type: 'router';
  complexity_score?: number;
  selected_tier?: string;
  routing_time_ms?: number;
}

interface CouncilMemberDetail {
  label: string;
  response_preview?: string;
  is_winner?: boolean;
  is_error?: boolean;
}

interface CouncilMetadata {
  type: 'council';
  member_count?: number;
  valid_responses?: number;
  selected_index?: number;
  chairman?: string;
  chairman_reasoning?: string;
  members?: CouncilMemberDetail[];
  deliberation_time_ms?: number;
}

interface OptimizerMetadata {
  type: 'optimizer';
  original_prompt?: string;
  optimized_prompt?: string;
  optimization_time_ms?: number;
}

type ProviderMetadata = RouterMetadata | CouncilMetadata | OptimizerMetadata;

interface LLMBadgeProps {
  providerUsed?: string | null;
  modelUsed?: string | null;
  generationMs?: number | null;
  providerMetadata?: ProviderMetadata | null;
  requestVisibility?: (el: HTMLElement | null) => void;
}

function RouterDetails({ metadata }: { metadata: RouterMetadata }) {
  return (
    <div className="space-y-1 text-[11px] text-muted-foreground">
      {metadata.complexity_score != null && (
        <div>Complexity: <span className="font-medium text-foreground/80">{metadata.complexity_score.toFixed(2)}</span> → <span className="font-medium text-foreground/80">{metadata.selected_tier || 'unknown'}</span></div>
      )}
      {metadata.routing_time_ms != null && (
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {metadata.routing_time_ms.toFixed(0)}ms routing
        </div>
      )}
    </div>
  );
}

function CouncilDetails({ metadata }: { metadata: CouncilMetadata }) {
  const [showResponses, setShowResponses] = useState(false);

  return (
    <div className="space-y-1.5 text-[11px] text-muted-foreground">
      {metadata.chairman && (
        <div className="flex items-center gap-1">
          <Crown className="w-2.5 h-2.5 text-amber-500" />
          Chairman: <span className="font-medium text-foreground/80">{metadata.chairman}</span>
        </div>
      )}
      {metadata.members && metadata.members.length > 0 && (
        <div className="space-y-1">
          <button
            className="flex items-center gap-1 text-[10px] font-medium text-foreground/70 hover:text-foreground/90 transition-colors"
            onClick={() => setShowResponses(prev => !prev)}
          >
            {showResponses ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
            {metadata.members.length} member responses
          </button>
          {showResponses && (
            <div className="space-y-1.5 pl-1">
              {metadata.members.map((m, i) => (
                <div
                  key={i}
                  className={`rounded border px-2 py-1.5 text-[10px] leading-relaxed ${
                    m.is_winner
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : m.is_error
                      ? 'border-red-500/20 bg-red-500/5'
                      : 'border-border/50 bg-muted/20'
                  }`}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    {m.is_winner ? (
                      <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                    ) : m.is_error ? (
                      <X className="w-2.5 h-2.5 text-red-400 shrink-0" />
                    ) : (
                      <Bot className="w-2.5 h-2.5 shrink-0" />
                    )}
                    <span className={`font-medium ${m.is_winner ? 'text-emerald-600' : 'text-foreground/70'}`}>
                      {m.label}
                      {m.is_winner && ' (Winner)'}
                    </span>
                  </div>
                  {m.response_preview && (
                    <div className="text-muted-foreground/80 break-words max-h-24 overflow-hidden">
                      {m.response_preview}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {metadata.chairman_reasoning && (
        <div>
          <div className="font-medium text-foreground/70 mb-0.5">Chairman's reasoning:</div>
          <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[10px] leading-relaxed break-words">
            {metadata.chairman_reasoning}
          </div>
        </div>
      )}
      {metadata.deliberation_time_ms != null && (
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {(metadata.deliberation_time_ms / 1000).toFixed(1)}s deliberation
        </div>
      )}
    </div>
  );
}

function OptimizerDetails({ metadata }: { metadata: OptimizerMetadata }) {
  return (
    <div className="space-y-1.5 text-[11px] text-muted-foreground">
      {metadata.original_prompt && (
        <div>
          <div className="font-medium text-foreground/70 mb-0.5">Original prompt:</div>
          <div className="rounded border border-border/50 bg-muted/30 px-2 py-1 text-[10px] leading-relaxed break-words">{metadata.original_prompt}</div>
        </div>
      )}
      {metadata.optimized_prompt && (
        <div>
          <div className="font-medium text-foreground/70 mb-0.5">Optimized prompt:</div>
          <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] leading-relaxed break-words">{metadata.optimized_prompt}</div>
        </div>
      )}
      {metadata.optimization_time_ms != null && (
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {metadata.optimization_time_ms.toFixed(0)}ms optimization
        </div>
      )}
    </div>
  );
}

export function LLMBadge({ providerUsed, modelUsed, generationMs, providerMetadata, requestVisibility }: LLMBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const isVirtual = providerMetadata != null && providerMetadata.type != null;

  const label = isVirtual
    ? providerMetadata!.type === 'router'
      ? `Router → ${(providerMetadata as RouterMetadata).selected_tier || 'auto'}`
      : providerMetadata!.type === 'council'
      ? `Council (${(providerMetadata as CouncilMetadata).member_count || '?'} models)`
      : `Optimizer`
    : `${providerUsed || 'LLM'} · ${modelUsed || 'auto'}`;

  const timeLabel = generationMs != null ? `${(generationMs / 1000).toFixed(1)}s` : null;

  if (!isVirtual) {
    return (
      <span className="chat-llm-inline">
        <Bot className="w-3 h-3" />
        <span>{label}</span>
        {timeLabel && (
          <>
            <span className="opacity-40">·</span>
            <Clock className="w-2.5 h-2.5 opacity-60" />
            <span className="opacity-60">{timeLabel}</span>
          </>
        )}
      </span>
    );
  }

  return (
    <>
      <button
        className="chat-subsection-toggle"
        onClick={() => {
          setExpanded(prev => {
            const next = !prev
            if (next) {
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  requestVisibility?.(detailsRef.current)
                })
              })
              window.setTimeout(() => {
                requestVisibility?.(detailsRef.current)
              }, 220)
            }
            return next
          })
        }}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Bot className="w-3 h-3" />
        {label}
        {timeLabel && (
          <>
            <span className="opacity-40">·</span>
            <span className="opacity-60">{timeLabel}</span>
          </>
        )}
      </button>
      <div ref={detailsRef} className={`chat-collapse w-full ${expanded ? 'chat-collapse-open' : 'chat-collapse-closed'}`}>
        <div className="chat-collapse-inner">
          <div className="chat-section-reveal w-full rounded-2xl border border-accent/20 bg-accent/6 px-4 py-3">
            {providerMetadata!.type === 'router' && <RouterDetails metadata={providerMetadata as RouterMetadata} />}
            {providerMetadata!.type === 'council' && <CouncilDetails metadata={providerMetadata as CouncilMetadata} />}
            {providerMetadata!.type === 'optimizer' && <OptimizerDetails metadata={providerMetadata as OptimizerMetadata} />}
          </div>
        </div>
      </div>
    </>
  );
}
