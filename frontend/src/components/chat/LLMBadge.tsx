import { useState } from 'react'
import { Bot, ChevronDown, ChevronRight, Clock } from 'lucide-react'

interface RouterMetadata {
  type: 'router';
  routing_model?: string;
  complexity_score?: number;
  selected_tier?: string;
  target_provider?: string;
  target_model?: string;
  routing_time_ms?: number;
}

interface CouncilMetadata {
  type: 'council';
  members?: Array<{ model: string; provider: string }>;
  chairman?: string;
  selected_member?: string;
  selection_reason?: string;
  deliberation_time_ms?: number;
}

interface OptimizerMetadata {
  type: 'optimizer';
  optimizer_model?: string;
  original_prompt?: string;
  optimized_prompt?: string;
  optimization_time_ms?: number;
  target_provider?: string;
  target_model?: string;
}

type ProviderMetadata = RouterMetadata | CouncilMetadata | OptimizerMetadata;

interface LLMBadgeProps {
  providerUsed?: string | null;
  modelUsed?: string | null;
  generationMs?: number | null;
  providerMetadata?: ProviderMetadata | null;
}

function RouterDetails({ metadata }: { metadata: RouterMetadata }) {
  return (
    <div className="space-y-1 text-[11px] text-white/60">
      {metadata.routing_model && (
        <div>▸ Routing Model: {metadata.routing_model}</div>
      )}
      {metadata.complexity_score != null && (
        <div>▸ Complexity: {metadata.complexity_score.toFixed(2)} → <span className="text-white/80">{metadata.selected_tier}</span></div>
      )}
      {metadata.target_provider && (
        <div>▸ Target: {metadata.target_provider} · <span className="text-white/80">{metadata.target_model}</span></div>
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
  return (
    <div className="space-y-1 text-[11px] text-white/60">
      {metadata.members?.map((m, i) => (
        <div key={i} className={m.model === metadata.selected_member ? 'text-emerald-400' : ''}>
          ▸ {m.model} {m.model === metadata.selected_member ? '✓ Selected' : ''}
        </div>
      ))}
      {metadata.chairman && <div>▸ Chairman: {metadata.chairman}</div>}
      {metadata.selection_reason && <div>▸ Reason: "{metadata.selection_reason}"</div>}
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
    <div className="space-y-1 text-[11px] text-white/60">
      {metadata.optimizer_model && <div>▸ Optimizer: {metadata.optimizer_model}</div>}
      {metadata.original_prompt && <div>▸ Original: "{metadata.original_prompt}"</div>}
      {metadata.optimized_prompt && <div>▸ Optimized: "{metadata.optimized_prompt}"</div>}
      {metadata.target_provider && <div>▸ Target: {metadata.target_provider} · {metadata.target_model}</div>}
      {metadata.optimization_time_ms != null && (
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {metadata.optimization_time_ms.toFixed(0)}ms optimization
        </div>
      )}
    </div>
  );
}

export function LLMBadge({ providerUsed, modelUsed, generationMs, providerMetadata }: LLMBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const isVirtual = providerMetadata != null;

  const label = isVirtual
    ? providerMetadata!.type === 'router'
      ? `Router → ${(providerMetadata as RouterMetadata).selected_tier || 'auto'}`
      : providerMetadata!.type === 'council'
      ? `Council (${(providerMetadata as CouncilMetadata).members?.length || '?'} models)`
      : `Optimizer → ${(providerMetadata as OptimizerMetadata).target_model || 'auto'}`
    : `${providerUsed || 'LLM'} · ${modelUsed || 'auto'}`;

  if (!isVirtual) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-white/40 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
        <Bot className="w-3 h-3" />
        <span>{label}</span>
        {generationMs != null && (
          <>
            <span className="text-white/20">·</span>
            <Clock className="w-2.5 h-2.5" />
            <span>{(generationMs / 1000).toFixed(1)}s</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-[11px] text-purple-300 px-2.5 py-1 w-full hover:bg-purple-500/10 transition-colors"
      >
        <Bot className="w-3 h-3 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        {generationMs != null && (
          <>
            <span className="text-white/20">·</span>
            <Clock className="w-2.5 h-2.5 text-white/40" />
            <span className="text-white/40">{(generationMs / 1000).toFixed(1)}s</span>
          </>
        )}
        {expanded
          ? <ChevronDown className="w-3 h-3 text-white/40" />
          : <ChevronRight className="w-3 h-3 text-white/40" />
        }
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 pt-1 border-t border-purple-500/20">
          {providerMetadata!.type === 'router' && <RouterDetails metadata={providerMetadata as RouterMetadata} />}
          {providerMetadata!.type === 'council' && <CouncilDetails metadata={providerMetadata as CouncilMetadata} />}
          {providerMetadata!.type === 'optimizer' && <OptimizerDetails metadata={providerMetadata as OptimizerMetadata} />}
        </div>
      )}
    </div>
  );
}
