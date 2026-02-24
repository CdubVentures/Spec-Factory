import type { PrefetchLlmCall, UrlPredictionsData } from '../types';
import { llmCallStatusBadgeClass, formatMs, triageDecisionBadgeClass, riskFlagBadgeClass } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';

interface PrefetchUrlPredictorPanelProps {
  calls: PrefetchLlmCall[];
  urlPredictions?: UrlPredictionsData | null;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}

export function PrefetchUrlPredictorPanel({ calls, urlPredictions }: PrefetchUrlPredictorPanelProps) {
  const predictions = urlPredictions?.predictions || [];
  const hasStructured = urlPredictions !== null && urlPredictions !== undefined;
  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);

  const allTargetFields = [...new Set(predictions.flatMap((p) => p.target_fields))];

  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">URL Predictor</h3>
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No URL prediction calls yet. This LLM step predicts likely manufacturer spec page URLs.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">URL Predictor</h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(calls[0].status)}`}>
            {calls[0].status}
          </span>
        )}
      </div>

      {/* Budget Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Predictions" value={predictions.length} />
        {hasStructured && <StatCard label="Remaining Budget" value={urlPredictions!.remaining_budget} />}
        {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} />}
        {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} />}
      </div>

      {/* Candidates Table */}
      {predictions.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2 font-medium">URL</th>
                <th className="text-left px-3 py-2 font-medium">Domain</th>
                <th className="text-left px-3 py-2 font-medium w-24">Payoff</th>
                <th className="text-left px-3 py-2 font-medium">Target Fields</th>
                <th className="text-left px-3 py-2 font-medium">Risk</th>
                <th className="text-left px-3 py-2 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100 truncate max-w-[16rem]" title={p.url}>{p.url}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{p.domain}</td>
                  <td className="px-3 py-1.5">
                    <ScoreBar value={p.predicted_payoff} max={100} label={String(Math.round(p.predicted_payoff))} />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-0.5">
                      {p.target_fields.slice(0, 4).map((f) => (
                        <span key={f} className="px-1 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{f}</span>
                      ))}
                      {p.target_fields.length > 4 && (
                        <span className="text-[9px] text-gray-400">+{p.target_fields.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-0.5">
                      {p.risk_flags.map((f) => (
                        <span key={f} className={`px-1 py-0.5 rounded text-[9px] font-medium ${riskFlagBadgeClass(f)}`}>{f}</span>
                      ))}
                      {p.risk_flags.length === 0 && <span className="text-gray-400 text-[10px]">-</span>}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${triageDecisionBadgeClass(p.decision)}`}>{p.decision}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Coverage Heatmap */}
      {predictions.length > 0 && allTargetFields.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
            URL x Field Coverage
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="text-[9px]">
              <thead>
                <tr>
                  <th className="px-1 py-1 text-left font-medium text-gray-500">URL</th>
                  {allTargetFields.map((f) => (
                    <th key={f} className="px-1 py-1 font-medium text-gray-500 text-center" style={{ writingMode: 'vertical-lr' }}>{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {predictions.slice(0, 20).map((p, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-1 py-0.5 font-mono text-gray-600 dark:text-gray-400 truncate max-w-[10rem]">{p.domain}</td>
                    {allTargetFields.map((f) => (
                      <td key={f} className="px-1 py-0.5 text-center">
                        {p.target_fields.includes(f) ? (
                          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
                        ) : (
                          <span className="inline-block w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Debug Section */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          Debug: LLM Prompt/Response
        </summary>
        <div className="mt-2 space-y-2">
          {calls.map((call, i) => (
            <div key={i} className="space-y-1">
              {call.prompt_preview && (
                <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.prompt_preview}</pre>
              )}
              {call.response_preview && (
                <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.response_preview}</pre>
              )}
            </div>
          ))}
          {hasStructured && (
            <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(urlPredictions, null, 2)}</pre>
          )}
        </div>
      </details>
    </div>
  );
}
