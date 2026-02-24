import type { PrefetchLlmCall, DomainHealthRow } from '../types';
import { llmCallStatusBadgeClass, formatMs, domainRoleBadgeClass, safetyClassBadgeClass, pctString } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';

interface PrefetchDomainClassifierPanelProps {
  calls: PrefetchLlmCall[];
  domainHealth?: DomainHealthRow[];
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}

export function PrefetchDomainClassifierPanel({ calls, domainHealth }: PrefetchDomainClassifierPanelProps) {
  const health = domainHealth || [];
  const hasStructured = health.length > 0;
  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);

  const safeCount = health.filter((d) => d.safety_class === 'safe').length;
  const blockedCount = health.filter((d) => d.safety_class === 'blocked' || d.safety_class === 'unsafe').length;
  const cooldownCount = health.filter((d) => d.cooldown_remaining > 0).length;

  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Domain Classifier</h3>
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No domain classification calls yet. This LLM step classifies domain safety and source tier.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Domain Classifier</h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(calls[0].status)}`}>
            {calls[0].status}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Domains" value={health.length} />
        {safeCount > 0 && <StatCard label="Safe" value={safeCount} />}
        {blockedCount > 0 && <StatCard label="Blocked" value={blockedCount} />}
        {cooldownCount > 0 && <StatCard label="In Cooldown" value={cooldownCount} />}
        {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} />}
        {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} />}
      </div>

      {/* Domain Health Dashboard Table */}
      {hasStructured && (
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2 font-medium">Domain</th>
                <th className="text-left px-3 py-2 font-medium">Role</th>
                <th className="text-left px-3 py-2 font-medium">Safety</th>
                <th className="text-left px-3 py-2 font-medium w-24">Budget</th>
                <th className="text-right px-3 py-2 font-medium">Success</th>
                <th className="text-right px-3 py-2 font-medium">Latency</th>
                <th className="text-left px-3 py-2 font-medium">Cooldown</th>
                <th className="text-left px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {health.map((d, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100">{d.domain}</td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${domainRoleBadgeClass(d.role)}`}>{d.role || '-'}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${safetyClassBadgeClass(d.safety_class)}`}>{d.safety_class}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <ScoreBar value={d.budget_score} max={100} label={String(Math.round(d.budget_score))} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {d.success_rate > 0 ? pctString(d.success_rate) : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-500 dark:text-gray-400">
                    {d.avg_latency_ms > 0 ? formatMs(d.avg_latency_ms) : '-'}
                  </td>
                  <td className="px-3 py-1.5">
                    {d.cooldown_remaining > 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        {formatMs(d.cooldown_remaining * 1000)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 truncate max-w-[10rem]">{d.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Debug Section */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          Debug: Raw Classification Data
        </summary>
        <div className="mt-2 space-y-2">
          {calls.map((call, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${llmCallStatusBadgeClass(call.status)}`}>{call.status}</span>
                <span className="text-[10px] text-gray-400">{call.model}</span>
              </div>
              {call.prompt_preview && (
                <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.prompt_preview}</pre>
              )}
              {call.response_preview && (
                <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.response_preview}</pre>
              )}
            </div>
          ))}
          {hasStructured && (
            <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(health, null, 2)}</pre>
          )}
        </div>
      </details>
    </div>
  );
}
