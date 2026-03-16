import { useMemo, useState } from 'react';
import type { QueueJobRow } from '../../types';
import { queueStatusBadgeClass, truncateUrl, timeUntil } from '../../helpers';
import { relativeTime } from '../../../../utils/formatting';

interface DrawerQueueTabProps {
  jobs: QueueJobRow[];
}

export function DrawerQueueTab({ jobs }: DrawerQueueTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const laneCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    for (const j of jobs) {
      laneCounts[j.lane] = (laneCounts[j.lane] ?? 0) + 1;
      statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1;
    }
    return { laneCounts, statusCounts };
  }, [jobs]);

  if (jobs.length === 0) {
    return <div className="text-xs sf-text-subtle text-center py-4">No queue jobs</div>;
  }

  return (
    <div className="space-y-3">
      {/* Lane summary strip */}
      <div className="sf-surface-elevated p-2 text-xs space-y-2">
        <div className="flex gap-1 flex-wrap">
          {Object.entries(summary.laneCounts).map(([lane, count]) => (
            <span key={lane} className="sf-chip-neutral px-1.5 py-0.5 rounded">{lane} &times;{count}</span>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(summary.statusCounts).map(([status, count]) => (
            <span key={status} className={`px-1.5 py-0.5 rounded ${queueStatusBadgeClass(status)}`}>{status} &times;{count}</span>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="sf-table-shell overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="sf-table-head">
              <th className="sf-table-head-cell text-left px-1.5 py-1">Status</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Lane</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">URL</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Reason</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Targets</th>
              <th className="sf-table-head-cell text-left px-1.5 py-1">Cooldown</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const isExpanded = expandedId === j.id;
              return (
                <tr key={j.id} className={`sf-table-row ${isExpanded ? 'sf-table-row-active' : ''}`}>
                  <td className="px-1.5 py-1" colSpan={isExpanded ? 6 : 1}>
                    {isExpanded ? (
                      <div className="space-y-1.5">
                        <button type="button" className="text-left" onClick={() => setExpandedId(null)}>
                          <span className={`px-1 py-0.5 rounded ${queueStatusBadgeClass(j.status)} ${j.status === 'running' ? 'animate-pulse' : ''}`}>{j.status}</span>
                          <span className="ml-2 sf-chip-neutral px-1 py-0.5 rounded">{j.lane}</span>
                        </button>
                        <div className="font-mono sf-text-primary break-all">{j.url}</div>
                        {j.reason && <div className="sf-text-subtle italic">{j.reason}</div>}
                        {j.field_targets.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {j.field_targets.map((ft) => (
                              <span key={ft} className="sf-chip-neutral px-1 py-0.5 rounded sf-text-nano font-mono">{ft}</span>
                            ))}
                          </div>
                        )}
                        {j.cooldown_until && <div className="sf-text-muted">Cooldown: {timeUntil(j.cooldown_until)}</div>}
                        <div className="sf-text-muted">Created {relativeTime(j.created_at)}</div>
                        {/* Transitions timeline */}
                        {j.transitions.length > 0 && (
                          <div className="flex items-center gap-1">
                            {j.transitions.map((t, idx) => (
                              <div key={idx} className="flex items-center gap-0.5 sf-text-nano">
                                <span className="sf-text-subtle">{t.from_status}</span>
                                <span className="sf-text-muted">&rarr;</span>
                                <span className="sf-text-primary">{t.to_status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {j.query && <div className="font-mono sf-text-muted sf-text-nano">Query: {j.query}</div>}
                      </div>
                    ) : (
                      <span className={`px-1 py-0.5 rounded ${queueStatusBadgeClass(j.status)} ${j.status === 'running' ? 'animate-pulse' : ''}`}>{j.status}</span>
                    )}
                  </td>
                  {!isExpanded && (
                    <>
                      <td className="px-1.5 py-1"><span className="sf-chip-neutral px-1 py-0.5 rounded">{j.lane}</span></td>
                      <td className="px-1.5 py-1 font-mono sf-text-muted" title={j.url}>{truncateUrl(j.url, 30)}</td>
                      <td className="px-1.5 py-1 sf-text-subtle italic max-w-[6rem] truncate" title={j.reason}>{j.reason || '-'}</td>
                      <td className="px-1.5 py-1">
                        {j.field_targets.length > 0 ? (
                          <div className="flex gap-0.5 flex-wrap">
                            {j.field_targets.slice(0, 3).map((ft) => (
                              <span key={ft} className="sf-chip-neutral px-0.5 py-0 rounded sf-text-nano font-mono">{ft}</span>
                            ))}
                            {j.field_targets.length > 3 && <span className="sf-text-muted sf-text-nano">+{j.field_targets.length - 3}</span>}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-1.5 py-1 sf-text-muted whitespace-nowrap">{j.cooldown_until ? timeUntil(j.cooldown_until) : '-'}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
