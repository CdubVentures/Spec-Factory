import { useMemo } from 'react';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import { usePersistedNullableTab } from '../../../../stores/tabStore.ts';
import type { QueueStateResponse, LaneSummary, BlockedHostEntry } from '../../types.ts';
import { queueStatusBadgeClass, truncateUrl, METRIC_TIPS, timeUntil } from '../../helpers.ts';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { relativeTime } from '../../../../utils/formatting.ts';

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
      className={`shrink-0 p-2.5 rounded text-left sf-text-caption transition-colors sf-nav-item ${isActive ? 'sf-nav-item-active' : ''}`}
    >
      <div className="mb-1.5 font-medium sf-text-primary">{lane.lane}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sf-text-caption">
        <span className="sf-text-muted">
          Q:<span className="ml-0.5 font-mono sf-text-primary">{lane.queued}</span>
        </span>
        <span className="sf-text-muted">
          R:<span className="ml-0.5 font-mono sf-status-text-info">{lane.running}</span>
        </span>
        <span className="sf-text-muted">
          D:<span className="ml-0.5 font-mono sf-status-text-success">{lane.done}</span>
        </span>
        <span className="sf-text-muted">
          F:<span className={`ml-0.5 font-mono ${lane.failed > 0 ? 'sf-status-text-danger' : 'sf-text-muted'}`}>
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
          <div className="flex gap-2 overflow-x-auto border-b sf-border-default px-4 py-2">
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
        <table className="w-full sf-text-caption">
          <thead className="sticky top-0 sf-table-head">
            <tr>
              <th className="px-3 py-2 sf-table-head-cell">ID<Tip text={METRIC_TIPS.q_id} /></th>
              <th className="px-3 py-2 sf-table-head-cell">Lane<Tip text={METRIC_TIPS.q_lane} /></th>
              <th className="px-3 py-2 sf-table-head-cell">Status<Tip text={METRIC_TIPS.q_status} /></th>
              <th className="px-3 py-2 sf-table-head-cell">Host<Tip text={METRIC_TIPS.q_host} /></th>
              <th className="px-3 py-2 sf-table-head-cell">URL<Tip text={METRIC_TIPS.q_url} /></th>
              <th className="px-3 py-2 sf-table-head-cell">Reason<Tip text={METRIC_TIPS.q_reason} /></th>
              <th className="px-3 py-2 sf-table-head-cell">Cooldown<Tip text={METRIC_TIPS.q_cooldown} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((j) => (
              <tr
                key={j.id}
                onClick={() => setSelectedJobId(selectedJob?.id === j.id ? null : j.id)}
                className={`cursor-pointer border-b sf-border-soft sf-table-row ${selectedJob?.id === j.id ? 'sf-table-row-active' : ''}`}
              >
                <td className="max-w-[6rem] truncate px-3 py-2 font-mono sf-text-muted">{j.id}</td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-neutral">
                    {j.lane}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${queueStatusBadgeClass(j.status)}`}>
                    {j.status}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono sf-text-muted">{j.host}</td>
                <td className="max-w-[14rem] truncate px-3 py-2 font-mono sf-text-muted">
                  {truncateUrl(j.url, 40)}
                </td>
                <td className="max-w-[10rem] truncate px-3 py-2 sf-text-muted">{j.reason}</td>
                <td className="px-3 py-2 font-mono sf-text-caption sf-text-subtle" title={j.cooldown_until || ''}>
                  {j.cooldown_until ? timeUntil(j.cooldown_until) : '-'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center sf-table-empty-state">
                  No queue jobs
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Blocked hosts collapsible */}
        {blockedHosts.length > 0 && (
          <div className="border-t sf-border-default">
            <button
              type="button"
              onClick={() => toggleBlockedExpanded()}
              className="flex w-full items-center justify-between px-4 py-2 sf-text-caption font-medium sf-status-text-danger sf-row-hoverable transition-colors"
            >
              <span>Blocked Hosts ({blockedHosts.length})<Tip text={METRIC_TIPS.q_blocked_hosts} /></span>
              <span>{blockedExpanded ? '\u25B2' : '\u25BC'}</span>
            </button>
            {blockedExpanded && (
              <p className="px-4 py-2 sf-text-caption sf-callout sf-callout-danger italic">
                Blocked hosts have exceeded the failure threshold and are temporarily excluded from fetching.
                They will be retried after the cooldown period expires.
              </p>
            )}
            {blockedExpanded && (
              <table className="w-full sf-text-caption">
                <thead className="sf-table-head-danger">
                  <tr>
                    <th className="px-3 py-1.5 text-left sf-table-head-cell-danger">Host</th>
                    <th className="px-3 py-1.5 text-right sf-table-head-cell-danger">Blocked</th>
                    <th className="px-3 py-1.5 text-right sf-table-head-cell-danger">Threshold</th>
                    <th className="px-3 py-1.5 text-right sf-table-head-cell-danger">Removed</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedHosts.map((b: BlockedHostEntry) => (
                    <tr key={b.host} className="border-b sf-border-danger-soft">
                      <td className="px-3 py-1.5 font-mono">{b.host}</td>
                      <td className="px-3 py-1.5 text-right font-mono sf-status-text-danger">{b.blocked_count}</td>
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
        <div className="w-80 shrink-0 overflow-y-auto border-l sf-border-default p-4">
          <h3 className="mb-3 text-sm font-semibold sf-text-primary">
            Job Detail
          </h3>

          <dl className="mb-4 space-y-2 sf-text-caption">
            <div>
              <dt className="sf-text-muted">ID</dt>
              <dd className="font-mono sf-text-primary">{selectedJob.id}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="sf-text-muted">Lane</dt>
                <dd className="font-mono">{selectedJob.lane}</dd>
              </div>
              <div>
                <dt className="sf-text-muted">Status</dt>
                <dd>
                  <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${queueStatusBadgeClass(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                </dd>
              </div>
            </div>
            <div>
              <dt className="sf-text-muted">Host</dt>
              <dd className="font-mono">{selectedJob.host}</dd>
            </div>
            <div>
              <dt className="sf-text-muted">URL</dt>
              <dd className="break-all font-mono sf-text-primary">{selectedJob.url}</dd>
            </div>
            {selectedJob.query && (
              <div>
                <dt className="sf-text-muted">Query</dt>
                <dd className="font-mono sf-text-primary">{selectedJob.query}</dd>
              </div>
            )}
            <div>
              <dt className="sf-text-muted">Reason</dt>
              <dd className="sf-text-primary">{selectedJob.reason}</dd>
            </div>
            {selectedJob.field_targets.length > 0 && (
              <div>
                <dt className="sf-text-muted">Field Targets</dt>
                <dd className="flex flex-wrap gap-1 mt-0.5">
                  {selectedJob.field_targets.map((f) => (
                    <span key={f} className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-info">
                      {f}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {selectedJob.cooldown_until && (
              <div>
                <dt className="sf-text-muted">Cooldown Until</dt>
                <dd className="font-mono sf-status-text-warning" title={selectedJob.cooldown_until}>
                  {timeUntil(selectedJob.cooldown_until)}
                </dd>
              </div>
            )}
            <div>
              <dt className="sf-text-muted">Created</dt>
              <dd className="font-mono sf-text-subtle" title={selectedJob.created_at}>
                {relativeTime(selectedJob.created_at)}
              </dd>
            </div>
          </dl>

          {selectedJob.transitions.length > 0 && (
            <>
              <h4 className="mb-2 sf-text-caption font-semibold uppercase tracking-wide sf-text-muted">
                Transition History
              </h4>
              <div className="space-y-2 mb-4">
                {selectedJob.transitions.map((t, i) => (
                  <div key={`${t.ts}-${i}`} className="flex items-start gap-2 sf-text-caption">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full sf-marker-info" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <span className={`px-1 py-0.5 rounded sf-text-caption ${queueStatusBadgeClass(t.from_status)}`}>
                          {t.from_status}
                        </span>
                        <span className="sf-text-subtle">{'\u2192'}</span>
                        <span className={`px-1 py-0.5 rounded sf-text-caption ${queueStatusBadgeClass(t.to_status)}`}>
                          {t.to_status}
                        </span>
                      </div>
                      {t.reason && (
                        <div className="mt-0.5 sf-text-caption sf-text-muted">{t.reason}</div>
                      )}
                      <div className="mt-0.5 font-mono sf-text-caption sf-text-subtle" title={t.ts}>{relativeTime(t.ts)}</div>
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
              className="w-full py-2 text-center sf-text-caption sf-action-button transition-colors"
            >
              View Documents
            </button>
          )}
        </div>
      )}
    </div>
  );
}
