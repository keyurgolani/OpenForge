import { useState } from 'react'
import { Wrench, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'

interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'executing' | 'success' | 'error';
  result?: string;
  error?: string;
  durationMs?: number;
  timestamp?: string;
}

interface ToolCallCardProps {
  toolCall: ToolCallDisplay;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = toolCall.status === 'executing'
    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
    : toolCall.status === 'success'
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    : <XCircle className="w-3.5 h-3.5 text-red-400" />;

  const durationStr = toolCall.durationMs != null
    ? `${(toolCall.durationMs / 1000).toFixed(2)}s`
    : null;

  return (
    <div className="my-1 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-white/5 transition-colors"
      >
        <Wrench className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span className="font-mono text-purple-300">{toolCall.name}</span>
        <span className="flex-1" />
        {durationStr && (
          <span className="flex items-center gap-1 text-white/40">
            <Clock className="w-3 h-3" />
            {durationStr}
          </span>
        )}
        {statusIcon}
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-white/40" />
          : <ChevronRight className="w-3.5 h-3.5 text-white/40" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/10 pt-2">
          {Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Input</div>
              <pre className="text-xs text-white/70 bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result != null && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Output</div>
              <pre className="text-xs text-white/70 bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-48">
                {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-red-400/60 mb-1">Error</div>
              <pre className="text-xs text-red-300 bg-red-950/30 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
