import type { PrefetchLlmCall } from '../../types';
import { llmCallStatusBadgeClass, formatMs } from '../../helpers';
import { usePersistedToggle } from '../../../../stores/collapseStore';

interface PrefetchLlmCallPanelProps {
  title: string;
  calls: PrefetchLlmCall[];
  emptyMessage: string;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="sf-surface-card rounded px-3 py-2 min-w-[8rem]">
      <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold sf-text-primary mt-0.5">{value}</div>
    </div>
  );
}

function LlmCallCard({ call, index }: { call: PrefetchLlmCall; index: number }) {
  const [expanded, toggleExpanded] = usePersistedToggle(`runtimeOps:llmCall:${index}`, false);
  const totalTokens = (call.tokens?.input ?? 0) + (call.tokens?.output ?? 0);

  return (
    <div className="sf-surface-card rounded">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="sf-text-caption font-mono sf-text-subtle w-5 shrink-0">#{index + 1}</span>
        <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${llmCallStatusBadgeClass(call.status)}`}>
          {call.status}
        </span>
        <span className="sf-text-caption font-mono sf-text-muted truncate flex-1">{call.reason}</span>
        {call.model && (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-neutral shrink-0">
            {call.model}
          </span>
        )}
        {call.provider && (
          <span className="sf-text-caption sf-text-subtle shrink-0">{call.provider}</span>
        )}
        <span className="sf-text-caption font-mono sf-text-subtle shrink-0">
          {totalTokens > 0 ? `${totalTokens} tok` : ''}
        </span>
        <span className="sf-text-caption font-mono sf-text-subtle shrink-0">
          {call.duration_ms > 0 ? formatMs(call.duration_ms) : ''}
        </span>
        {(call.prompt_preview || call.response_preview || call.error) && (
          <button
            type="button"
            onClick={() => toggleExpanded()}
            className="sf-text-caption sf-link-accent hover:underline shrink-0"
          >
            {expanded ? 'Hide' : 'Raw I/O'}
          </button>
        )}
      </div>
      {call.error && (
        <div className="px-3 pb-2 sf-text-caption sf-status-text-danger">{call.error}</div>
      )}
      {expanded && (
        <div className="border-t sf-border-soft px-3 py-2 space-y-2">
          {call.prompt_preview && (
            <div>
              <div className="sf-text-caption font-medium sf-text-subtle uppercase mb-0.5">Prompt</div>
              <pre className="sf-pre-block sf-text-label font-mono rounded p-2 overflow-x-auto overflow-y-auto max-h-40 whitespace-pre-wrap">
                {call.prompt_preview}
              </pre>
            </div>
          )}
          {call.response_preview && (
            <div>
              <div className="sf-text-caption font-medium sf-text-subtle uppercase mb-0.5">Response</div>
              <pre className="sf-pre-block sf-text-label font-mono rounded p-2 overflow-x-auto overflow-y-auto max-h-40 whitespace-pre-wrap">
                {call.response_preview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PrefetchLlmCallPanel({ title, calls, emptyMessage }: PrefetchLlmCallPanelProps) {
  const finished = calls.filter((c) => c.status === 'finished').length;
  const failed = calls.filter((c) => c.status === 'failed').length;
  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold sf-text-primary">{title}</h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${
            failed > 0
              ? 'sf-chip-danger'
              : 'sf-chip-success'
          }`}>
            {failed > 0 ? `${failed} failed` : `${finished} done`}
          </span>
        )}
      </div>

      {calls.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <StatCard label="Calls" value={calls.length} />
          <StatCard label="Tokens" value={totalTokens.toLocaleString()} />
          <StatCard label="Duration" value={totalDuration > 0 ? formatMs(totalDuration) : '-'} />
        </div>
      )}

      {calls.length > 0 ? (
        <div className="space-y-2">
          {calls.map((call, i) => (
            <LlmCallCard key={i} call={call} index={i} />
          ))}
        </div>
      ) : (
        <div className="text-sm sf-text-subtle text-center py-8">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
