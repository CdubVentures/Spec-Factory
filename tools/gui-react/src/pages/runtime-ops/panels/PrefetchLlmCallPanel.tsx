import type { PrefetchLlmCall } from '../types';
import { llmCallStatusBadgeClass, formatMs } from '../helpers';
import { usePersistedToggle } from '../../../stores/collapseStore';

interface PrefetchLlmCallPanelProps {
  title: string;
  calls: PrefetchLlmCall[];
  emptyMessage: string;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}

function LlmCallCard({ call, index }: { call: PrefetchLlmCall; index: number }) {
  const [expanded, toggleExpanded] = usePersistedToggle(`runtimeOps:llmCall:${index}`, false);
  const totalTokens = (call.tokens?.input ?? 0) + (call.tokens?.output ?? 0);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-5 shrink-0">#{index + 1}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(call.status)}`}>
          {call.status}
        </span>
        <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate flex-1">{call.reason}</span>
        {call.model && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 shrink-0">
            {call.model}
          </span>
        )}
        {call.provider && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{call.provider}</span>
        )}
        <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 shrink-0">
          {totalTokens > 0 ? `${totalTokens} tok` : ''}
        </span>
        <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 shrink-0">
          {call.duration_ms > 0 ? formatMs(call.duration_ms) : ''}
        </span>
        {(call.prompt_preview || call.response_preview || call.error) && (
          <button
            type="button"
            onClick={() => toggleExpanded()}
            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            {expanded ? 'Hide' : 'Raw I/O'}
          </button>
        )}
      </div>
      {call.error && (
        <div className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{call.error}</div>
      )}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/50 px-3 py-2 space-y-2">
          {call.prompt_preview && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase mb-0.5">Prompt</div>
              <pre className="text-[11px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {call.prompt_preview}
              </pre>
            </div>
          )}
          {call.response_preview && (
            <div>
              <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase mb-0.5">Response</div>
              <pre className="text-[11px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
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
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            failed > 0
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
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
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}
