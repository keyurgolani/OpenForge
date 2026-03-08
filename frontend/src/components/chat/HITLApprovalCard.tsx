import { useState } from 'react'
import { AlertTriangle, Check, X, Wrench } from 'lucide-react'

interface HITLRequest {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  riskLevel?: string;
  actionSummary?: string;
}

interface HITLApprovalCardProps {
  request: HITLRequest;
  onApprove: (id: string, reason?: string) => void;
  onReject: (id: string, reason?: string) => void;
}

export function HITLApprovalCard({ request, onApprove, onReject }: HITLApprovalCardProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  const handleApprove = async () => {
    setLoading('approve');
    try {
      await onApprove(request.id, reason || undefined);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    setLoading('reject');
    try {
      await onReject(request.id, reason || undefined);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-amber-500/30 bg-amber-500/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/20">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-300">Tool Approval Required</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="font-mono text-sm text-purple-700">{request.toolName}</span>
          {request.riskLevel && (
            <span className="ml-auto text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-red-500/20 text-red-700 border border-red-500/30">
              {request.riskLevel} Risk
            </span>
          )}
        </div>

        {request.actionSummary && (
          <p className="text-sm text-white/70">{request.actionSummary}</p>
        )}

        {Object.keys(request.arguments).length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Arguments</div>
            <pre className="text-xs text-white/70 bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-32">
              {JSON.stringify(request.arguments, null, 2)}
            </pre>
          </div>
        )}

        <div>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full text-sm bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/30 focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleReject}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            {loading === 'reject' ? 'Rejecting...' : 'Reject'}
          </button>
          <button
            onClick={handleApprove}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50 ml-auto"
          >
            <Check className="w-3.5 h-3.5" />
            {loading === 'approve' ? 'Approving...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
