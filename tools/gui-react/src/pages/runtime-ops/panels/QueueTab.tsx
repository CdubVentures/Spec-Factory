import { useMemo } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { QueueStateResponse, LaneSummary, BlockedHostEntry } from '../types';
import { queueStatusBadgeClass, truncateUrl, METRIC_TIPS, timeUntil } from '../helpers';
import { Tip } from '../../../components/common/Tip';
import { relativeTime } from '../../../utils/formatting';

interface QueueTabProps {
  queueState: QueueStateResponse | undefined;
  category: string;
  onNavigateToDocuments?: (host: string) => void;
}

function LaneCard({
  lane,
  isActive,
  onClick,
}: {
  lane: LaneSummary;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 p-2.5 rounded border text-left text-xs transition-colors ${
        isActive
          ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <div className="font-medium text-gray-800 dark:text-gray-200 mb-1.5">{lane.lane}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
        <span className="text-gray-500 dark:text-gray-400">
          Q:<span className="font-mono ml-0.5 text-gray-700 dark:text-gray-300">{lane.queued}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          R:<span className="font-mono ml-0.5 text-blue-600 dark:text-blue-400">{lane.running}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          D:<span className="font-mono ml-0.5 text-green-600 dark:text-green-400">{lane.done}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          F:<span className={`font-mono ml-0.5 ${lane.failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
            {lane.failed}
          </span>
        </span>
      </div>
    </button>
  );
}

export function QueueTab({ queueState, category, onNavigateToDocuments }: QueueTabProps) {
  const [blockedExpanded, toggleBlockedExpanded] = usePersistedToggle(`runtimeOps:queue:blocked:${category}`, false);

  const jobs = queueState?.jobs ?? [];
  const jobIds = useMemo(
    () => jobs.map((job) => job.id),
    [jobs],
  );
  const [selectedJobId, setSelectedJobId] = usePersistedNullableTab<string>(
    `runtimeOps:queue:selectedJob:${category}`,
    null,
    { validValues: jobIds },
  );
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );
  const laneSummary = queueState?.lane_summary ?? [];
  const blockedHosts = queueState?.blocked_hosts ?? [];
  const laneFilterValues = useMemo(
    () => laneSummary.map((lane) => lane.lane),
    [laneSummary],
  );
  const [laneFilter, setLaneFilter] = usePersistedNullableTab<string>(
    `runtimeOps:queue:lane:${category}`,
    null,
    { validValues: laneFilterValues },
  );

  const filtered = useMemo(() => {
    if (!laneFilter) return jobs;
    return jobs.filter((j) => j.lane === laneFilter);
  }, [jobs, laneFilter]);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto">
        {/* Lane summary cards */}
        {laneSummary.length > 0 && (
          <div className="px-4 py-2 flex gap-2 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
            {laneSummary.map((ls) => (
              <LaneCard
                key={ls.lane}
                lane={ls}
                isActive={laneFilter === ls.lane}
                onClick={() => setLaneFilter(laneFilter === ls.lane ? null : ls.lane)}
              />
            ))}
          </div>
        )}

        {/* Job table */}
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">ID<Tip text={METRIC_TIPS.q_id} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Lane<Tip text={METRIC_TIPS.q_lane} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Status<Tip text={METRIC_TIPS.q_status} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Host<Tip text={METRIC_TIPS.q_host} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">URL<Tip text={METRIC_TIPS.q_url} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Reason<Tip text={METRIC_TIPS.q_reason} /></th>
              <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Cooldown<Tip text={METRIC_TIPS.q_cooldown} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => (
              <tr
                key={j.id}
                onClick={() => setSelectedJobId(selectedJob?.id === j.id ? null : j.id)}
                className={`cursor-pointer border-b border-gray-100 dark:border-gray-700/50 transition-colors ${
                  selectedJob?.id === j.id
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 max-w-[6rem] truncate">{j.id}</td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    {j.lane}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${queueStatusBadgeClass(j.status)}`}>
                    {j.status}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{j.host}</td>
                <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400 max-w-[14rem] truncate">
                  {truncateUrl(j.url, 40)}
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[10rem] truncate">{j.reason}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-gray-400" title={j.cooldown_until || ''}>
                  {j.cooldown_until ? timeUntil(j.cooldown_until) : '-'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                  No queue jobs
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Blocked hosts collapsible */}
        {blockedHosts.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => toggleBlockedExpanded()}
              className={`w-full flex items-center justify-between px-4 py-2 text-xs font-medium transition-colors ${
                blockedHosts.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'
              } hover:bg-gray-50 dark:hover:bg-gray-800/50`}
            >
              <span>Blocked Hosts ({blockedHosts.length})<Tip text={METRIC_TIPS.q_blocked_hosts} /></span>
              <span>{blockedExpanded ? '\u25B2' : '\u25BC'}</span>
            </button>
            {blockedExpanded && (
              <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400 italic">
                Blocked hosts have exceeded the failure threshold and are temporarily excluded from fetching.
                They will be retried after the cooldown period expires.
              </p>
            )}
            {blockedExpanded && (
              <table className="w-full text-xs">
                <thead className="bg-red-50 dark:bg-red-900/10">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-red-600 dark:text-red-400 font-medium">Host</th>
                    <th className="text-right px-3 py-1.5 text-red-600 dark:text-red-400 font-medium">Blocked</th>
                    <th className="text-right px-3 py-1.5 text-red-600 dark:text-red-400 font-medium">Threshold</th>
                    <th className="text-right px-3 py-1.5 text-red-600 dark:text-red-400 font-medium">Removed</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedHosts.map((b: BlockedHostEntry) => (
                    <tr key={b.host} className="border-b border-red-100 dark:border-red-900/20">
                      <td className="px-3 py-1.5 font-mono">{b.host}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-red-600 dark:text-red-400">{b.blocked_count}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{b.threshold}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{b.removed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Job detail inspector */}
      {selectedJob && (
        <div className="w-80 shrink-0 border-l border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Job Detail
          </h3>

          <dl className="space-y-2 text-xs mb-4">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">ID</dt>
              <dd className="font-mono text-gray-800 dark:text-gray-200">{selectedJob.id}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Lane</dt>
                <dd className="font-mono">{selectedJob.lane}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                <dd>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${queueStatusBadgeClass(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Host</dt>
              <dd className="font-mono">{selectedJob.host}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">URL</dt>
              <dd className="font-mono text-gray-800 dark:text-gray-200 break-all">{selectedJob.url}</dd>
            </div>
            {selectedJob.query && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Query</dt>
                <dd className="font-mono text-gray-700 dark:text-gray-300">{selectedJob.query}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Reason</dt>
              <dd className="text-gray-700 dark:text-gray-300">{selectedJob.reason}</dd>
            </div>
            {selectedJob.field_targets.length > 0 && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Field Targets</dt>
                <dd className="flex flex-wrap gap-1 mt-0.5">
                  {selectedJob.field_targets.map((f) => (
                    <span key={f} className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {f}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {selectedJob.cooldown_until && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Cooldown Until</dt>
                <dd className="font-mono text-yellow-600 dark:text-yellow-400" title={selectedJob.cooldown_until}>
                  {timeUntil(selectedJob.cooldown_until)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Created</dt>
              <dd className="font-mono text-gray-400" title={selectedJob.created_at}>
                {relativeTime(selectedJob.created_at)}
              </dd>
            </div>
          </dl>

          {selectedJob.transitions.length > 0 && (
            <>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Transition History
              </h4>
              <div className="space-y-2 mb-4">
                {selectedJob.transitions.map((t, i) => (
                  <div key={`${t.ts}-${i}`} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-500 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <span className={`px-1 py-0.5 rounded text-[10px] ${queueStatusBadgeClass(t.from_status)}`}>
                          {t.from_status}
                        </span>
                        <span className="text-gray-400">{'\u2192'}</span>
                        <span className={`px-1 py-0.5 rounded text-[10px] ${queueStatusBadgeClass(t.to_status)}`}>
                          {t.to_status}
                        </span>
                      </div>
                      {t.reason && (
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{t.reason}</div>
                      )}
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-0.5" title={t.ts}>{relativeTime(t.ts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {onNavigateToDocuments && selectedJob.host && (
            <button
              type="button"
              onClick={() => onNavigateToDocuments(selectedJob.host)}
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
