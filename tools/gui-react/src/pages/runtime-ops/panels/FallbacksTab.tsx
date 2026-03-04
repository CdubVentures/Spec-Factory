import { useMemo } from 'react';
import { usePersistedNullableTab, usePersistedTab } from '../../../stores/tabStore';
import type { FallbacksResponse, FallbackEventRow } from '../types';
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
  category: string;
  onNavigateToDocuments?: (host: string) => void;
}

function SuccessRateBar({ rate }: { rate: number }) {
  const toneVar = rate >= 0.7
    ? '--sf-state-success-border'
    : rate >= 0.4
      ? '--sf-state-warning-border'
      : '--sf-state-danger-border';
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-20 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'rgb(var(--sf-color-border-subtle-rgb) / 0.34)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round(rate * 100)}%`, background: `var(${toneVar})` }}
        />
      </div>
      <span className="sf-text-caption sf-text-subtle font-mono">{pctString(rate)}</span>
    </div>
  );
}

const FALLBACK_RESULT_FILTER_KEYS = [
  'pending',
  'succeeded',
  'exhausted',
  'failed',
] as const;

export function FallbacksTab({ fallbacks, category, onNavigateToDocuments }: FallbacksTabProps) {
  const [hostFilter, setHostFilter] = usePersistedTab<string>(
    `runtimeOps:fallbacks:host:${category}`,
    '',
  );
  const [resultFilter, setResultFilter] = usePersistedNullableTab<string>(
    `runtimeOps:fallbacks:result:${category}`,
    null,
    { validValues: FALLBACK_RESULT_FILTER_KEYS },
  );

  const events = fallbacks?.events ?? [];
  const hostProfiles = fallbacks?.host_profiles ?? [];
  const profileHosts = useMemo(
    () => hostProfiles.map((profile) => profile.host),
    [hostProfiles],
  );
  const [selectedProfileHost, setSelectedProfileHost] = usePersistedNullableTab<string>(
    `runtimeOps:fallbacks:selectedProfile:${category}`,
    null,
    { validValues: profileHosts },
  );
  const selectedProfile = useMemo(
    () => hostProfiles.find((profile) => profile.host === selectedProfileHost) ?? null,
    [hostProfiles, selectedProfileHost],
  );

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
          <div className="px-4 py-2 flex gap-2 overflow-x-auto border-b sf-border-soft">
            {topHosts.map((hp) => (
              <button
                key={hp.host}
                type="button"
                onClick={() => setSelectedProfileHost(selectedProfile?.host === hp.host ? null : hp.host)}
                className={`shrink-0 p-2 rounded border text-left text-xs transition-colors sf-border-soft sf-surface-elevated ${
                  selectedProfile?.host === hp.host ? '' : 'sf-row-hoverable'
                }`}
                style={selectedProfile?.host === hp.host
                  ? {
                    borderColor: 'rgb(var(--sf-color-accent-rgb) / 0.72)',
                    background: 'rgb(var(--sf-color-accent-rgb) / 0.14)',
                  }
                  : undefined}
              >
                <div className="font-mono font-medium sf-text-primary mb-1 truncate max-w-[10rem]">
                  {hp.host}
                </div>
                <div className="flex items-center gap-2">
                  <span className="sf-text-subtle">{hp.fallback_total} fallbacks</span>
                  <SuccessRateBar rate={hp.success_rate} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b sf-border-soft">
          <input
            type="text"
            placeholder="Filter by host or URL..."
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            className="flex-1 text-xs px-2 py-1 sf-input"
          />
          <select
            value={resultFilter || ''}
            onChange={(e) => setResultFilter(e.target.value || null)}
            className="text-xs px-2 py-1 sf-select"
          >
            <option value="">All results</option>
            <option value="pending">Pending</option>
            <option value="succeeded">Succeeded</option>
            <option value="exhausted">Exhausted</option>
            <option value="failed">Failed</option>
          </select>
          <span className="text-xs sf-text-subtle">{filtered.length}/{events.length}</span>
        </div>

        {/* Table */}
        <div className="sf-table-shell rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="sf-table-head sticky top-0">
              <tr>
                <th className="sf-table-head-cell text-left px-3 py-2">URL<Tip text={METRIC_TIPS.fb_url} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Host<Tip text={METRIC_TIPS.fb_host} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Transition<Tip text={METRIC_TIPS.fb_transition} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Reason<Tip text={METRIC_TIPS.fb_reason} /></th>
                <th className="sf-table-head-cell text-right px-3 py-2">#<Tip text={METRIC_TIPS.fb_attempt} /></th>
                <th className="sf-table-head-cell text-left px-3 py-2">Result<Tip text={METRIC_TIPS.fb_result} /></th>
                <th className="sf-table-head-cell text-right px-3 py-2">Time<Tip text={METRIC_TIPS.fb_time} /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: FallbackEventRow, i: number) => (
                <tr
                  key={`${e.url}-${e.ts}-${i}`}
                  onClick={() => {
                    const prof = hostProfiles.find((p) => p.host === e.host) || null;
                    setSelectedProfileHost(selectedProfile?.host === e.host ? null : prof?.host ?? null);
                  }}
                  className={`cursor-pointer sf-table-row ${selectedProfile?.host === e.host ? 'sf-table-row-active' : ''}`}
                  style={e.result === 'exhausted'
                    ? {
                      borderLeftWidth: '2px',
                      borderLeftStyle: 'solid',
                      borderLeftColor: 'var(--sf-state-danger-border)',
                    }
                    : undefined}
                >
                  <td className="px-3 py-2 font-mono sf-text-muted max-w-[14rem] truncate">
                    {truncateUrl(e.url, 45)}
                  </td>
                  <td className="px-3 py-2 font-mono sf-text-subtle">{e.host}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {e.from_mode && (
                        <span className={`px-1 py-0.5 rounded sf-text-caption ${fetchModeBadgeClass(e.from_mode)}`}>
                          {e.from_mode}
                        </span>
                      )}
                      <span className="sf-text-subtle">{'\u2192'}</span>
                      {e.to_mode && (
                        <span className={`px-1 py-0.5 rounded sf-text-caption ${fetchModeBadgeClass(e.to_mode)}`}>
                          {e.to_mode}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 sf-text-muted max-w-[10rem] truncate">{e.reason}</td>
                  <td className="px-3 py-2 text-right font-mono">{e.attempt}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${fallbackResultBadgeClass(e.result)}`}>
                      {e.result}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono sf-text-subtle">
                    {e.elapsed_ms > 0 ? formatMs(e.elapsed_ms) : '-'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center sf-text-subtle">
                    No fallback events
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Host profile inspector */}
      {selectedProfile && (
        <div className="w-80 shrink-0 border-l sf-border-soft overflow-y-auto p-4">
          <h3 className="text-sm font-semibold sf-text-primary mb-3">
            Host Fallback Profile
          </h3>

          <dl className="space-y-2 text-xs mb-4">
            <div>
              <dt className="sf-text-subtle">Host</dt>
              <dd className="font-mono font-medium sf-text-primary">{selectedProfile.host}</dd>
            </div>
            <div>
              <dt className="sf-text-subtle mb-1">Success Rate</dt>
              <dd><SuccessRateBar rate={selectedProfile.success_rate} /></dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="sf-text-subtle">Total</dt>
                <dd className="font-mono">{selectedProfile.fallback_total}</dd>
              </div>
              <div>
                <dt className="sf-text-subtle">Succeeded</dt>
                <dd className="font-mono sf-status-text-success">{selectedProfile.success_count}</dd>
              </div>
              <div>
                <dt className="sf-text-subtle">Exhausted</dt>
                <dd className={`font-mono ${selectedProfile.exhaustion_count > 0 ? 'sf-status-text-danger' : ''}`}>
                  {selectedProfile.exhaustion_count}
                </dd>
              </div>
              <div>
                <dt className="sf-text-subtle">Blocked</dt>
                <dd className={`font-mono ${selectedProfile.blocked_count > 0 ? 'sf-status-text-danger' : ''}`}>
                  {selectedProfile.blocked_count}
                </dd>
              </div>
            </div>
          </dl>

          <h4 className="text-xs font-semibold sf-text-subtle uppercase tracking-wide mb-2">
            Modes Used
          </h4>
          <div className="flex flex-wrap gap-1 mb-4">
            {selectedProfile.modes_used.map((m) => (
              <span key={m} className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${fetchModeBadgeClass(m)}`}>
                {m}
              </span>
            ))}
          </div>

          {selectedProfile.exhaustion_count > 0 && (
            <div className="mb-3 p-2 sf-callout sf-callout-danger text-xs">
              All fetch modes have been exhausted for {selectedProfile.exhaustion_count} URL(s) on this host.
              The host may be blocking automated access entirely. Consider adding a longer cooldown
              or blocking this domain if it is not a critical source.
            </div>
          )}
          {selectedProfile.success_rate < 0.4 && selectedProfile.fallback_total > 3 && (
            <div className="mb-3 p-2 sf-callout sf-callout-warning text-xs">
              Low fallback success rate ({pctString(selectedProfile.success_rate)}). This host may require a specific
              fetch mode or may be unreliable. Check if Playwright mode works better for this domain.
            </div>
          )}

          {onNavigateToDocuments && (
            <button
              type="button"
              onClick={() => onNavigateToDocuments(selectedProfile.host)}
              className="w-full text-xs text-center py-2 sf-action-button transition-colors"
            >
              View Documents
            </button>
          )}
        </div>
      )}
    </div>
  );
}
