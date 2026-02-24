import { useMemo, useState } from 'react';
import type { FallbacksResponse, FallbackEventRow, HostFallbackProfile } from '../types';
import {
  fallbackResultBadgeClass,
  fetchModeBadgeClass,
  truncateUrl,
  formatMs,
  pctString,
  METRIC_TIPS,
} from '../helpers';
import { Tip } from '../../../components/common/Tip';

interface FallbacksTabProps {
  fallbacks: FallbacksResponse | undefined;
  onNavigateToDocuments?: (host: string) => void;
}

function SuccessRateBar({ rate }: { rate: number }) {
  const color = rate >= 0.7 ? 'bg-green-500' : rate >= 0.4 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(rate * 100)}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{pctString(rate)}</span>
    </div>
  );
}

export function FallbacksTab({ fallbacks, onNavigateToDocuments }: FallbacksTabProps) {
  const [hostFilter, setHostFilter] = useState('');
  const [resultFilter, setResultFilter] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<HostFallbackProfile | null>(null);

  const events = fallbacks?.events ?? [];
  const hostProfiles = fallbacks?.host_profiles ?? [];

  const hosts = useMemo(() => {
    const set = new Set(events.map((e) => e.host).filter(Boolean));
    return Array.from(set).sort();
  }, [events]);

  const topHosts = useMemo(
    () => [...hostProfiles].sort((a, b) => b.fallback_total - a.fallback_total).slice(0, 5),
    [hostProfiles],
  );

  const filtered = useMemo(() => {
    let list = events;
    if (hostFilter) {
      const lower = hostFilter.toLowerCase();
      list = list.filter((e) => e.host.toLowerCase().includes(lower) || e.url.toLowerCase().includes(lower));
    }
    if (resultFilter) list = list.filter((e) => e.result === resultFilter);
    return list;
  }, [events, hostFilter, resultFilter]);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
        {/* Top host summary cards */}
        {topHosts.length > 0 && (
          <div className="px-4 py-2 flex gap-2 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
            {topHosts.map((hp) => (
              <button
                key={hp.host}
                type="button"
                onClick={() => setSelectedProfile(selectedProfile?.host === hp.host ? null : hp)}
                className={`shrink-0 p-2 rounded border text-left text-xs transition-colors ${
                  selectedProfile?.host === hp.host
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <div className="font-mono font-medium text-gray-800 dark:text-gray-200 mb-1 truncate max-w-[10rem]">
                  {hp.host}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">{hp.fallback_total} fallbacks</span>
                  <SuccessRateBar rate={hp.success_rate} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="Filter by host or URL..."
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            className="flex-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
          />
          <select
            value={resultFilter || ''}
            onChange={(e) => setResultFilter(e.target.value || null)}
            className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
          >
            <option value="">All results</option>
            <option value="pending">Pending</option>
            <option value="succeeded">Succeeded</option>
            <option value="exhausted">Exhausted</option>
            <option value="failed">Failed</option>
          </select>
          <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length}/{events.length}</span>
        </div>

        {/* Table */}
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">URL<Tip text={METRIC_TIPS.fb_url} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Host<Tip text={METRIC_TIPS.fb_host} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Transition<Tip text={METRIC_TIPS.fb_transition} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Reason<Tip text={METRIC_TIPS.fb_reason} /></th>
              <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">#<Tip text={METRIC_TIPS.fb_attempt} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Result<Tip text={METRIC_TIPS.fb_result} /></th>
              <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Time<Tip text={METRIC_TIPS.fb_time} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e: FallbackEventRow, i: number) => (
              <tr
                key={`${e.url}-${e.ts}-${i}`}
                onClick={() => {
                  const prof = hostProfiles.find((p) => p.host === e.host) || null;
                  setSelectedProfile(selectedProfile?.host === e.host ? null : prof);
                }}
                className={`cursor-pointer border-b transition-colors ${
                  e.result === 'exhausted'
                    ? 'border-l-2 border-l-red-400 border-b-gray-100 dark:border-b-gray-700/50'
                    : 'border-gray-100 dark:border-gray-700/50'
                } ${
                  selectedProfile?.host === e.host
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 max-w-[14rem] truncate">
                  {truncateUrl(e.url, 45)}
                </td>
                <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{e.host}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {e.from_mode && (
                      <span className={`px-1 py-0.5 rounded text-[10px] ${fetchModeBadgeClass(e.from_mode)}`}>
                        {e.from_mode}
                      </span>
                    )}
                    <span className="text-gray-400">{'\u2192'}</span>
                    {e.to_mode && (
                      <span className={`px-1 py-0.5 rounded text-[10px] ${fetchModeBadgeClass(e.to_mode)}`}>
                        {e.to_mode}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[10rem] truncate">{e.reason}</td>
                <td className="px-3 py-2 text-right font-mono">{e.attempt}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${fallbackResultBadgeClass(e.result)}`}>
                    {e.result}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-500 dark:text-gray-400">
                  {e.elapsed_ms > 0 ? formatMs(e.elapsed_ms) : '-'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                  No fallback events
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Host profile inspector */}
      {selectedProfile && (
        <div className="w-80 shrink-0 border-l border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Host Fallback Profile
          </h3>

          <dl className="space-y-2 text-xs mb-4">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Host</dt>
              <dd className="font-mono font-medium text-gray-800 dark:text-gray-200">{selectedProfile.host}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400 mb-1">Success Rate</dt>
              <dd><SuccessRateBar rate={selectedProfile.success_rate} /></dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Total</dt>
                <dd className="font-mono">{selectedProfile.fallback_total}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Succeeded</dt>
                <dd className="font-mono text-green-600 dark:text-green-400">{selectedProfile.success_count}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Exhausted</dt>
                <dd className={`font-mono ${selectedProfile.exhaustion_count > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {selectedProfile.exhaustion_count}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Blocked</dt>
                <dd className={`font-mono ${selectedProfile.blocked_count > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {selectedProfile.blocked_count}
                </dd>
              </div>
            </div>
          </dl>

          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Modes Used
          </h4>
          <div className="flex flex-wrap gap-1 mb-4">
            {selectedProfile.modes_used.map((m) => (
              <span key={m} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${fetchModeBadgeClass(m)}`}>
                {m}
              </span>
            ))}
          </div>

          {selectedProfile.exhaustion_count > 0 && (
            <div className="mb-3 p-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-xs text-red-700 dark:text-red-300">
              All fetch modes have been exhausted for {selectedProfile.exhaustion_count} URL(s) on this host.
              The host may be blocking automated access entirely. Consider adding a longer cooldown
              or blocking this domain if it is not a critical source.
            </div>
          )}
          {selectedProfile.success_rate < 0.4 && selectedProfile.fallback_total > 3 && (
            <div className="mb-3 p-2 rounded border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 text-xs text-yellow-700 dark:text-yellow-300">
              Low fallback success rate ({pctString(selectedProfile.success_rate)}). This host may require a specific
              fetch mode or may be unreliable. Check if Playwright mode works better for this domain.
            </div>
          )}

          {onNavigateToDocuments && (
            <button
              type="button"
              onClick={() => onNavigateToDocuments(selectedProfile.host)}
              className="w-full text-xs text-center py-2 rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              View Documents
            </button>
          )}
        </div>
      )}
    </div>
  );
}
