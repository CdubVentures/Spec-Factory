import type { PrefetchLlmCall } from '../types';
import { llmCallStatusBadgeClass, formatMs } from '../helpers';
import { Chip } from '../../../shared/ui/feedback/Chip';

interface LlmCallCardProps {
  call: PrefetchLlmCall;
}

export function LlmCallCard({ call }: LlmCallCardProps) {
  return (
    <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-3.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Chip label={call.status} className={llmCallStatusBadgeClass(call.status)} />
        {call.model && <span className="text-[11px] font-mono sf-text-muted">{call.model}</span>}
        {call.provider && <span className="text-[11px] font-mono sf-text-subtle">{call.provider}</span>}
        <span className="ml-auto flex items-baseline gap-3 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
          {call.tokens && <span>tok <strong className="sf-text-primary">{call.tokens.input}+{call.tokens.output}</strong></span>}
          {call.duration_ms !== undefined && <span>dur <strong className="sf-text-primary">{formatMs(call.duration_ms)}</strong></span>}
        </span>
      </div>
      {call.error && (
        <div className="px-3 py-2 rounded-sm border border-[var(--sf-state-error-border)] bg-[var(--sf-state-error-bg)] text-xs text-[var(--sf-state-error-fg)]">
          {call.error}
        </div>
      )}
      {call.prompt_preview && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">prompt</div>
          <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-sm p-3 font-mono text-[11px] sf-pre-block">{call.prompt_preview}</pre>
        </div>
      )}
      {call.response_preview && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">response</div>
          <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-sm p-3 font-mono text-[11px] sf-pre-block">{call.response_preview}</pre>
        </div>
      )}
    </div>
  );
}
